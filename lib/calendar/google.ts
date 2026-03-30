import { google, type calendar_v3 } from "googleapis";
import { createHmac } from "crypto";

// ── Error Classification ─────────────────────────────────────

export interface CalendarApiError {
  type: "auth_expired" | "scope_denied" | "admin_blocked" | "rate_limited" | "server_error" | "sync_token_expired" | "unknown";
  message: string;
  retryable: boolean;
  statusCode?: number;
}

export class CalendarApiException extends Error {
  public readonly calError: CalendarApiError;
  public readonly statusCode: number | undefined;
  constructor(calError: CalendarApiError) {
    super(calError.message);
    this.name = "CalendarApiException";
    this.calError = calError;
    this.statusCode = calError.statusCode;
  }
}

export function classifyGoogleError(error: unknown): CalendarApiError {
  const code = (error as { code?: number })?.code;
  const message = error instanceof Error ? error.message : String(error);

  // Extract error reason from Google API response body
  const errors = (error as { errors?: { reason?: string }[] })?.errors;
  const reason = errors?.[0]?.reason ?? "";

  // 401 or invalid_grant → auth expired
  if (code === 401 || message.includes("invalid_grant")) {
    return { type: "auth_expired", message: "Google authentication expired. Please reconnect.", retryable: false, statusCode: code };
  }

  // 403 with specific reasons
  if (code === 403) {
    if (reason === "insufficientPermissions" || message.includes("insufficientPermissions")) {
      return { type: "scope_denied", message: "Missing required Google Calendar permissions. Please reconnect.", retryable: false, statusCode: code };
    }
    if (
      reason === "domainPolicy" ||
      reason === "admin_policy_enforced" ||
      message.includes("admin_policy_enforced") ||
      message.includes("domainPolicy")
    ) {
      return { type: "admin_blocked", message: "Your Google Workspace administrator has blocked this permission. Contact your IT admin.", retryable: false, statusCode: code };
    }
  }

  // 410 → sync token expired (GONE)
  if (code === 410) {
    return { type: "sync_token_expired", message: "Sync token expired (410 GONE). Full re-sync required.", retryable: false, statusCode: 410 };
  }

  // 429 → rate limited
  if (code === 429) {
    return { type: "rate_limited", message: "Google API rate limit reached. Retrying...", retryable: true, statusCode: code };
  }

  // 5xx → server error
  if (code !== undefined && code >= 500) {
    return { type: "server_error", message: "Google Calendar server error. Retrying...", retryable: true, statusCode: code };
  }

  return { type: "unknown", message: message.slice(0, 300), retryable: false, statusCode: code };
}

/** Retry Google API calls on retryable errors with exponential backoff */
async function withBackoff<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      const classified = classifyGoogleError(err);
      if (!classified.retryable || attempt === maxRetries) {
        throw new CalendarApiException(classified);
      }
      // Respect Google's Retry-After header when present
      const retryAfterSec = (err as { response?: { headers?: Record<string, string> } })?.response?.headers?.["retry-after"];
      const retryMs = retryAfterSec ? parseInt(retryAfterSec, 10) * 1000 : 0;
      const baseDelay = Math.min(1000 * 2 ** attempt + Math.random() * 500, 16000);
      const delayMs = Math.max(retryMs, baseDelay);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw new Error("withBackoff: unreachable");
}

interface GoogleCalendarConfig {
  accessToken: string;
  refreshToken: string;
  clientId: string;
  clientSecret: string;
  expiryDate?: number;
}

export interface CalendarListEntry {
  id: string;
  summary: string;
  description?: string;
  primary?: boolean;
  backgroundColor?: string;
  accessRole?: string;
}

export interface CalendarEvent {
  id: string;
  calendarId: string;
  summary: string;
  description?: string;
  location?: string;
  startAt?: string;
  endAt?: string;
  startDate?: string;
  endDate?: string;
  isAllDay: boolean;
  status: "confirmed" | "tentative" | "cancelled";
  organizer?: { email: string; displayName?: string; self?: boolean };
  attendees?: { email: string; displayName?: string; responseStatus?: string; self?: boolean }[];
  recurringEventId?: string;
  htmlLink?: string;
  hangoutLink?: string;
  etag?: string;
}

export interface SyncResult {
  events: CalendarEvent[];
  nextSyncToken?: string;
  nextPageToken?: string;
}

/** Lazy-load driver module to avoid circular dependency (driver.ts imports google.ts) */
let _updateTokensFn: typeof import("./driver").updateCalendarConnectionTokens | null = null;
async function getUpdateTokensFn() {
  if (!_updateTokensFn) {
    const mod = await import("./driver");
    _updateTokensFn = mod.updateCalendarConnectionTokens;
  }
  return _updateTokensFn;
}

/** Module-level map to prevent concurrent token persists per connection.
 *  Stores timestamps (ms) with a 30-second TTL to avoid permanent blocking
 *  if a persist fails without reaching the finally block. */
const tokenPersistInFlight = new Map<string, number>();

export class GoogleCalendarDriver {
  private calendar: calendar_v3.Calendar;
  private auth: InstanceType<typeof google.auth.OAuth2>;

