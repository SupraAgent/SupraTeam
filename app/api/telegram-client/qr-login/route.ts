/**
 * POST /api/telegram-client/qr-login
 * Initiate QR code login flow (requires auth -- this is the post-login connect flow)
 *
 * Returns: { ok: true, qrUrl: string, expiresAt: number }
 *
 * GET /api/telegram-client/qr-login
 * Poll for QR login completion
 *
 * Returns: { status: 'pending' | 'confirmed', telegramUser?: {...} }
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import {
  createTgClient,
  requestQRLogin,
  buildQRUrl,
  encryptSession,
} from "@/lib/telegram-client";
import { pendingQRConnects } from "@/lib/telegram-login-store";
import { Api } from "telegram";

export async function POST(_request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user } = auth;

  try {
    // Clean up any existing QR session
    const existing = pendingQRConnects.get(user.id);
    if (existing) {
      existing.client.disconnect().catch(() => {});
      pendingQRConnects.delete(user.id);
    }

    const client = createTgClient();
    await client.connect();

    const { token, expiresAt } = await requestQRLogin(client);
    const qrUrl = buildQRUrl(token);

    // Add entry to map BEFORE registering event handler to avoid race condition
    pendingQRConnects.set(user.id, {
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
              const entry = pendingQRConnects.get(user.id);
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
          console.error("[tg-client/qr-login] token update error:", err);
        }
      }
    });

    return NextResponse.json({
      ok: true,
      qrUrl,
      expiresAt,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "QR login failed";
    console.error("[tg-client/qr-login]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(_request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user, admin } = auth;

  const entry = pendingQRConnects.get(user.id);
  if (!entry) {
    return NextResponse.json({ status: "expired" });
  }

  if (!entry.confirmed || !entry.tgUser) {
    return NextResponse.json({ status: "pending" });
  }

  // Confirmed! Save session
  try {
    const encryptedSession = encryptSession(entry.client);

    const { error: sessionError } = await admin.from("tg_client_sessions").upsert(
      {
        user_id: user.id,
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
      console.error("[tg-client/qr-login] failed to save session:", sessionError);
    }
  } catch (err) {
    console.error("[tg-client/qr-login] failed to encrypt/save session:", err);
  }

  // Audit log
  await admin.from("tg_client_audit_log").insert({
    user_id: user.id,
    action: "connect",
    target_type: "user",
    target_id: String(entry.tgUser.id),
    metadata: { method: "qr", username: entry.tgUser.username },
  }).then(({ error }) => {
    if (error) console.error("[tg-client/qr-login] audit log error:", error);
  });

  // Cleanup
  pendingQRConnects.delete(user.id);

  return NextResponse.json({
    status: "confirmed",
    telegramUser: entry.tgUser,
  });
}
