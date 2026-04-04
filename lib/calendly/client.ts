import { encryptToken, decryptToken } from "@/lib/crypto";
import { createSupabaseAdmin } from "@/lib/supabase";
import { rateLimit } from "@/lib/rate-limit";

const CALENDLY_API_BASE = "https://api.calendly.com";
const CALENDLY_AUTH_BASE = "https://auth.calendly.com";

// Cache TTLs
const EVENT_TYPES_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

interface CalendlyConnection {
  id: string;
  user_id: string;
  calendly_user_uri: string;
  calendly_email: string;
  calendly_name: string | null;
  access_token_encrypted: string;
  refresh_token_encrypted: string;
  token_expires_at: string;
  organization_uri: string | null;
  webhook_subscription_uri: string | null;
  scheduling_url: string | null;
  event_types_cache: CalendlyEventType[] | null;
  event_types_cached_at: string | null;
  is_active: boolean;
}

export interface CalendlyEventType {
  uri: string;
  name: string;
  duration: number;
  slug: string;
  active: boolean;
  scheduling_url: string;
}

interface CalendlyTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}

/**
 * Get a valid access token for a user's Calendly connection.
 * Auto-refreshes if expired.
 */
export async function getCalendlyAccessToken(userId: string): Promise<{
  token: string;
  connection: CalendlyConnection;
}> {
  const admin = createSupabaseAdmin();
  if (!admin) throw new Error("Supabase not configured");

  const { data: conn } = await admin
    .from("crm_calendly_connections")
    .select("*")
    .eq("user_id", userId)
    .eq("is_active", true)
    .single();

  if (!conn) throw new Error("Calendly not connected");

  const connection = conn as CalendlyConnection;
  const expiresAt = new Date(connection.token_expires_at).getTime();

  // Refresh if token expires within 5 minutes
  if (Date.now() > expiresAt - 5 * 60 * 1000) {
    return refreshCalendlyToken(connection, admin);
  }

  return {
    token: decryptToken(connection.access_token_encrypted),
    connection,
  };
}

async function refreshCalendlyToken(
  connection: CalendlyConnection,
  admin: ReturnType<typeof createSupabaseAdmin>
): Promise<{ token: string; connection: CalendlyConnection }> {
  const clientId = process.env.CALENDLY_CLIENT_ID;
  const clientSecret = process.env.CALENDLY_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Calendly OAuth not configured");

  const refreshToken = decryptToken(connection.refresh_token_encrypted);

  const res = await fetch(`${CALENDLY_AUTH_BASE}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!res.ok) {
    // Mark connection as inactive if refresh fails
    if (admin) {
      await admin
        .from("crm_calendly_connections")
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq("id", connection.id);
    }
    throw new Error("Calendly token refresh failed — reconnection required");
  }

  const tokens: CalendlyTokens = await res.json();
  const newExpiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

  if (admin) {
    await admin
      .from("crm_calendly_connections")
      .update({
        access_token_encrypted: encryptToken(tokens.access_token),
        refresh_token_encrypted: encryptToken(tokens.refresh_token),
        token_expires_at: newExpiresAt,
        updated_at: new Date().toISOString(),
      })
      .eq("id", connection.id);
  }

  connection.token_expires_at = newExpiresAt;

  return { token: tokens.access_token, connection };
}

/**
 * Make an authenticated request to the Calendly API.
 */
export async function calendlyFetch(
  userId: string,
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  // Rate limit per user
  const rl = rateLimit(`calendly-api:${userId}`, { max: 80, windowSec: 60 });
  if (rl) throw new Error("Calendly API rate limit exceeded");

  const { token } = await getCalendlyAccessToken(userId);

  const url = path.startsWith("http") ? path : `${CALENDLY_API_BASE}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  return res;
}

/**
 * Get event types for a user, with caching.
 */
export async function getCalendlyEventTypes(
  userId: string
): Promise<CalendlyEventType[]> {
  const { connection } = await getCalendlyAccessToken(userId);

  // Check cache
  if (
    connection.event_types_cache &&
    connection.event_types_cached_at &&
    Date.now() - new Date(connection.event_types_cached_at).getTime() < EVENT_TYPES_CACHE_TTL
  ) {
    return connection.event_types_cache;
  }

  // Fetch from Calendly API
  const res = await calendlyFetch(
    userId,
    `/event_types?user=${encodeURIComponent(connection.calendly_user_uri)}&active=true`
  );

  if (!res.ok) {
    // Return stale cache if available
    if (connection.event_types_cache) return connection.event_types_cache;
    throw new Error("Failed to fetch Calendly event types");
  }

  const data = await res.json();
  const eventTypes: CalendlyEventType[] = (data.collection ?? []).map(
    (et: Record<string, unknown>) => ({
      uri: et.uri as string,
      name: et.name as string,
      duration: et.duration as number,
      slug: et.slug as string,
      active: et.active as boolean,
      scheduling_url: et.scheduling_url as string,
    })
  );

  // Update cache
  const admin = createSupabaseAdmin();
  if (admin) {
    await admin
      .from("crm_calendly_connections")
      .update({
        event_types_cache: eventTypes,
        event_types_cached_at: new Date().toISOString(),
      })
      .eq("id", connection.id);
  }

  return eventTypes;
}

/**
 * Create a single-use scheduling link for tracked bookings.
 */
export async function createSchedulingLink(
  userId: string,
  eventTypeUri: string
): Promise<{ booking_url: string }> {
  const res = await calendlyFetch(userId, "/scheduling_links", {
    method: "POST",
    body: JSON.stringify({
      max_event_count: 1,
      owner: eventTypeUri,
      owner_type: "EventType",
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Failed to create scheduling link: ${errBody}`);
  }

  const data = await res.json();
  return { booking_url: data.resource?.booking_url ?? data.booking_url };
}

/**
 * Create a webhook subscription for the user.
 */
export async function createWebhookSubscription(
  userId: string,
  callbackUrl: string,
  organizationUri: string
): Promise<string> {
  const res = await calendlyFetch(userId, "/webhook_subscriptions", {
    method: "POST",
    body: JSON.stringify({
      url: callbackUrl,
      events: ["invitee.created", "invitee.canceled"],
      organization: organizationUri,
      scope: "user",
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Failed to create webhook subscription: ${errBody}`);
  }

  const data = await res.json();
  return data.resource?.uri ?? "";
}

/**
 * Delete a webhook subscription.
 */
export async function deleteWebhookSubscription(
  userId: string,
  subscriptionUri: string
): Promise<void> {
  try {
    await calendlyFetch(userId, subscriptionUri, { method: "DELETE" });
  } catch {
    console.warn("[calendly] Webhook subscription cleanup failed (non-fatal)");
  }
}
