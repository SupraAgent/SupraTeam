/**
 * @deprecated LEGACY — runs GramJS server-side, breaking zero-knowledge guarantee.
 * The server sees plaintext session + 2FA password in this flow.
 * Sessions created via this route use server-side encryption (encryption_method='server').
 * Migrate to client-side auth flow (TelegramProvider + browser GramJS) when possible.
 *
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
import {
  pendingPhoneLogins,
  phoneKey,
  getOrCreateSupabaseSession,
} from "@/lib/telegram-login-store";

export async function POST(request: Request) {
  // Legacy route — blocked in ALL environments unless explicitly opted in.
  if (process.env.ALLOW_LEGACY_TG_AUTH !== "true") {
    return NextResponse.json(
      { error: "Legacy Telegram auth is disabled. Use the zero-knowledge client flow." },
      { status: 410 }
    );
  }

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

  const key = phoneKey(phone);
  const pending = pendingPhoneLogins.get(key);
  if (!pending) {
    return NextResponse.json(
      { error: "No pending login. Start over by sending a new code." },
      { status: 400 }
    );
  }

  if (Date.now() > pending.expiresAt) {
    pending.client.disconnect().catch(() => {});
    pendingPhoneLogins.delete(key);
    return NextResponse.json({ error: "Code expired. Please try again." }, { status: 400 });
  }

  const code = body.code?.trim();
  if (!code) {
    return NextResponse.json({ error: "Verification code required" }, { status: 400 });
  }

  const { client, phoneCodeHash } = pending;
  // Always use server-stored phoneCodeHash — never allow client override
  const hash = phoneCodeHash;

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
    pendingPhoneLogins.delete(key);

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
      pendingPhoneLogins.delete(key);
      return NextResponse.json({ error: "Code expired. Please start over." }, { status: 400 });
    }
    if (message.includes("PASSWORD_HASH_INVALID")) {
      return NextResponse.json({ error: "Invalid 2FA password." }, { status: 400 });
    }

    return NextResponse.json({ error: "Verification failed" }, { status: 500 });
  }
}
