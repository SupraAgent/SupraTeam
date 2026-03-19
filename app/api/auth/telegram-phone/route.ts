/**
 * POST /api/auth/telegram-phone
 * Step 1: Send phone code via GramJS (no auth required -- this IS the login flow)
 *
 * Body: { phone: string }
 * Returns: { ok: true, phoneCodeHash: string, phoneLast4: string }
 */

import { NextResponse } from "next/server";
import { createTgClient, sendPhoneCode, phoneLast4 } from "@/lib/telegram-client";
import { pendingPhoneLogins, phoneKey } from "@/lib/telegram-login-store";

export async function POST(request: Request) {
  // Fail fast if Telegram API credentials aren't configured
  if (!parseInt(process.env.TELEGRAM_API_ID || "0", 10) || !process.env.TELEGRAM_API_HASH) {
    return NextResponse.json(
      { error: "Telegram API not configured. Set TELEGRAM_API_ID and TELEGRAM_API_HASH." },
      { status: 503 }
    );
  }

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

  // Prevent duplicate sends for same phone
  const key = phoneKey(phone);
  const existing = pendingPhoneLogins.get(key);
  if (existing && Date.now() < existing.expiresAt - 4 * 60 * 1000) {
    // Less than 1 minute since last send -- return existing hash
    return NextResponse.json({
      ok: true,
      phoneCodeHash: existing.phoneCodeHash,
      phoneLast4: phoneLast4(phone),
    });
  }

  try {
    // Clean up any existing client for this phone
    if (existing) {
      existing.client.disconnect().catch(() => {});
      pendingPhoneLogins.delete(key);
    }

    const client = createTgClient();
    await client.connect();

    const { phoneCodeHash } = await sendPhoneCode(client, phone);

    pendingPhoneLogins.set(key, {
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
    console.error("[auth/telegram-phone]", message);

    if (message.includes("PHONE_NUMBER_INVALID")) {
      return NextResponse.json({ error: "Invalid phone number format" }, { status: 400 });
    }
    if (message.includes("PHONE_NUMBER_FLOOD")) {
      return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
    }
    if (message.includes("API ID") || message.includes("API_ID") || message.includes("api_id") || message.includes("cannot be empty")) {
      return NextResponse.json({ error: "Telegram API not configured. Set TELEGRAM_API_ID and TELEGRAM_API_HASH." }, { status: 503 });
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
