import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

/** GET: All meeting data for a deal (upcoming bookings + past transcripts) */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  try {
    const [bookingsRes, transcriptsRes] = await Promise.all([
      auth.admin
        .from("crm_booking_links")
        .select("id, status, invitee_email, invitee_name, scheduled_at, calendly_event_type_name, calendly_event_type_duration, booked_at, canceled_at, no_show_detected_at, tg_chat_id, created_at")
        .eq("deal_id", id)
        .order("scheduled_at", { ascending: false }),
      auth.admin
        .from("crm_meeting_transcripts")
        .select("id, title, duration_minutes, scheduled_at, summary, action_items, sentiment, transcript_url, speakers, attendees, created_at")
        .eq("deal_id", id)
        .order("scheduled_at", { ascending: false }),
    ]);

    const now = new Date().toISOString();
    const bookings = bookingsRes.data ?? [];
    const transcripts = transcriptsRes.data ?? [];

    const upcoming = bookings.filter(
      (b) => b.status === "booked" && b.scheduled_at && b.scheduled_at > now
    );
    const past = bookings.filter(
      (b) => b.status !== "pending" && (b.status !== "booked" || !b.scheduled_at || b.scheduled_at <= now)
    );

    return NextResponse.json({
      data: {
        upcoming,
        past,
        transcripts,
      },
      source: "deal_meetings",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to fetch meetings";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
