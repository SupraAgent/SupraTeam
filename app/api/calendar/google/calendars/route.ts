import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { getCalendarDriverForUser } from "@/lib/calendar/driver";

/** GET: List the user's Google Calendar list */
export async function GET() {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  try {
    const { driver } = await getCalendarDriverForUser(auth.user.id);
    const calendars = await driver.listCalendars();
    return NextResponse.json({ data: calendars, source: "google_calendar" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to list calendars";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