  public connectionId: string | null = null;
  public userId: string | null = null;

  constructor(config: GoogleCalendarConfig) {
    this.auth = new google.auth.OAuth2(config.clientId, config.clientSecret);
    this.auth.setCredentials({
      access_token: config.accessToken,
      refresh_token: config.refreshToken,
      expiry_date: config.expiryDate ?? undefined,
    });
    this.calendar = google.calendar({ version: "v3", auth: this.auth, http2: true });

    // Persist refreshed tokens back to database (with race condition guard)
    this.auth.on("tokens", (tokens) => {
      if (!tokens.access_token || !this.connectionId) return;
      if (!this.userId) {
        console.error("[calendar] Cannot persist refreshed token — userId not set on driver");
        return;
      }

      const connId = this.connectionId;
      const uid = this.userId;

      // Skip if another persist is already in flight for this connection (with 30s TTL)
      const inflightTs = tokenPersistInFlight.get(connId);
      if (inflightTs && Date.now() - inflightTs < 30_000) return;
      tokenPersistInFlight.set(connId, Date.now());

      const expiryDate = tokens.expiry_date ? new Date(tokens.expiry_date) : undefined;
      const refreshToken = tokens.refresh_token ?? undefined;

      (async () => {
        try {
          for (let attempt = 0; attempt < 3; attempt++) {
            try {
              const updateTokens = await getUpdateTokensFn();
              await updateTokens(connId, uid, tokens.access_token!, expiryDate, refreshToken);
              return;
            } catch (err) {
              const msg = err instanceof Error ? err.message : "unknown";
              console.error(`[calendar] Token persist attempt ${attempt + 1}/3 failed:`, msg);
              if (attempt < 2) {
                await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
              }
            }
          }
          console.error("[calendar] All 3 token persist attempts failed for connection", connId);
        } finally {
          tokenPersistInFlight.delete(connId);
        }
      })().catch((err) => {
        console.error("[calendar] Unhandled error in token persist handler:", err instanceof Error ? err.message : "unknown");
        tokenPersistInFlight.delete(connId);
      });
    });

  }

  /** Get refreshed access token (auto-refreshes if expired) */
  async getAccessToken(): Promise<string> {
    try {
      const { token } = await this.auth.getAccessToken();
      if (!token) throw new Error("Failed to refresh access token — reconnect Google Calendar in Settings");
      return token;
    } catch (err) {
      // Deactivate connection on fatal refresh failures
      const classified = classifyGoogleError(err);
      if (classified.type === "auth_expired" && this.connectionId) {
        const connId = this.connectionId;
        console.error("[calendar] Token refresh failed with invalid_grant — deactivating connection", connId);
        import("./driver").then(({ deactivateConnection }) => {
          deactivateConnection(connId, classified.message).catch((deactivateErr) => {
            console.error("[calendar] Failed to deactivate connection:", deactivateErr instanceof Error ? deactivateErr.message : "unknown");
          });
        }).catch(() => {
          // Module import failure is non-fatal
        });
      }
      throw err;
    }
  }

  /** List all calendars the user has access to (handles pagination) */
  async listCalendars(): Promise<CalendarListEntry[]> {
    const allCalendars: CalendarListEntry[] = [];
    let pageToken: string | undefined;

    do {
      const res = await withBackoff(() =>
        this.calendar.calendarList.list({
          minAccessRole: "reader",
          maxResults: 250,
          pageToken,
        })
      );
      const entries = (res.data.items ?? []).map((c) => ({
        id: c.id ?? "",
        summary: c.summary ?? "",
        description: c.description ?? undefined,
        primary: c.primary ?? false,
        backgroundColor: c.backgroundColor ?? undefined,
        accessRole: c.accessRole ?? undefined,
      }));
      allCalendars.push(...entries);
      pageToken = res.data.nextPageToken ?? undefined;
    } while (pageToken);

    return allCalendars;
  }

  /**
   * List events with optional sync token support.
   * If syncToken is provided, performs incremental sync.
   * Throws 410 GONE if syncToken is stale (caller should do full re-sync).
   */
  async listEvents(
    calendarId: string,
    params: {
      syncToken?: string;
      pageToken?: string;
      timeMin?: string;
      timeMax?: string;
      maxResults?: number;
    } = {}
  ): Promise<SyncResult> {
    const requestParams: calendar_v3.Params$Resource$Events$List = {
      calendarId,
      maxResults: params.maxResults ?? 250,
    };

    if (params.syncToken) {
      // syncToken is incompatible with singleEvents, orderBy, timeMin, timeMax
      requestParams.syncToken = params.syncToken;
    } else {
      requestParams.singleEvents = true;
      requestParams.orderBy = "startTime";
      if (params.timeMin) requestParams.timeMin = params.timeMin;
      if (params.timeMax) requestParams.timeMax = params.timeMax;
    }

    if (params.pageToken) requestParams.pageToken = params.pageToken;

    const res = await withBackoff(() => this.calendar.events.list(requestParams));
    const events = (res.data.items ?? []).map((e) => this.parseEvent(calendarId, e));

    return {
      events,
      nextSyncToken: res.data.nextSyncToken ?? undefined,
      nextPageToken: res.data.nextPageToken ?? undefined,
    };
  }

