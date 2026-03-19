/**
 * POST /api/telegram-client/qr-login
 * Initiate QR code login flow
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
import { Api } from "telegram";

// Pending QR sessions
const qrSessions = new Map<
  string,
  {
    client: ReturnType<typeof createTgClient>;
    expiresAt: number;
    confirmed: boolean;
    tgUser?: { id: number; firstName: string; lastName?: string; username?: string };
  }
>();

// Cleanup
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of qrSessions) {
    if (now > entry.expiresAt) {
      entry.client.disconnect().catch(() => {});
      qrSessions.delete(key);
    }
  }
}, 60_000);

export async function POST(_request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user } = auth;

  try {
    // Clean up any existing QR session
    const existing = qrSessions.get(user.id);
    if (existing) {
      existing.client.disconnect().catch(() => {});
      qrSessions.delete(user.id);
    }

    const client = createTgClient();
    await client.connect();

    const { token, expiresAt } = await requestQRLogin(client);
    const qrUrl = buildQRUrl(token);

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
              const entry = qrSessions.get(user.id);
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

    qrSessions.set(user.id, {
      client,
      expiresAt: expiresAt * 1000,
      confirmed: false,
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

  const entry = qrSessions.get(user.id);
  if (!entry) {
    return NextResponse.json({ status: "expired" });
  }

  if (!entry.confirmed || !entry.tgUser) {
    return NextResponse.json({ status: "pending" });
  }

  // Confirmed! Save session
  const encryptedSession = encryptSession(entry.client);

  await admin.from("tg_client_sessions").upsert(
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

  // Audit log
  await admin.from("tg_client_audit_log").insert({
    user_id: user.id,
    action: "connect",
    target_type: "user",
    target_id: String(entry.tgUser.id),
    metadata: { method: "qr", username: entry.tgUser.username },
  });

  // Cleanup
  qrSessions.delete(user.id);

  return NextResponse.json({
    status: "confirmed",
    telegramUser: entry.tgUser,
  });
}
