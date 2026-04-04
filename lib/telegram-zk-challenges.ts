/**
 * In-memory challenge store for zero-knowledge Telegram login.
 *
 * Flow:
 *   1. Client requests a challenge → server stores { nonce, ip, expiresAt }
 *   2. Client authenticates with Telegram via browser-side GramJS (server sees nothing)
 *   3. Client sends { challengeId, nonce, telegramUser } → server verifies & creates session
 *
 * The challenge is single-use and IP-bound to prevent replay and cross-session attacks.
 */

import { randomBytes } from "crypto";

interface Challenge {
  nonce: string;
  ip: string;
  expiresAt: number;
}

const challenges = new Map<string, Challenge>();

// Cleanup expired challenges every 30s
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of challenges) {
    if (now > entry.expiresAt) challenges.delete(key);
  }
}, 30_000);

/** Create a new challenge bound to the requester's IP. TTL = 120s. */
export function createChallenge(ip: string): { challengeId: string; nonce: string; expiresAt: number } {
  const challengeId = randomBytes(32).toString("hex");
  const nonce = randomBytes(32).toString("hex");
  const expiresAt = Date.now() + 120_000; // 2 minutes

  challenges.set(challengeId, { nonce, ip, expiresAt });

  return { challengeId, nonce, expiresAt };
}

/**
 * Consume a challenge. Returns true if valid, false otherwise.
 * The challenge is deleted after validation (single-use).
 */
export function validateChallenge(challengeId: string, nonce: string, ip: string): boolean {
  const entry = challenges.get(challengeId);
  if (!entry) return false;

  // Always delete — single use
  challenges.delete(challengeId);

  if (Date.now() > entry.expiresAt) return false;
  if (entry.nonce !== nonce) return false;
  if (entry.ip !== ip) return false;

  return true;
}
