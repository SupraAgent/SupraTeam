import type { MailDriver, EmailProvider } from "./types";
import { GmailDriver } from "./gmail";
import { decryptToken } from "@/lib/crypto";
import { createSupabaseAdmin } from "@/lib/supabase";

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
export function createDriverFromConnection(conn: ConnectionRecord): MailDriver {
  const accessToken = decryptToken(conn.access_token_encrypted);
  const refreshToken = decryptToken(conn.refresh_token_encrypted);

  switch (conn.provider) {
    case "gmail": {
      const clientId = process.env.GOOGLE_CLIENT_ID;
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
      if (!clientId || !clientSecret) {
        throw new Error("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set for Gmail integration");
      }
      const driver = new GmailDriver({
        accessToken,
        refreshToken,
        clientId,
        clientSecret,
      });
      driver.connectionId = conn.id;
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
    // Fallback: get any connection
    const { data: fallback, error: fbErr } = await admin
      .from("crm_email_connections")
      .select("id, provider, email, access_token_encrypted, refresh_token_encrypted, token_expires_at")
      .eq("user_id", userId)
      .limit(1)
      .single();

    if (fbErr || !fallback) {
      throw new Error("No email connection found. Connect your Gmail in Settings.");
    }

    return {
      driver: createDriverFromConnection(fallback as ConnectionRecord),
      connection: fallback as ConnectionRecord,
    };
  }

  return {
    driver: createDriverFromConnection(data as ConnectionRecord),
    connection: data as ConnectionRecord,
  };
}

/**
 * After using the driver, persist any refreshed tokens back to the database.
 */
export async function updateConnectionTokens(
  connectionId: string,
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
    .eq("id", connectionId);
}
