import { GoogleCalendarDriver } from "./google";
import { decryptToken, encryptToken } from "@/lib/crypto";
import { createSupabaseAdmin } from "@/lib/supabase";

interface CalendarConnectionRecord {
  id: string;
  google_email: string;
  access_token_encrypted: string;
  refresh_token_encrypted: string | null;
  token_expires_at: string | null;
  selected_calendars: string[];
  is_active: boolean;
  scopes?: string[];
}

export const REQUIRED_CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
];

export const OPTIONAL_CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/calendar.readonly",
];

/**
 * Create a GoogleCalendarDriver from a stored connection record.
 * Decrypts tokens and sets up auto-refresh.
 */
export function createCalendarDriverFromConnection(
  conn: CalendarConnectionRecord,
  userId?: string
): GoogleCalendarDriver {
  const accessToken = decryptToken(conn.access_token_encrypted);
  const refreshToken = conn.refresh_token_encrypted
    ? decryptToken(conn.refresh_token_encrypted)
    : "";

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Google OAuth not configured. Contact your administrator.");
  }

  const expiryDate = conn.token_expires_at
    ? new Date(conn.token_expires_at).getTime()
    : undefined;

  const driver = new GoogleCalendarDriver({
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

/**
 * Get the calendar driver for a user's active connection.
 */
export async function getCalendarDriverForUser(
  userId: string,
  connectionId?: string
): Promise<{ driver: GoogleCalendarDriver; connection: CalendarConnectionRecord }> {
  const admin = createSupabaseAdmin();
  if (!admin) throw new Error("Supabase not configured");

  let query = admin
    .from("crm_calendar_connections")
    .select("id, google_email, access_token_encrypted, refresh_token_encrypted, token_expires_at, selected_calendars, is_active, scopes")
    .eq("user_id", userId)
    .eq("is_active", true);

  if (connectionId) {
    query = query.eq("id", connectionId);
  }

  const { data, error } = await query.order("connected_at", { ascending: true }).limit(1).single();

  if (error || !data) {
    throw new Error("No calendar connection found. Connect Google Calendar in Settings.");
  }

  const conn = data as CalendarConnectionRecord;
  return {
    driver: createCalendarDriverFromConnection(conn, userId),
    connection: conn,
  };
}

/**
 * Persist refreshed tokens back to the database.
 */
export async function updateCalendarConnectionTokens(
  connectionId: string,
  userId: string,
  accessToken: string,
  expiresAt?: Date,
  refreshToken?: string
): Promise<void> {
  const admin = createSupabaseAdmin();
  if (!admin) return;

  const updateData: Record<string, unknown> = {
    access_token_encrypted: encryptToken(accessToken),
    token_expires_at: expiresAt?.toISOString() ?? null,
  };

  if (refreshToken) {
    updateData.refresh_token_encrypted = encryptToken(refreshToken);
  }

  const { error } = await admin
    .from("crm_calendar_connections")
    .update(updateData)
    .eq("id", connectionId)
    .eq("user_id", userId);

  if (error) {
    console.error("[calendar/driver] Token persistence failed, retrying:", error.message);
    await new Promise((r) => setTimeout(r, 500));
    const { error: retryErr } = await admin
      .from("crm_calendar_connections")
      .update(updateData)
      .eq("id", connectionId)
      .eq("user_id", userId);
    if (retryErr) {
      console.error("[calendar/driver] Token persistence retry failed:", retryErr.message);
    }
  }
}

/**
 * Deactivate a broken connection with a reason.
 */
export async function deactivateConnection(connectionId: string, reason: string): Promise<void> {
  const admin = createSupabaseAdmin();
  if (!admin) return;

  const { error } = await admin
    .from("crm_calendar_connections")
    .update({ is_active: false })
    .eq("id", connectionId);

  if (error) {
    console.error("[calendar/driver] Failed to deactivate connection:", error.message);
    return;
  }

  // Store reason in sync state error_message
  await admin
    .from("crm_calendar_sync_state")
    .update({ sync_status: "error", error_message: reason.slice(0, 500) })
    .eq("connection_id", connectionId);
}

/**
 * Check what calendar scopes a connection has.
 */
export function checkCalendarScopes(connection: { scopes?: string[] }): {
  canRead: boolean;
  canWrite: boolean;
} {
  const scopes = connection.scopes ?? [];
  const hasWriteScope = scopes.some((s) =>
    REQUIRED_CALENDAR_SCOPES.includes(s)
  );
  const hasReadScope = scopes.some((s) =>
    OPTIONAL_CALENDAR_SCOPES.includes(s)
  );
  return {
    canRead: hasWriteScope || hasReadScope,
    canWrite: hasWriteScope,
  };
}