  /** Get a single event */
  async getEvent(calendarId: string, eventId: string): Promise<CalendarEvent> {
    const res = await withBackoff(() =>
      this.calendar.events.get({ calendarId, eventId })
    );
    return this.parseEvent(calendarId, res.data);
  }

  /** Create a new event */
  async createEvent(
    calendarId: string,
    event: {
      summary: string;
      description?: string;
      location?: string;
      startAt?: string;
      endAt?: string;
      startDate?: string;
      endDate?: string;
      attendees?: { email: string }[];
    }
  ): Promise<CalendarEvent> {
    const requestBody: calendar_v3.Schema$Event = {
      summary: event.summary,
      description: event.description,
      location: event.location,
      attendees: event.attendees?.map((a) => ({ email: a.email })),
    };

    if (event.startDate && event.endDate) {
      requestBody.start = { date: event.startDate };
      requestBody.end = { date: event.endDate };
    } else {
      requestBody.start = { dateTime: event.startAt };
      requestBody.end = { dateTime: event.endAt };
    }

    const res = await withBackoff(() =>
      this.calendar.events.insert({ calendarId, requestBody })
    );
    return this.parseEvent(calendarId, res.data);
  }

  /** Delete an event */
  async deleteEvent(calendarId: string, eventId: string): Promise<void> {
    await withBackoff(() =>
      this.calendar.events.delete({ calendarId, eventId })
    );
  }

  /** Set up push notifications for a calendar */
  async watchEvents(
    calendarId: string,
    webhookUrl: string,
    channelId: string,
    connectionId: string,
    ttlSeconds = 86400
  ): Promise<{ channelId: string; resourceId: string; expiration: string }> {
    // Generate HMAC token using connectionId (must match webhook handler's verifyWebhookToken)
    const token = generateWebhookToken(connectionId, calendarId);

    const res = await withBackoff(() =>
      this.calendar.events.watch({
        calendarId,
        requestBody: {
          id: channelId,
          type: "web_hook",
          address: webhookUrl,
          token,
          expiration: String(Date.now() + ttlSeconds * 1000),
        },
      })
    );
    return {
      channelId: res.data.id ?? channelId,
      resourceId: res.data.resourceId ?? "",
      expiration: res.data.expiration ?? "",
    };
  }

  /** Stop receiving push notifications for a channel */
  async stopWatch(channelId: string, resourceId: string): Promise<void> {
    await withBackoff(() =>
      this.calendar.channels.stop({
        requestBody: { id: channelId, resourceId },
      })
    );
  }

  // ── Private helpers ─────────────────────────────────────────

  private parseEvent(calendarId: string, data: calendar_v3.Schema$Event): CalendarEvent {
    const isAllDay = !!data.start?.date;

    return {
      id: data.id ?? "",
      calendarId,
      summary: data.summary ?? "(no title)",
      description: data.description ?? undefined,
      location: data.location ?? undefined,
      startAt: data.start?.dateTime ?? undefined,
      endAt: data.end?.dateTime ?? undefined,
      startDate: data.start?.date ?? undefined,
      endDate: data.end?.date ?? undefined,
      isAllDay,
      status: (data.status as CalendarEvent["status"]) ?? "confirmed",
      organizer: data.organizer
        ? {
            email: data.organizer.email ?? "",
            displayName: data.organizer.displayName ?? undefined,
            self: data.organizer.self ?? undefined,
          }
        : undefined,
      attendees: data.attendees?.map((a) => ({
        email: a.email ?? "",
        displayName: a.displayName ?? undefined,
        responseStatus: a.responseStatus ?? undefined,
        self: a.self ?? undefined,
      })),
      recurringEventId: data.recurringEventId ?? undefined,
      htmlLink: data.htmlLink ?? undefined,
      hangoutLink: data.hangoutLink ?? undefined,
      etag: data.etag ?? undefined,
    };
  }
}

/**
 * Generate an HMAC-SHA256 token for webhook verification.
 * Signs `connectionId:calendarId` with TOKEN_ENCRYPTION_KEY.
 */
export function generateWebhookToken(connectionId: string, calendarId: string): string {
  const key = process.env.TOKEN_ENCRYPTION_KEY;
  if (!key) throw new Error("TOKEN_ENCRYPTION_KEY is not set");
  return createHmac("sha256", key)
    .update(`${connectionId}:${calendarId}`)
    .digest("hex");
}

/**
 * Verify an HMAC-SHA256 webhook token.
 */
export function verifyWebhookToken(
  connectionId: string,
  calendarId: string,
  token: string
): boolean {
  try {
    const expected = generateWebhookToken(connectionId, calendarId);
    // Constant-time comparison
    if (expected.length !== token.length) return false;
    const { timingSafeEqual } = require("crypto") as typeof import("crypto");
    return timingSafeEqual(Buffer.from(expected), Buffer.from(token));
  } catch {
    return false;
  }
}
