/**
 * POST /api/auth/telegram-phone/verify
 * Step 2: Verify code, authenticate Telegram user, create/sign-in Supabase user
 *
 * Body: { phone: string, code: string, phoneCodeHash?: string, password?: string }
 * Returns: { ok: true, access_token, refresh_token }
 */

import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase";
import {
  signInWithCode,
  signInWith2FA,
  encryptSession,
  hashPhone,
  phoneLast4,
} from "@/lib/telegram-client";
import { pendingLogins } from "../route";

/** Create or sign-in a Supabase user from Telegram user data */
async function getOrCreateSupabaseSession(
  admin: NonNullable<ReturnType<typeof createSupabaseAdmin>>,
  tgUser: { id: number | bigint; firstName?: string; lastName?: string; username?: string; phone?: string }
) {
  const tgId = Number(tgUser.id);
  const email = `tg_${tgId}@supracrm.tg`;
  const botToken = process.env.TELEGRAM_BOT_TOKEN || "mtproto_auth";
  const password = `tg_${tgId}_${botToken.slice(0, 16)}`;
  const displayName = [tgUser.firstName, tgUser.lastName].filter(Boolean).join(" ") || `User ${tgId}`;

  const userMetadata = {
    telegram_id: tgId,
    telegram_username: tgUser.username ?? null,
    display_name: displayName,
    avatar_url: null,
  };

  // Try sign in first
  const { data: signInResult, error: signInError } = await admin.auth.signInWithPassword({
    email,
    password,
  });

  let session = signInResult?.session;

  if (signInError) {
    // Create new user
    const { data: newUser, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: userMetadata,
    });

    if (createError) {
      console.error("[auth/telegram-phone] create user error:", createError);
      return null;
    }

    const { data: newSignIn, error: newSignInError } = await admin.auth.signInWithPassword({
      email,
      password,
    });

    if (newSignInError || !newSignIn.session) {
      console.error("[auth/telegram-phone] sign in after create error:", newSignInError);
      return null;
    }

    session = newSignIn.session;

    // Create profile
    await admin.from("profiles").upsert(
      {
        id: newUser.user.id,
        display_name: displayName,
        avatar_url: null,
        telegram_id: tgId,
      },
      { onConflict: "id" }
    );
  } else {
    // Update existing user metadata and profile
    if (signInResult.user) {
      await admin.auth.admin.updateUserById(signInResult.user.id, {
        user_metadata: userMetadata,
      });

      await admin.from("profiles").upsert(
        {
          id: signInResult.user.id,
          display_name: displayName,
          avatar_url: null,
          telegram_id: tgId,
        },
        { onConflict: "id" }
      );
    }
  }

  return session;
}

export async function POST(request: Request) {
  const admin = createSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }

  let body: { phone?: string; code?: string; phoneCodeHash?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const phone = body.phone?.trim();
  if (!phone) {
    return NextResponse.json({ error: "Phone number required" }, { status: 400 });
  }

  const key = phone.replace(/\D/g, "");
  const pending = pendingLogins.get(key);
  if (!pending) {
    return NextResponse.json(
      { error: "No pending login. Start over by sending a new code." },
      { status: 400 }
    );
  }

  if (Date.now() > pending.expiresAt) {
    pending.client.disconnect().catch(() => {});
    pendingLogins.delete(key);
    return NextResponse.json({ error: "Code expired. Please try again." }, { status: 400 });
  }

  const code = body.code?.trim();
  if (!code) {
    return NextResponse.json({ error: "Verification code required" }, { status: 400 });
  }

  const { client, phoneCodeHash } = pending;
  const hash = body.phoneCodeHash || phoneCodeHash;

  try {
    let tgUser;
    try {
      tgUser = await signInWithCode(client, phone, code, hash);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("SESSION_PASSWORD_NEEDED")) {
        if (!body.password) {
          return NextResponse.json(
            { error: "2FA_REQUIRED", message: "Two-factor authentication password required" },
            { status: 200 }
          );
        }
        tgUser = await signInWith2FA(client, body.password);
      } else {
        throw err;
      }
    }

    // Create Supabase session
    const session = await getOrCreateSupabaseSession(admin, {
      id: Number(tgUser.id),
      firstName: tgUser.firstName,
      lastName: tgUser.lastName,
      username: tgUser.username,
      phone: tgUser.phone,
    });

    if (!session) {
      return NextResponse.json({ error: "Failed to create session" }, { status: 500 });
    }

    // Also save the Telegram client session for later use (contacts, messages, etc.)
    const encryptedSession = encryptSession(client);
    const supabaseUserId = session.user.id;

    await admin.from("tg_client_sessions").upsert(
      {
        user_id: supabaseUserId,
        session_encrypted: encryptedSession,
        phone_number_hash: hashPhone(phone),
        phone_last4: phoneLast4(phone),
        telegram_user_id: Number(tgUser.id),
        is_active: true,
        connected_at: new Date().toISOString(),
        last_used_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

    // Audit log (non-critical)
    await admin.from("tg_client_audit_log").insert({
      user_id: supabaseUserId,
      action: "login",
      target_type: "user",
      target_id: String(tgUser.id),
      metadata: { method: "phone", username: tgUser.username },
    });

    // Clean up pending
    pendingLogins.delete(key);

    return NextResponse.json({
      ok: true,
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Verification failed";
    console.error("[auth/telegram-phone/verify]", message);

    if (message.includes("PHONE_CODE_INVALID")) {
      return NextResponse.json({ error: "Invalid code. Please check and try again." }, { status: 400 });
    }
    if (message.includes("PHONE_CODE_EXPIRED")) {
      pendingLogins.delete(key);
      return NextResponse.json({ error: "Code expired. Please start over." }, { status: 400 });
    }
    if (message.includes("PASSWORD_HASH_INVALID")) {
      return NextResponse.json({ error: "Invalid 2FA password." }, { status: 400 });
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
