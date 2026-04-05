import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { getCalendarDriverForUser, checkCalendarScopes } from "@/lib/calendar/driver";
import { CalendarApiException } from "@/lib/calendar/google";
import { toExclusiveEndDate } from "@/lib/calendar/utils";
import { syncOnReadIfStale } from "@/lib/calendar/sync";

// Validates an ISO date or datetime string format (anchored to prevent injection)
const DATE_PARAM_REGEX = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?)?$/;

/** GET: Fetch cached calendar events from DB (with optional time range) */
export async function GET(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const calendarId = searchParams.get("calendarId");

  // Validate date params to prevent PostgREST filter injection
  if (from && !DATE_PARAM_REGEX.test(from)) {
    return NextResponse.json({ error: "Invalid 'from' date format" }, { status: 400 });
  }
  if (to && !DATE_PARAM_REGEX.test(to)) {
    return NextResponse.json({ error: "Invalid 'to' date format" }, { status: 400 });
  }

  try {
    // Sync-on-read: trigger incremental sync if data is stale (>15 min)
    try {
      const { connection } = await getCalendarDriverForUser(auth.user.id);
      const targetCal = calendarId ?? "primary";
      await syncOnReadIfStale(auth.user.id, connection.id, targetCal);
    } catch {
      // Non-fatal — proceed with cached data even if sync check fails
    }

    // Use separate queries for timed events (start_at) and all-day events (start_date)
    // then merge results, avoiding .or() string interpolation entirely
    const timedQuery = auth.admin
      .from("crm_calendar_events")
      .select(`
        id, calendar_id, google_event_id, summary, description, location,
        start_at, end_at, start_date, end_date, is_all_day, status,
        organizer, attendees, recurring_event_id, html_link, hangout_link,
        synced_at
      `)
      .eq("user_id", auth.user.id)
      .neq("status", "cancelled")
      .eq("is_all_day", false)
      .order("start_at", { ascending: true, nullsFirst: false });

    const allDayQuery = auth.admin
      .from("crm_calendar_events")
      .select(`
        id, calendar_id, google_event_id, summary, description, location,
        start_at, end_at, start_date, end_date, is_all_day, status,
        organizer, attendees, recurring_event_id, html_link, hangout_link,
        synced_at
      `)
      .eq("user_id", auth.user.id)
      .neq("status", "cancelled")
      .eq("is_all_day", true)
      .order("start_date", { ascending: true, nullsFirst: false });

    let timedQ = timedQuery;
    let allDayQ = allDayQuery;

    if (calendarId) {
      timedQ = timedQ.eq("calendar_id", calendarId);
      allDayQ = allDayQ.eq("calendar_id", calendarId);
    }

    if (from) {
      timedQ = timedQ.gte("start_at", from);
      allDayQ = allDayQ.gte("start_date", from.substring(0, 10));
    }
    if (to) {
      timedQ = timedQ.lte("start_at", to);
      allDayQ = allDayQ.lte("start_date", to.substring(0, 10));
    }

    timedQ = timedQ.limit(500);
    allDayQ = allDayQ.limit(500);

    const [timedResult, allDayResult] = await Promise.all([timedQ, allDayQ]);

    if (timedResult.error) {
      console.error("[calendar/events]", timedResult.error.message);
      return NextResponse.json({ error: "Failed to fetch events" }, { status: 500 });
    }
    if (allDayResult.error) {
      console.error("[calendar/events]", allDayResult.error.message);
      return NextResponse.json({ error: "Failed to fetch events" }, { status: 500 });
    }

    // Merge and sort by start time (start_at for timed, start_date for all-day)
    const merged = [...(timedResult.data ?? []), ...(allDayResult.data ?? [])];
    merged.sort((a, b) => {
      const aTime = a.start_at ?? a.start_date ?? "";
      const bTime = b.start_at ?? b.start_date ?? "";
      return aTime < bTime ? -1 : aTime > bTime ? 1 : 0;
    });

    return NextResponse.json({ data: merged, source: "cache" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to fetch events";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** POST: Create a new event on Google Calendar */
export async function POST(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  try {
    const body = await request.json();
    const { summary, description, location, startAt, endAt, startDate, endDate, attendees, calendarId } = body as {
      summary?: string;
      description?: string;
      location?: string;
      startAt?: string;
      endAt?: string;
      startDate?: string;
      endDate?: string;
      attendees?: { email: string }[];
      calendarId?: string;
    };

    if (!summary) {
      return NextResponse.json({ error: "summary is required" }, { status: 400 });
    }

    if (!startAt && !startDate) {
      return NextResponse.json({ error: "startAt or startDate is required" }, { status: 400 });
    }

    // Validate end times: timed events require endAt, all-day events default endDate to startDate
    if (startAt && !endAt) {
      return NextResponse.json({ error: "endAt is required when startAt is provided" }, { status: 400 });
    }

    // Default endDate to startDate for all-day events if not specified
    const resolvedEndDate = startDate ? (endDate ?? startDate) : endDate;

    const { driver, connection } = await getCalendarDriverForUser(auth.user.id);

    // Check write scope before creating events
    const scopes = checkCalendarScopes(connection);
    if (!scopes.canWrite) {
      return NextResponse.json(
        { error: "Missing write permission for Google Calendar. Please reconnect with full access." },
        { status: 403 }
      );
    }

    const targetCalendar = calendarId ?? "primary";

    // Convert inclusive end date to Google's exclusive format for all-day events
    const googleEndDate = resolvedEndDate ? toExclusiveEndDate(resolvedEndDate) : undefined;

    const event = await driver.createEvent(targetCalendar, {
      summary,
      description,
      location,
      startAt,
      endAt,
      startDate,
      endDate: startDate ? googleEndDate : endDate,
      attendees,
    });

    // Cache the created event in DB
    await auth.admin.from("crm_calendar_events").upsert({
      user_id: auth.user.id,
      connection_id: connection.id,
      calendar_id: targetCalendar,
      google_event_id: event.id,
      summary: event.summary,
      description: event.description ?? null,
      location: event.location ?? null,
      start_at: event.startAt ?? null,
      end_at: event.endAt ?? null,
      start_date: event.startDate ?? null,
      end_date: event.endDate ?? null,
      is_all_day: event.isAllDay,
      status: event.status,
      organizer: event.organizer ?? null,
      attendees: event.attendees ?? null,
      html_link: event.htmlLink ?? null,
      hangout_link: event.hangoutLink ?? null,
      etag: event.etag ?? null,
      synced_at: new Date().toISOString(),
    }, { onConflict: "user_id,calendar_id,google_event_id" });

    return NextResponse.json({ data: event, source: "google_calendar" });
  } catch (err) {
    if (err instanceof CalendarApiException) {
      const { calError } = err;
      const statusMap: Record<string, number> = {
        auth_expired: 401,
        scope_denied: 403,
        admin_blocked: 403,
        rate_limited: 429,
      };
      return NextResponse.json(
        { error: calError.message },
        { status: statusMap[calError.type] ?? 500 }
      );
    }
    const msg = err instanceof Error ? err.message : "Failed to create event";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
