import type { MailDriver, EmailProvider } from "./types";
import { GmailDriver } from "./gmail";
import { decryptToken } from "@/lib/crypto";
import { createSupabaseAdmin } from "@/lib/supabase";
import { serverCache, TTL } from "./server-cache";

type ConnectionRecord = {
  id: string;
  provider: EmailProvider;
  email: string;
  access_token_encrypted: string;
  refresh_token_encrypted: string;
  token_expires_at: string | null;
};

/**
 * Create a MailDriver for a specific email connection.
 * Decrypts stored tokens and instantiates the correct driver.
 */
export function createDriverFromConnection(conn: ConnectionRecord, userId?: string): MailDriver {
  const accessToken = decryptToken(conn.access_token_encrypted);
  const refreshToken = decryptToken(conn.refresh_token_encrypted);

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
  // Cache only the connection record (not the driver instance) to avoid stale token references.
  // The driver is lightweight to construct — the OAuth2 client handles token refresh internally.
  // Previously caching the driver caused race conditions where concurrent requests held
  // references to old driver instances with stale access tokens.
  const cacheKey = `driver:${userId}:${connectionId ?? "default"}`;
  const cachedConn = serverCache.get<ConnectionRecord>(cacheKey);

  if (cachedConn) {
    return {
      driver: createDriverFromConnection(cachedConn, userId),
      connection: cachedConn,
    };
  }

  const admin = createSupabaseAdmin();
  if (!admin) throw new Error("Supabase not configured");

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
    // Fallback: get any connection (log so we can detect multi-account confusion)
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
    serverCache.set(cacheKey, conn, TTL.DRIVER);
    return {
      driver: createDriverFromConnection(conn, userId),
      connection: conn,
    };
  }

  const conn = data as ConnectionRecord;
  serverCache.set(cacheKey, conn, TTL.DRIVER);
  return {
    driver: createDriverFromConnection(conn, userId),
    connection: conn,
  };
}

/**
 * After using the driver, persist any refreshed tokens back to the database.
 */
export async function updateConnectionTokens(
  connectionId: string,
  userId: string,
  accessToken: string,
  expiresAt?: Date
): Promise<void> {
  const admin = createSupabaseAdmin();
  if (!admin) return;

  const { encryptToken } = await import("@/lib/crypto");

  await admin
    .from("crm_email_connections")
    .update({
      access_token_encrypted: encryptToken(accessToken),
      token_expires_at: expiresAt?.toISOString() ?? null,
      last_sync_at: new Date().toISOString(),
    })
    .eq("id", connectionId)
    .eq("user_id", userId);
}
