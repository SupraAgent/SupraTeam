/**
 * BYOK (Bring Your Own Key) helper for Anthropic API keys.
 *
 * Resolution order:
 *   1. User's own key from user_tokens (provider = "anthropic"), AES-256-GCM encrypted at rest
 *   2. System-wide ANTHROPIC_API_KEY env var (fallback for teams that share one key)
 *
 * Security:
 *   - Keys are decrypted server-side only, never sent to the client
 *   - Validated on save: must match sk-ant-api03-* format
 *   - Rate limiting is handled per-route (not here)
 *   - Prompt injection protections are in lib/claude-api.ts (sanitizeForPrompt, XML wrapping)
 */

import { createSupabaseAdmin } from "@/lib/supabase";
import { decryptToken } from "@/lib/crypto";

// In-memory cache: userId → { key, expiresAt }
// Short TTL (60s) so key rotation takes effect quickly
const cache = new Map<string, { key: string; expiresAt: number }>();
const CACHE_TTL_MS = 60_000;

/**
 * Validate Anthropic API key format.
 * Accepts: sk-ant-api03-* (current format) or sk-ant-* (older formats)
 */
export function isValidAnthropicKey(key: string): boolean {
  return /^sk-ant-[a-zA-Z0-9_-]{20,}$/.test(key.trim());
}

/**
 * Get the Anthropic API key for a given user.
 * Returns the user's own key if set, otherwise falls back to system env var.
 * Returns null if neither is available.
 */
export async function getAnthropicKey(userId: string): Promise<string | null> {
  // Check cache first
  const cached = cache.get(userId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.key;
  }

  // Try user's own key from user_tokens
  const userKey = await getUserAnthropicKey(userId);
  if (userKey) {
    cache.set(userId, { key: userKey, expiresAt: Date.now() + CACHE_TTL_MS });
    return userKey;
  }

  // Fall back to system-wide env var
  const systemKey = process.env.ANTHROPIC_API_KEY;
  if (systemKey) {
    return systemKey;
  }

  return null;
}

/**
 * Fetch and decrypt the user's Anthropic API key from user_tokens.
 * Returns null if not set or decryption fails.
 */
async function getUserAnthropicKey(userId: string): Promise<string | null> {
  try {
    const admin = createSupabaseAdmin();
    if (!admin) return null;

    const { data, error } = await admin
      .from("user_tokens")
      .select("encrypted_token")
      .eq("user_id", userId)
      .eq("provider", "anthropic")
      .single();

    if (error || !data?.encrypted_token) return null;

    const decrypted = decryptToken(data.encrypted_token);
    if (!decrypted || !isValidAnthropicKey(decrypted)) return null;

    return decrypted;
  } catch {
    return null;
  }
}

/**
 * Invalidate the cached key for a user (call after they save/delete their key).
 */
export function invalidateAnthropicKeyCache(userId: string): void {
  cache.delete(userId);
}
