import { createSupabaseAdmin } from "@/lib/supabase";
import { getCalendarDriverForUser } from "./driver";
import { CalendarApiException, type CalendarEvent } from "./google";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Atomically acquire a sync lock. Returns true if lock acquired, false if already syncing.
 * Uses an atomic UPDATE with WHERE sync_status != 'syncing' to prevent races.
 */
async function acquireSyncLock(
  admin: SupabaseClient,
  connectionId: string,
  calendarId: string
): Promise<boolean> {
  // First, ensure a row exists (no-op if already present)
  await admin.from("crm_calendar_sync_state").upsert(
    {
      connection_id: connectionId,
      calendar_id: calendarId,
      sync_status: "idle",
    },
    { onConflict: "connection_id,calendar_id", ignoreDuplicates: true }
  );

  // Atomic lock: update if not syncing, OR if lock is stale (>5 min old)
  const now = new Date().toISOString();
  const staleThreshold = new Date(Date.now() - 5 * 60 * 1000).toISOString();

  // Try normal lock first
  const { data } = await admin
    .from("crm_calendar_sync_state")
    .update({ sync_status: "syncing", error_message: null, sync_started_at: now })
    .eq("connection_id", connectionId)
    .eq("calendar_id", calendarId)
    .neq("sync_status", "syncing")
    .select("connection_id");

  if ((data?.length ?? 0) > 0) return true;

  // Override stale locks (sync_started_at older than 5 minutes)
  const { data: staleData } = await admin
    .from("crm_calendar_sync_state")
    .update({ sync_status: "syncing", error_message: null, sync_started_at: now })
    .eq("connection_id", connectionId)
    .eq("calendar_id", calendarId)
    .eq("sync_status", "syncing")
    .lt("sync_started_at", staleThreshold)
    .select("connection_id");

  return (staleData?.length ?? 0) > 0;
}

/**
 * Inner full sync logic (caller must hold the sync lock).
 * Fetches events 90 days in the past to 365 days in the future.
 * Stores the syncToken for future incremental syncs.
 */
async function _performFullSyncInner(
  admin: SupabaseClient,
  userId: string,
  connectionId: string,
  calendarId: string
): Promise<{ eventCount: number }> {
  const { driver } = await getCalendarDriverForUser(userId, connectionId);

  const now = new Date();
  const timeMin = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const timeMax = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000).toISOString();

  let allEvents: CalendarEvent[] = [];
  let pageToken: string | undefined;
  let syncToken: string | undefined;

  // Paginate through all events
  do {
    const result = await driver.listEvents(calendarId, {
      timeMin,
      timeMax,
      maxResults: 250,
      pageToken,
    });

    allEvents = allEvents.concat(result.events);
    pageToken = result.nextPageToken;
    syncToken = result.nextSyncToken;
  } while (pageToken);

  // Collect all google_event_ids from the API response for safe stale deletion
  const fetchedGoogleEventIds = new Set(allEvents.map((e) => e.id));

  // Process events (upsert into DB)
  await processEventChanges(admin, allEvents, userId, connectionId, calendarId);

  // Delete events NOT in the fetched set (safe even if upsert partially failed)
  if (fetchedGoogleEventIds.size > 0) {
    // Fetch existing event IDs for this calendar and delete those not in the API response
    const { data: existingEvents } = await admin
      .from("crm_calendar_events")
      .select("google_event_id")
      .eq("user_id", userId)
      .eq("connection_id", connectionId)
      .eq("calendar_id", calendarId);

    const staleIds = (existingEvents ?? [])
      .map((e) => e.google_event_id as string)
      .filter((id) => !fetchedGoogleEventIds.has(id));

    if (staleIds.length > 0) {
      // Delete in batches to avoid PostgREST URL limits
      const DELETE_BATCH = 100;
      for (let i = 0; i < staleIds.length; i += DELETE_BATCH) {
        await admin
          .from("crm_calendar_events")
          .delete()
          .eq("user_id", userId)
          .eq("connection_id", connectionId)
          .eq("calendar_id", calendarId)
          .in("google_event_id", staleIds.slice(i, i + DELETE_BATCH));
      }
    }
  }

  // Update sync state
  await admin.from("crm_calendar_sync_state").upsert(
    {
      connection_id: connectionId,
      calendar_id: calendarId,
      sync_token: syncToken ?? null,
      last_full_sync_at: new Date().toISOString(),
      sync_status: "synced",
      error_message: null,
    },
    { onConflict: "connection_id,calendar_id" }
  );

  // Auto-link events to contacts
  const eventIds = allEvents
    .filter((e) => e.status !== "cancelled")
    .map((e) => e.id);
  if (eventIds.length > 0) {
    await autoLinkEvents(userId, connectionId, calendarId, eventIds);
  }

  // Set up webhook channel for push notifications (non-blocking)
  setupWebhookChannel(userId, connectionId, calendarId).catch((err) => {
    console.error("[calendar/sync] Webhook channel setup failed:", err instanceof Error ? err.message : "unknown");
  });

  return { eventCount: allEvents.length };
}

