/**
 * POST /api/auth/telegram-qr
 * Initiate QR code login (no auth required -- this IS the login flow)
 * Returns: { ok: true, qrUrl: string, loginToken: string, expiresAt: number }
 *
 * GET /api/auth/telegram-qr?token=<loginToken>
 * Poll for QR login completion
 * Returns: { status: 'pending' } | { status: 'confirmed', access_token, refresh_token }
 */

import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase";
import {
  createTgClient,
  requestQRLogin,
  buildQRUrl,
  encryptSession,
} from "@/lib/telegram-client";
import { Api } from "telegram";
import type { TelegramClient } from "telegram";
import crypto from "crypto";

type QREntry = {
  client: TelegramClient;
  expiresAt: number;
  confirmed: boolean;
  tgUser?: { id: number; firstName: string; lastName?: string; username?: string };
};

// Pending QR sessions (keyed by a random login token, not user ID since we have no auth)
const qrLogins = new Map<string, QREntry>();

// Cleanup
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of qrLogins) {
    if (now > entry.expiresAt) {
      entry.client.disconnect().catch(() => {});
      qrLogins.delete(key);
    }
  }
}, 60_000);

export async function POST() {
  // Fail fast if Telegram API credentials aren't configured
  if (!parseInt(process.env.TELEGRAM_API_ID || "0", 10) || !process.env.TELEGRAM_API_HASH) {
    return NextResponse.json(
      { error: "Telegram API not configured. Set TELEGRAM_API_ID and TELEGRAM_API_HASH." },
      { status: 503 }
    );
  }

  try {
    const client = createTgClient();
    await client.connect();

    const { token, expiresAt } = await requestQRLogin(client);
    const qrUrl = buildQRUrl(token);
    const loginToken = crypto.randomBytes(24).toString("hex");

    // Listen for login confirmation
    client.addEventHandler(async (update: Api.TypeUpdate) => {
      if (update instanceof Api.UpdateLoginToken) {
        try {
          const result = await client.invoke(
            new Api.auth.ExportLoginToken({
              apiId: parseInt(process.env.TELEGRAM_API_ID || "0", 10),
              apiHash: process.env.TELEGRAM_API_HASH || "",
              exceptIds: [],
            })
          );

          if (result instanceof Api.auth.LoginTokenSuccess) {
            const authResult = result.authorization;
            if (authResult instanceof Api.auth.Authorization) {
              const tgUser = authResult.user as Api.User;
              const entry = qrLogins.get(loginToken);
              if (entry) {
                entry.confirmed = true;
                entry.tgUser = {
                  id: Number(tgUser.id),
                  firstName: tgUser.firstName || "",
                  lastName: tgUser.lastName,
                  username: tgUser.username,
                };
              }
            }
          }
        } catch (err) {
          console.error("[auth/telegram-qr] token update error:", err);
        }
      }
    });

    qrLogins.set(loginToken, {
      client,
      expiresAt: expiresAt * 1000,
      confirmed: false,
    });

    return NextResponse.json({
      ok: true,
      qrUrl,
      loginToken,
      expiresAt,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "QR login failed";
    console.error("[auth/telegram-qr]", message);

    if (message.includes("API ID") || message.includes("API_ID") || message.includes("api_id") || message.includes("cannot be empty")) {
      return NextResponse.json({ error: "Telegram API not configured. Set TELEGRAM_API_ID and TELEGRAM_API_HASH." }, { status: 503 });
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const admin = createSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const loginToken = searchParams.get("token");

  if (!loginToken) {
    return NextResponse.json({ error: "Missing token parameter" }, { status: 400 });
  }

  const entry = qrLogins.get(loginToken);
  if (!entry) {
    return NextResponse.json({ status: "expired" });
  }

  if (!entry.confirmed || !entry.tgUser) {
    return NextResponse.json({ status: "pending" });
  }

  // Confirmed -- create Supabase session
  const tgId = entry.tgUser.id;
  const email = `tg_${tgId}@supracrm.tg`;
  const botToken = process.env.TELEGRAM_BOT_TOKEN || "mtproto_auth";
  const password = `tg_${tgId}_${botToken.slice(0, 16)}`;
  const displayName = [entry.tgUser.firstName, entry.tgUser.lastName].filter(Boolean).join(" ") || `User ${tgId}`;

  const userMetadata = {
    telegram_id: tgId,
    telegram_username: entry.tgUser.username ?? null,
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
      console.error("[auth/telegram-qr] create user error:", createError);
      return NextResponse.json({ error: "Failed to create account" }, { status: 500 });
    }

    const { data: newSignIn, error: newSignInError } = await admin.auth.signInWithPassword({
      email,
      password,
    });

    if (newSignInError || !newSignIn.session) {
      return NextResponse.json({ error: "Failed to sign in" }, { status: 500 });
    }

    session = newSignIn.session;

    await admin.from("profiles").upsert(
      {
        id: newUser.user.id,
        display_name: displayName,
        avatar_url: null,
        telegram_id: tgId,
      },
      { onConflict: "id" }
    );
  } else if (signInResult.user) {
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

  if (!session) {
    return NextResponse.json({ error: "Failed to create session" }, { status: 500 });
  }

  // Save Telegram client session for later CRM use
  const encryptedSession = encryptSession(entry.client);

  await admin.from("tg_client_sessions").upsert(
    {
      user_id: session.user.id,
      session_encrypted: encryptedSession,
      phone_number_hash: "qr_login",
      phone_last4: null,
      telegram_user_id: tgId,
      is_active: true,
      connected_at: new Date().toISOString(),
      last_used_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  // Audit log
  await admin.from("tg_client_audit_log").insert({
    user_id: session.user.id,
    action: "login",
    target_type: "user",
    target_id: String(tgId),
    metadata: { method: "qr", username: entry.tgUser.username },
  });

  // Cleanup
  qrLogins.delete(loginToken);

  return NextResponse.json({
    status: "confirmed",
    ok: true,
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  });
}
