/**
 * POST /api/auth/telegram-zk/verify
 *
 * Verifies a zero-knowledge Telegram login challenge and creates a Supabase session.
 *
 * The client has already authenticated with Telegram entirely in the browser (GramJS).
 * This endpoint validates the challenge/nonce, then creates or signs in a Supabase user
 * keyed on the Telegram user ID.
 *
 * Body: {
 *   challengeId: string,
 *   nonce: string,
 *   telegramUser: { id: number, firstName: string, lastName?: string, username?: string }
 * }
 *
 * Returns: { access_token: string, refresh_token: string }
 */

import { NextResponse } from "next/server";
import { validateChallenge } from "@/lib/telegram-zk-challenges";
import { getOrCreateSupabaseSession } from "@/lib/telegram-login-store";
import { createSupabaseAdmin } from "@/lib/supabase";
import { rateLimit } from "@/lib/rate-limit";

interface VerifyBody {
  challengeId?: string;
  nonce?: string;
  telegramUser?: {
    id?: number;
    firstName?: string;
    lastName?: string;
    username?: string;
  };
}

export async function POST(request: Request) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";

  // Rate limit: 5 verify attempts per IP per 15 min
  const rl = rateLimit(`zk-verify:${ip}`, { max: 5, windowSec: 900 });
  if (rl) return rl;

  let body: VerifyBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { challengeId, nonce, telegramUser } = body;

  // Validate required fields
  if (!challengeId || !nonce) {
    return NextResponse.json({ error: "Missing challengeId or nonce" }, { status: 400 });
  }

  if (!telegramUser?.id || !telegramUser.firstName) {
    return NextResponse.json(
      { error: "Missing telegramUser (id and firstName required)" },
      { status: 400 }
    );
  }

  // Validate challenge (single-use, IP-bound, TTL-checked)
  if (!validateChallenge(challengeId, nonce, ip)) {
    return NextResponse.json(
      { error: "Invalid or expired challenge. Please try again." },
      { status: 403 }
    );
  }

  // Create or sign in Supabase user
  const admin = createSupabaseAdmin();
  if (!admin) {
    return NextResponse.json(
      { error: "Server configuration error" },
      { status: 500 }
    );
  }

  const session = await getOrCreateSupabaseSession(admin, {
    id: telegramUser.id,
    firstName: telegramUser.firstName,
    lastName: telegramUser.lastName,
    username: telegramUser.username,
  });

  if (!session) {
    return NextResponse.json(
      { error: "Failed to create session" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  });
}