/**
 * Perform a full sync of events from a Google Calendar.
 * Acquires the sync lock, then delegates to the inner function.
 */
export async function performFullSync(
  userId: string,
  connectionId: string,
  calendarId: string
): Promise<{ eventCount: number }> {
  const admin = createSupabaseAdmin();
  if (!admin) throw new Error("Supabase not configured");

  // Acquire atomic sync lock — skip if already syncing
  const locked = await acquireSyncLock(admin, connectionId, calendarId);
  if (!locked) {
    return { eventCount: 0 };
  }

  try {
    return await _performFullSyncInner(admin, userId, connectionId, calendarId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    await admin.from("crm_calendar_sync_state").upsert(
      {
        connection_id: connectionId,
        calendar_id: calendarId,
        sync_status: "error",
        error_message: msg.slice(0, 500),
      },
      { onConflict: "connection_id,calendar_id" }
    );
    throw err;
  } finally {
    // Best-effort lock release: only updates rows still in "syncing" state (error cases
    // where the catch handler itself threw, e.g. Supabase down). The success path already
    // sets sync_status to "synced" inside the inner function, so this is a no-op then.
    try {
      await admin
        .from("crm_calendar_sync_state")
        .update({ sync_status: "error", sync_started_at: null })
        .eq("connection_id", connectionId)
        .eq("calendar_id", calendarId)
        .eq("sync_status", "syncing");
    } catch {
      // Intentionally swallowed — best-effort cleanup
    }
  }
}

/**
 * Inner incremental sync logic (caller must hold the sync lock).
 * If the syncToken is stale (410 GONE), falls back to full sync inner function
 * directly (avoiding deadlock since the lock is already held).
 */
async function _performIncrementalSyncInner(
  admin: SupabaseClient,
  userId: string,
  connectionId: string,
  calendarId: string,
  syncToken: string
): Promise<{ eventCount: number; fullSyncRequired: boolean }> {
  try {
    const { driver } = await getCalendarDriverForUser(userId, connectionId);

    let allEvents: CalendarEvent[] = [];
    let pageToken: string | undefined;
    let newSyncToken: string | undefined;

    do {
      const result = await driver.listEvents(calendarId, {
        syncToken,
        pageToken,
      });

      allEvents = allEvents.concat(result.events);
      pageToken = result.nextPageToken;
      newSyncToken = result.nextSyncToken;
    } while (pageToken);

    // Process changes
    await processEventChanges(admin, allEvents, userId, connectionId, calendarId);

    // Update sync state
    await admin.from("crm_calendar_sync_state").upsert(
      {
        connection_id: connectionId,
        calendar_id: calendarId,
        sync_token: newSyncToken ?? syncToken,
        last_incremental_sync_at: new Date().toISOString(),
        sync_status: "synced",
        error_message: null,
      },
      { onConflict: "connection_id,calendar_id" }
    );

    // Auto-link new/changed events
    const nonCancelledIds = allEvents
      .filter((e) => e.status !== "cancelled")
      .map((e) => e.id);
    if (nonCancelledIds.length > 0) {
      await autoLinkEvents(userId, connectionId, calendarId, nonCancelledIds);
    }

    // Auto-advance deals from "Calendly Sent" to "Video Call" when meeting confirmed
    const confirmedEvents = allEvents.filter((e) => e.status === "confirmed");
    if (confirmedEvents.length > 0) {
      await autoAdvanceDealsOnMeetingConfirmed(admin, userId, connectionId, calendarId, confirmedEvents.map((e) => e.id));
    }

    return { eventCount: allEvents.length, fullSyncRequired: false };
  } catch (err: unknown) {
    // Handle 410 GONE — syncToken is stale, fall back to full sync
    // Call inner function directly to avoid deadlock (lock already held)
    // Check both CalendarApiException.statusCode (withBackoff wraps errors) and raw .code
    const is410 =
      (err instanceof CalendarApiException && err.statusCode === 410) ||
      (err as { code?: number })?.code === 410;
    if (is410) {
      console.warn("[calendar/sync] SyncToken stale (410 GONE), performing full re-sync");
      const result = await _performFullSyncInner(admin, userId, connectionId, calendarId);
      return { eventCount: result.eventCount, fullSyncRequired: true };
    }
    throw err;
  }
}

/**
 * Perform an incremental sync using a stored syncToken.
 * Acquires the sync lock, then delegates to the inner function.
 */
export async function performIncrementalSync(
  userId: string,
  connectionId: string,
  calendarId: string,
  syncToken: string
): Promise<{ eventCount: number; fullSyncRequired: boolean }> {
  const admin = createSupabaseAdmin();
  if (!admin) throw new Error("Supabase not configured");

  // Acquire atomic sync lock — skip if already syncing
  const locked = await acquireSyncLock(admin, connectionId, calendarId);
  if (!locked) {
    return { eventCount: 0, fullSyncRequired: false };
  }

  try {
    return await _performIncrementalSyncInner(admin, userId, connectionId, calendarId, syncToken);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    await admin.from("crm_calendar_sync_state").upsert(
      {
        connection_id: connectionId,
        calendar_id: calendarId,
        sync_status: "error",
        error_message: msg.slice(0, 500),
      },
      { onConflict: "connection_id,calendar_id" }
    );
    throw err;
  } finally {
    // Best-effort lock release (see performFullSync for rationale)
    try {
      await admin
        .from("crm_calendar_sync_state")
        .update({ sync_status: "error", sync_started_at: null })
        .eq("connection_id", connectionId)
        .eq("calendar_id", calendarId)
        .eq("sync_status", "syncing");
    } catch {
      // Intentionally swallowed — best-effort cleanup
    }
  }
}

/** Strip HTML tags from a string to prevent stored XSS from event descriptions. */
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").trim();
}

