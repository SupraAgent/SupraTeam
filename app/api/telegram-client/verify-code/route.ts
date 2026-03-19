/**
 * POST /api/telegram-client/verify-code
 * Step 2: Verify the Telegram code and complete login
 *
 * Body: { code: string, phoneCodeHash: string, password?: string }
 * Returns: { ok: true, telegramUser: { id, firstName, username } }
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import {
  signInWithCode,
  signInWith2FA,
  encryptSession,
  hashPhone,
  phoneLast4,
} from "@/lib/telegram-client";
import { pendingConnections } from "../connect/route";

export async function POST(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user, admin } = auth;

  let body: { code?: string; phoneCodeHash?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const pending = pendingConnections.get(user.id);
  if (!pending) {
    return NextResponse.json(
      { error: "No pending connection. Start over with /api/telegram-client/connect" },
      { status: 400 }
    );
  }

  if (Date.now() > pending.expiresAt) {
    pending.client.disconnect().catch(() => {});
    pendingConnections.delete(user.id);
    return NextResponse.json({ error: "Code expired. Please try again." }, { status: 400 });
  }

  const { client, phone, phoneCodeHash } = pending;
  const code = body.code?.trim();
  const hash = body.phoneCodeHash || phoneCodeHash;

  if (!code) {
    return NextResponse.json({ error: "Verification code required" }, { status: 400 });
  }

  try {
    let tgUser;
    try {
      tgUser = await signInWithCode(client, phone, code, hash);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("SESSION_PASSWORD_NEEDED")) {
        // 2FA required
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

    // Save encrypted session to DB
    const encryptedSession = encryptSession(client);

    await admin.from("tg_client_sessions").upsert(
      {
        user_id: user.id,
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

    // Audit log
    await admin.from("tg_client_audit_log").insert({
      user_id: user.id,
      action: "connect",
      target_type: "user",
      target_id: String(tgUser.id),
      metadata: { username: tgUser.username },
    });

    // Clean up pending
    pendingConnections.delete(user.id);

    return NextResponse.json({
      ok: true,
      telegramUser: {
        id: Number(tgUser.id),
        firstName: tgUser.firstName,
        lastName: tgUser.lastName,
        username: tgUser.username,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Verification failed";
    console.error("[tg-client/verify-code]", message);

    if (message.includes("PHONE_CODE_INVALID")) {
      return NextResponse.json({ error: "Invalid code. Please check and try again." }, { status: 400 });
    }
    if (message.includes("PHONE_CODE_EXPIRED")) {
      pendingConnections.delete(user.id);
      return NextResponse.json({ error: "Code expired. Please start over." }, { status: 400 });
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
