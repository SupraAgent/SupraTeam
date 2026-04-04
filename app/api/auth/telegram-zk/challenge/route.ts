/**
 * POST /api/auth/telegram-zk/challenge
 *
 * Issues a single-use, IP-bound challenge for the zero-knowledge Telegram login flow.
 * The client must return this challenge (with matching nonce) after completing
 * browser-side GramJS authentication.
 */

import { NextResponse } from "next/server";
import { createChallenge } from "@/lib/telegram-zk-challenges";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(request: Request) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";

  // Rate limit: 10 challenges per IP per 15 min
  const rl = rateLimit(`zk-challenge:${ip}`, { max: 10, windowSec: 900 });
  if (rl) return rl;

  const { challengeId, nonce, expiresAt } = createChallenge(ip);

  return NextResponse.json({ challengeId, nonce, expiresAt });
}
