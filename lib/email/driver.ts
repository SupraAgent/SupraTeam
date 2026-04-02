import type { MailDriver, EmailProvider } from "./types";
import { GmailDriver } from "./gmail";
import { ImapDriver } from "./imap-driver";
import { decryptToken } from "@/lib/crypto";
import { createSupabaseAdmin } from "@/lib/supabase";
import { serverCache, TTL } from "./server-cache";

type ConnectionRecord = {
  id: string;
  provider: EmailProvider;
  email: string;
  access_token_encrypted: string;
  refresh_token_encrypted: string | null;
  token_expires_at: string | null;
};

// ── Driver pool ───────────────────────────────────────────────
// Cache GmailDriver instances to reuse OAuth2 clients and HTTP/2 connections.
// The OAuth2 client handles token refresh internally (via auth.on("tokens")),
// so pooled drivers stay valid as long as the connection isn't revoked.
// 30s TTL is short enough to limit token exposure in memory (security tradeoff)
// but long enough to avoid re-creation during a single page load (perf win).
const DRIVER_POOL_TTL = 30_000;
const DRIVER_POOL_MAX = 50;
const driverPool = new Map<string, { driver: MailDriver; createdAt: number }>();

function getPooledDriver(connectionId: string): MailDriver | null {
  const entry = driverPool.get(connectionId);
  if (!entry) return null;
  if (Date.now() - entry.createdAt > DRIVER_POOL_TTL) {
    driverPool.delete(connectionId);
    return null;
  }
  return entry.driver;
}

function poolDriver(connectionId: string, driver: MailDriver): void {
  // LRU eviction if over max size
  if (driverPool.size >= DRIVER_POOL_MAX) {
    const oldest = driverPool.keys().next().value;
    if (oldest) driverPool.delete(oldest);
  }
  driverPool.set(connectionId, { driver, createdAt: Date.now() });
}

/**
 * Create a MailDriver for a specific email connection.
 * Decrypts stored tokens and instantiates the correct driver.
 */
export function createDriverFromConnection(conn: ConnectionRecord, userId?: string): MailDriver {
  const accessToken = decryptToken(conn.access_token_encrypted);
  const refreshToken = conn.refresh_token_encrypted
    ? decryptToken(conn.refresh_token_encrypted)
    : "";

  switch (conn.provider) {
    case "gmail": {
      const clientId = process.env.GOOGLE_CLIENT_ID;
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
      if (!clientId || !clientSecret) {
        throw new Error("Gmail integration not configured. Contact your administrator.");
      }
      // Pass expiry_date so the OAuth2 client proactively refreshes before token expires,
      // avoiding 401 errors and token refresh race conditions
      const expiryDate = conn.token_expires_at
        ? new Date(conn.token_expires_at).getTime()
        : undefined;
      const driver = new GmailDriver({
        accessToken,
        refreshToken,
        clientId,
        clientSecret,
        expiryDate,
      });
      driver.connectionId = conn.id;
      driver.userId = userId ?? null;
      return driver;
    }
    case "gmail_app_password": {
      // App password stored in access_token_encrypted; no refresh token needed
      const driver = new ImapDriver({
        email: conn.email,
        appPassword: accessToken,
      });
      driver.connectionId = conn.id;
      driver.userId = userId ?? null;
      return driver;
    }
    case "outlook":
      throw new Error("Outlook driver not yet implemented. Coming in v2.");
    default:
      throw new Error(`Unknown provider: ${conn.provider}`);
  }
}

/**
 * Get the user's default (or specified) email connection and build a driver.
 */