/**
 * Process event changes from Google Calendar API response.
 * Upserts active events, deletes cancelled ones.
 */
async function processEventChanges(
  admin: SupabaseClient,
  events: CalendarEvent[],
  userId: string,
  connectionId: string,
  calendarId: string
): Promise<void> {

  // Separate cancelled events (to delete) from active ones (to upsert)
  const cancelled = events.filter((e) => e.status === "cancelled");
  const active = events.filter((e) => e.status !== "cancelled");

  // Delete cancelled events
  if (cancelled.length > 0) {
    const cancelledIds = cancelled.map((e) => e.id);
    const { error: deleteError } = await admin
      .from("crm_calendar_events")
      .delete()
      .eq("user_id", userId)
      .eq("connection_id", connectionId)
      .eq("calendar_id", calendarId)
      .in("google_event_id", cancelledIds);

    if (deleteError) {
      throw new Error(`Failed to delete cancelled events: ${deleteError.message}`);
    }
  }

  // Upsert active events in batches of 50
  const BATCH_SIZE = 50;
  for (let i = 0; i < active.length; i += BATCH_SIZE) {
    const batch = active.slice(i, i + BATCH_SIZE).map((e) => ({
      user_id: userId,
      connection_id: connectionId,
      calendar_id: calendarId,
      google_event_id: e.id,
      summary: e.summary,
      description: e.description ? stripHtml(e.description) : null,
      location: e.location ?? null,
      start_at: e.startAt ?? null,
      end_at: e.endAt ?? null,
      start_date: e.startDate ?? null,
      end_date: e.endDate ?? null,
      is_all_day: e.isAllDay,
      status: e.status,
      organizer: e.organizer ?? null,
      attendees: e.attendees ?? null,
      recurring_event_id: e.recurringEventId ?? null,
      html_link: e.htmlLink ?? null,
      hangout_link: e.hangoutLink ?? null,
      etag: e.etag ?? null,
      synced_at: new Date().toISOString(),
    }));

    const { error: upsertError } = await admin.from("crm_calendar_events").upsert(batch, {
      onConflict: "user_id,calendar_id,google_event_id",
    });

    if (upsertError) {
      throw new Error(`Failed to upsert events batch: ${upsertError.message}`);
    }
  }
}

