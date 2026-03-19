/**
 * POST /api/telegram-client/connect
 * Step 1: Send phone code to user's Telegram
 *
 * Body: { phone: string }
 * Returns: { ok: true, phoneCodeHash: string }
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import {
  createTgClient,
  sendPhoneCode,
  hashPhone,
  phoneLast4,
  encryptSession,
} from "@/lib/telegram-client";

// Temporary storage for pending connections (phone code flow)
// In production, use Redis. For internal tool, in-memory is fine.
const pendingConnections = new Map<
  string,
  { client: ReturnType<typeof createTgClient>; phone: string; phoneCodeHash: string; expiresAt: number }
>();

// Cleanup expired entries every minute
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of pendingConnections) {
    if (now > entry.expiresAt) {
      entry.client.disconnect().catch(() => {});
      pendingConnections.delete(key);
    }
  }
}, 60_000);

// Export for use by verify-code route
export { pendingConnections };

export async function POST(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user } = auth;

  let body: { phone?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const phone = body.phone?.trim();
  if (!phone || phone.length < 7) {
    return NextResponse.json(
      { error: "Valid phone number required (include country code, e.g. +1234567890)" },
      { status: 400 }
    );
  }

  try {
    const client = createTgClient();
    await client.connect();

    const { phoneCodeHash } = await sendPhoneCode(client, phone);

    // Store pending connection (5 min expiry)
    pendingConnections.set(user.id, {
      client,
      phone,
      phoneCodeHash,
      expiresAt: Date.now() + 5 * 60 * 1000,
    });

    return NextResponse.json({
      ok: true,
      phoneCodeHash,
      phoneLast4: phoneLast4(phone),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to send code";
    console.error("[tg-client/connect]", message);

    if (message.includes("PHONE_NUMBER_INVALID")) {
      return NextResponse.json({ error: "Invalid phone number format" }, { status: 400 });
    }
    if (message.includes("PHONE_NUMBER_FLOOD")) {
      return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