export async function getDriverForUser(
  userId: string,
  connectionId?: string
): Promise<{ driver: MailDriver; connection: ConnectionRecord }> {
  // Cache only connection metadata (NOT encrypted tokens) to reduce heap exposure.
  // Encrypted tokens sitting in a Map for 60s expands blast radius of memory dumps.
  // We always fetch tokens from DB — decryption is cheap, security is not.
  const cacheKey = `driver:${userId}:${connectionId ?? "default"}`;
  const cachedMeta = serverCache.get<{ id: string; provider: EmailProvider; email: string; token_expires_at: string | null }>(cacheKey);

  const admin = createSupabaseAdmin();
  if (!admin) throw new Error("Supabase not configured");

  // If we have cached metadata, try driver pool first (avoids DB token fetch + OAuth2 init)
  if (cachedMeta) {
    const pooled = getPooledDriver(cachedMeta.id);
    if (pooled) {
      // Still need connection record for callers that use connection.email etc
      const conn: ConnectionRecord = {
        ...cachedMeta,
        access_token_encrypted: "", // Not needed — driver already has decrypted tokens
        refresh_token_encrypted: null,
      };
      return { driver: pooled, connection: conn };
    }

    const { data: tokenData } = await admin
      .from("crm_email_connections")
      .select("access_token_encrypted, refresh_token_encrypted, token_expires_at")
      .eq("id", cachedMeta.id)
      .eq("user_id", userId)
      .limit(1)
      .single();

    if (tokenData) {
      const conn: ConnectionRecord = { ...cachedMeta, ...tokenData };
      const driver = createDriverFromConnection(conn, userId);
      poolDriver(conn.id, driver);
      return { driver, connection: conn };
    }
    // Cache entry stale — fall through to full query
    serverCache.delete(cacheKey);
  }

  let query = admin
    .from("crm_email_connections")
    .select("id, provider, email, access_token_encrypted, refresh_token_encrypted, token_expires_at")
    .eq("user_id", userId);

  if (connectionId) {
    query = query.eq("id", connectionId);
  } else {
    query = query.eq("is_default", true);
  }

  const { data, error } = await query.limit(1).single();

  if (error || !data) {
    console.warn(`[email/driver] No default connection for user ${userId}, falling back to any connection`);
    const { data: fallback, error: fbErr } = await admin
      .from("crm_email_connections")
      .select("id, provider, email, access_token_encrypted, refresh_token_encrypted, token_expires_at")
      .eq("user_id", userId)
      .order("connected_at", { ascending: true })
      .limit(1)
      .single();

    if (fbErr || !fallback) {
      throw new Error("No email connection found. Connect your Gmail in Settings.");
    }

    const conn = fallback as ConnectionRecord;
    serverCache.set(cacheKey, { id: conn.id, provider: conn.provider, email: conn.email, token_expires_at: conn.token_expires_at }, TTL.DRIVER);
    const driver = createDriverFromConnection(conn, userId);
    poolDriver(conn.id, driver);
    return { driver, connection: conn };
  }

  const conn = data as ConnectionRecord;
  serverCache.set(cacheKey, { id: conn.id, provider: conn.provider, email: conn.email, token_expires_at: conn.token_expires_at }, TTL.DRIVER);
  const driver = createDriverFromConnection(conn, userId);
  poolDriver(conn.id, driver);
  return { driver, connection: conn };
}

/**
 * After using the driver, persist any refreshed tokens back to the database.
 * Persists both access token and (optionally) a rotated refresh token.
 * Retries once on failure to avoid silent token loss.
 */
export async function updateConnectionTokens(
  connectionId: string,
  userId: string,
  accessToken: string,
  expiresAt?: Date,
  refreshToken?: string
): Promise<void> {
  const admin = createSupabaseAdmin();
  if (!admin) return;

  const { encryptToken } = await import("@/lib/crypto");

  const updateData: Record<string, unknown> = {
    access_token_encrypted: encryptToken(accessToken),
    token_expires_at: expiresAt?.toISOString() ?? null,
    last_sync_at: new Date().toISOString(),
  };

  // Persist rotated refresh token if Google sent a new one
  if (refreshToken) {
    updateData.refresh_token_encrypted = encryptToken(refreshToken);
  }

  const { error } = await admin
    .from("crm_email_connections")
    .update(updateData)
    .eq("id", connectionId)
    .eq("user_id", userId);

  // Retry once on failure — losing a refreshed token permanently breaks the connection
  if (error) {
    console.error("[email/driver] Token persistence failed, retrying:", error.message);
    await new Promise((r) => setTimeout(r, 500));
    const { error: retryErr } = await admin
      .from("crm_email_connections")
      .update(updateData)
      .eq("id", connectionId)
      .eq("user_id", userId);
    if (retryErr) {
      console.error("[email/driver] Token persistence retry failed:", retryErr.message);
    }
  }
}