/**
 * Auto-link calendar events to CRM contacts by matching attendee emails.
 */
async function autoLinkEvents(
  userId: string,
  connectionId: string,
  calendarId: string,
  googleEventIds: string[]
): Promise<void> {
  const admin = createSupabaseAdmin();
  if (!admin) return;

  // Fetch the cached events with attendees (batched to avoid PostgREST URL limits)
  const LINK_BATCH_SIZE = 50;
  const events: { id: string; attendees: unknown }[] = [];
  for (let i = 0; i < googleEventIds.length; i += LINK_BATCH_SIZE) {
    const chunk = googleEventIds.slice(i, i + LINK_BATCH_SIZE);
    const { data } = await admin
      .from("crm_calendar_events")
      .select("id, attendees")
      .eq("user_id", userId)
      .eq("connection_id", connectionId)
      .eq("calendar_id", calendarId)
      .in("google_event_id", chunk);
    if (data) events.push(...data);
  }

  if (!events.length) return;

  // Collect all unique attendee emails
  const allEmails = new Set<string>();
  for (const event of events) {
    const attendees = event.attendees as { email: string }[] | null;
    if (attendees) {
      for (const a of attendees) {
        if (a.email) allEmails.add(a.email.toLowerCase());
      }
    }
  }

  if (allEmails.size === 0) return;

  // Find matching CRM contacts by attendee emails (pre-filtered, not full table scan).
  // crm_contacts is org-wide (no user_id column) — all authenticated users share contacts.
  // This is intentional: contacts belong to the org, not individual users.
  const emailArray = Array.from(allEmails);
  const CONTACT_BATCH = 50;
  const emailToContactId = new Map<string, string>();

  for (let i = 0; i < emailArray.length; i += CONTACT_BATCH) {
    const chunk = emailArray.slice(i, i + CONTACT_BATCH);
    const { data: contacts } = await admin
      .from("crm_contacts")
      .select("id, email")
      .in("email", chunk);

    for (const c of contacts ?? []) {
      if (c.email) {
        emailToContactId.set(c.email.toLowerCase(), c.id);
      }
    }
  }

  if (emailToContactId.size === 0) return;

  // Create event links (skip duplicates via ON CONFLICT)
  const links: { event_id: string; contact_id: string; linked_by: string; auto_linked: boolean }[] = [];
  for (const event of events) {
    const attendees = event.attendees as { email: string }[] | null;
    if (!attendees) continue;
    for (const a of attendees) {
      const contactId = emailToContactId.get(a.email?.toLowerCase());
      if (contactId) {
        links.push({
          event_id: event.id,
          contact_id: contactId,
          linked_by: userId,
          auto_linked: true,
        });
      }
    }
  }

  if (links.length > 0) {
    await admin.from("crm_calendar_event_links").upsert(links, {
      onConflict: "event_id,contact_id",
      ignoreDuplicates: true,
    });
  }
}

/**
 * Auto-advance deals from "Calendly Sent" to "Video Call" stage when a confirmed
 * calendar event is linked to a deal (via crm_calendar_event_deals junction).
 */
