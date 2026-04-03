/**
 * @deprecated LEGACY — runs GramJS server-side, breaking zero-knowledge guarantee.
 * Sessions created via this route use server-side encryption (encryption_method='server').
 * Migrate to client-side auth flow (TelegramProvider + browser GramJS) when possible.
 *
 * POST /api/auth/telegram-qr
 * Initiate QR code login (no auth required -- this IS the login flow)
 * Returns: { ok: true, qrUrl: string, loginToken: string, expiresAt: number }
 *
 * GET /api/auth/telegram-qr?token=<loginToken>
 * Poll for QR login completion
 * Returns: { status: 'pending' } | { status: 'confirmed', access_token, refresh_token }
 *
 * Note: Telegram QR login is authorized by the user's phone app, so 2FA
 * is handled on the mobile device -- no server-side 2FA prompt needed.
 */

import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase";
import {
  createTgClient,
  requestQRLogin,
  buildQRUrl,
  encryptSession,
} from "@/lib/telegram-client";
import {
  pendingQRLogins,
  getOrCreateSupabaseSession,
} from "@/lib/telegram-login-store";
import { Api } from "telegram";
import crypto from "crypto";

export async function POST() {
  // Legacy route — blocked in ALL environments unless explicitly opted in.
  if (process.env.ALLOW_LEGACY_TG_AUTH !== "true") {
    return NextResponse.json(
      { error: "Legacy Telegram auth is disabled. Use the zero-knowledge client flow." },
      { status: 410 }
    );
  }

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

    // Add entry to map BEFORE registering event handler to avoid race condition
    pendingQRLogins.set(loginToken, {
      client,
      expiresAt: expiresAt * 1000,
      confirmed: false,
    });

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
              const entry = pendingQRLogins.get(loginToken);
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
          console.error("[auth/telegram-qr] token update error:", err instanceof Error ? err.message : "unknown");
        }
      }
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

    return NextResponse.json({ error: "QR login failed" }, { status: 500 });
  }
}

export async function GET(request: Request) {
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

  const { searchParams } = new URL(request.url);
  const loginToken = searchParams.get("token");

  if (!loginToken) {
    return NextResponse.json({ error: "Missing token parameter" }, { status: 400 });
  }

  const entry = pendingQRLogins.get(loginToken);
  if (!entry) {
    return NextResponse.json({ status: "expired" });
  }

  if (!entry.confirmed || !entry.tgUser) {
    return NextResponse.json({ status: "pending" });
  }

  // Confirmed -- create Supabase session
  const session = await getOrCreateSupabaseSession(admin, entry.tgUser);

  if (!session) {
    return NextResponse.json({ error: "Failed to create session" }, { status: 500 });
  }

  // Save Telegram client session for later CRM use
  try {
    const encryptedSession = encryptSession(entry.client);

    const { error: sessionError } = await admin.from("tg_client_sessions").upsert(
      {
        user_id: session.user.id,
        session_encrypted: encryptedSession,
        phone_number_hash: "qr_login",
        phone_last4: null,
        telegram_user_id: entry.tgUser.id,
        is_active: true,
        connected_at: new Date().toISOString(),
        last_used_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

    if (sessionError) {
      console.error("[auth/telegram-qr] failed to save TG session:", sessionError);
    }
  } catch (err) {
    console.error("[auth/telegram-qr] failed to encrypt/save TG session:", err instanceof Error ? err.message : "unknown");
  }

  // Audit log (non-critical)
  await admin.from("tg_client_audit_log").insert({
    user_id: session.user.id,
    action: "login",
    target_type: "user",
    target_id: String(entry.tgUser.id),
    metadata: { method: "qr", username: entry.tgUser.username },
  }).then(({ error }) => {
    if (error) console.error("[auth/telegram-qr] audit log error:", error);
  });

  // Cleanup
  pendingQRLogins.delete(loginToken);

  return NextResponse.json({
    status: "confirmed",
    ok: true,
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  });
}