async function autoAdvanceDealsOnMeetingConfirmed(
  admin: SupabaseClient,
  userId: string,
  connectionId: string,
  calendarId: string,
  googleEventIds: string[]
): Promise<void> {
  try {
    // Find internal event IDs for these google events
    const { data: events } = await admin
      .from("crm_calendar_events")
      .select("id")
      .eq("user_id", userId)
      .eq("connection_id", connectionId)
      .eq("calendar_id", calendarId)
      .in("google_event_id", googleEventIds);

    if (!events?.length) return;

    const eventIds = events.map((e) => e.id);

    // Find deals linked to these events
    const { data: links } = await admin
      .from("crm_calendar_event_deals")
      .select("deal_id")
      .in("calendar_event_id", eventIds);

    if (!links?.length) return;

    const dealIds = [...new Set(links.map((l) => l.deal_id))];

    // Get pipeline stages to find "Calendly Sent" and "Video Call"
    const { data: stages } = await admin
      .from("pipeline_stages")
      .select("id, name, position")
      .order("position");

    if (!stages?.length) return;

    const calendlySentStage = stages.find((s) => s.name.toLowerCase().includes("calendly"));
    const videoCallStage = stages.find((s) => s.name.toLowerCase().includes("video call"));

    if (!calendlySentStage || !videoCallStage) return;

    // Find deals in "Calendly Sent" stage
    const { data: dealsToAdvance } = await admin
      .from("crm_deals")
      .select("id, stage_id")
      .in("id", dealIds)
      .eq("stage_id", calendlySentStage.id)
      .eq("outcome", "open");

    if (!dealsToAdvance?.length) return;

    // Advance each deal to "Video Call"
    for (const deal of dealsToAdvance) {
      await admin
        .from("crm_deals")
        .update({
          stage_id: videoCallStage.id,
          stage_changed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", deal.id);

      // Log stage change history
      await admin.from("crm_deal_stage_history").insert({
        deal_id: deal.id,
        from_stage_id: calendlySentStage.id,
        to_stage_id: videoCallStage.id,
        changed_by: userId,
        change_reason: "Auto-advanced: meeting confirmed via calendar sync",
      });
    }
  } catch (err) {
    console.error("[calendar/sync] autoAdvanceDealsOnMeetingConfirmed error:", err instanceof Error ? err.message : "unknown");
  }
}

/**
 * Trigger a sync for a specific user and calendar.
 * Uses incremental sync if a syncToken exists, otherwise full sync.
 */
export async function triggerSync(
  userId: string,
  connectionId: string,
  calendarId: string
): Promise<{ eventCount: number; syncType: "full" | "incremental" }> {
  const admin = createSupabaseAdmin();
  if (!admin) throw new Error("Supabase not configured");

  // Check for existing sync state
  const { data: syncState } = await admin
    .from("crm_calendar_sync_state")
    .select("sync_token")
    .eq("connection_id", connectionId)
    .eq("calendar_id", calendarId)
    .limit(1)
    .maybeSingle();

  if (syncState?.sync_token) {
    const result = await performIncrementalSync(
      userId,
      connectionId,
      calendarId,
      syncState.sync_token
    );
    return {
      eventCount: result.eventCount,
      syncType: result.fullSyncRequired ? "full" : "incremental",
    };
  }

  const result = await performFullSync(userId, connectionId, calendarId);
  return { eventCount: result.eventCount, syncType: "full" };
}

/**
 * Set up a Google Calendar push notification channel.
 * Stores channel info in sync state for later renewal/cleanup.
 */
export async function setupWebhookChannel(
  userId: string,
  connectionId: string,
  calendarId: string
): Promise<void> {
  const admin = createSupabaseAdmin();
  if (!admin) return;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) {
    console.warn("[calendar/sync] NEXT_PUBLIC_APP_URL not set — skipping webhook setup");
    return;
  }

  const { driver } = await getCalendarDriverForUser(userId, connectionId);
  // Base64url-encode calendarId to avoid @/# chars that violate Google's channel ID regex
  const encodedCalId = Buffer.from(calendarId).toString("base64url");
  const channelId = `cal:${connectionId}:${encodedCalId}`;
  const webhookUrl = `${appUrl}/api/calendar/google/webhook`;

  const result = await driver.watchEvents(calendarId, webhookUrl, channelId, connectionId);

  const expiry = result.expiration
    ? new Date(Number(result.expiration)).toISOString()
    : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  await admin.from("crm_calendar_sync_state").upsert(
    {
      connection_id: connectionId,
      calendar_id: calendarId,
      watch_channel_id: result.channelId,
      watch_resource_id: result.resourceId,
      watch_channel_expiry: expiry,
    },
    { onConflict: "connection_id,calendar_id" }
  );
}

/**
 * Find and renew webhook channels expiring within 1 hour.
 */
export async function renewExpiringChannels(): Promise<number> {
  const admin = createSupabaseAdmin();
  if (!admin) return 0;

  const oneHourFromNow = new Date(Date.now() + 60 * 60 * 1000).toISOString();

  const { data: expiring } = await admin
    .from("crm_calendar_sync_state")
    .select("connection_id, calendar_id, watch_channel_id, watch_resource_id")
    .not("watch_channel_id", "is", null)
    .lt("watch_channel_expiry", oneHourFromNow);

  if (!expiring?.length) return 0;

  let renewed = 0;
  for (const row of expiring) {
    try {
      // Look up user_id for this connection
      const { data: conn } = await admin
        .from("crm_calendar_connections")
        .select("user_id")
        .eq("id", row.connection_id)
        .eq("is_active", true)
        .single();

      if (!conn) continue;

      // Stop old channel (best-effort)
      if (row.watch_channel_id && row.watch_resource_id) {
        try {
          const { driver } = await getCalendarDriverForUser(conn.user_id, row.connection_id);
          await driver.stopWatch(row.watch_channel_id, row.watch_resource_id);
        } catch {
          // Non-fatal — channel may already be expired
        }
      }

      await setupWebhookChannel(conn.user_id, row.connection_id, row.calendar_id);
      renewed++;
    } catch (err) {
      console.error(
        "[calendar/sync] Failed to renew channel for",
        row.connection_id,
        err instanceof Error ? err.message : "unknown"
      );
    }
  }

  return renewed;
}

/**
 * Stop a webhook channel for a connection.
 * Used during disconnect to clean up.
 */
export async function stopWebhookChannel(
  userId: string,
  connectionId: string
): Promise<void> {
  const admin = createSupabaseAdmin();
  if (!admin) return;

  const { data: states } = await admin
    .from("crm_calendar_sync_state")
    .select("watch_channel_id, watch_resource_id")
    .eq("connection_id", connectionId)
    .not("watch_channel_id", "is", null);

  if (!states?.length) return;

  try {
    const { driver } = await getCalendarDriverForUser(userId, connectionId);
    for (const state of states) {
      if (state.watch_channel_id && state.watch_resource_id) {
        try {
          await driver.stopWatch(state.watch_channel_id, state.watch_resource_id);
        } catch {
          // Best-effort — channel may already be expired
        }
      }
    }
  } catch {
    // Connection may already be broken — that's fine, channels will auto-expire
  }
}

/**
 * Check if cached data is stale and trigger sync if needed.
 * Returns true if a sync was triggered.
 */
export async function syncOnReadIfStale(
  userId: string,
  connectionId: string,
  calendarId: string,
  maxAgeMinutes = 15
): Promise<boolean> {
  const admin = createSupabaseAdmin();
  if (!admin) return false;

  const { data: syncState } = await admin
    .from("crm_calendar_sync_state")
    .select("last_incremental_sync_at, last_full_sync_at, sync_status")
    .eq("connection_id", connectionId)
    .eq("calendar_id", calendarId)
    .maybeSingle();

  if (!syncState) return false;

  // Don't trigger if already syncing
  if (syncState.sync_status === "syncing") return false;

  const lastSync = syncState.last_incremental_sync_at ?? syncState.last_full_sync_at;
  if (!lastSync) return false;

  const ageMs = Date.now() - new Date(lastSync).getTime();
  if (ageMs > maxAgeMinutes * 60 * 1000) {
    // Trigger sync non-blocking
    triggerSync(userId, connectionId, calendarId).catch((err) => {
      console.error("[calendar/sync] Sync-on-read failed:", err instanceof Error ? err.message : "unknown");
    });
    return true;
  }

  return false;
}
