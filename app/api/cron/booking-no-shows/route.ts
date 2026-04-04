import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase";

/**
 * GET: Detect no-show bookings.
 * Run via cron every 15 minutes.
 *
 * A booking is considered a no-show when:
 * - Status is 'booked'
 * - scheduled_at + duration + 30 minutes has passed
 * - No transcript exists for this booking
 */
export async function GET(request: Request) {
  // Simple auth for cron: check for secret header
  const cronSecret = request.headers.get("x-cron-secret");
  if (cronSecret !== process.env.CRON_SECRET && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }

  try {
    // Find bookings that are past their scheduled time + duration + 30 min buffer
    const { data: staleBookings } = await admin
      .from("crm_booking_links")
      .select("id, deal_id, user_id, invitee_email, invitee_name, scheduled_at, calendly_event_type_name, calendly_event_type_duration")
      .eq("status", "booked")
      .not("scheduled_at", "is", null)
      .order("scheduled_at", { ascending: true })
      .limit(100);

    if (!staleBookings?.length) {
      return NextResponse.json({ data: { processed: 0 }, source: "cron" });
    }

    const now = Date.now();
    let processed = 0;

    for (const booking of staleBookings) {
      const scheduledAt = new Date(booking.scheduled_at).getTime();
      const durationMs = (booking.calendly_event_type_duration ?? 30) * 60 * 1000;
      const bufferMs = 30 * 60 * 1000; // 30 minute grace period
      const noShowThreshold = scheduledAt + durationMs + bufferMs;

      if (now < noShowThreshold) continue;

      // Check if a transcript already exists (meeting actually happened)
      const { data: transcript } = await admin
        .from("crm_meeting_transcripts")
        .select("id")
        .eq("booking_link_id", booking.id)
        .limit(1)
        .maybeSingle();

      if (transcript) {
        // Meeting happened, mark as completed instead
        await admin
          .from("crm_booking_links")
          .update({ status: "completed", updated_at: new Date().toISOString() })
          .eq("id", booking.id);
        continue;
      }

      // Mark as no-show
      await admin
        .from("crm_booking_links")
        .update({
          status: "no_show",
          no_show_detected_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", booking.id);

      // Log activity
      if (booking.deal_id) {
        await admin.from("crm_deal_activities").insert({
          deal_id: booking.deal_id,
          user_id: booking.user_id,
          activity_type: "meeting_no_show",
          title: `No-show: ${booking.invitee_name || booking.invitee_email || "Invitee"} missed ${booking.calendly_event_type_name || "meeting"}`,
          metadata: {
            booking_link_id: booking.id,
            scheduled_at: booking.scheduled_at,
          },
          reference_id: booking.id,
          reference_type: "booking_link",
        });
      }

      processed++;
    }

    return NextResponse.json({ data: { processed }, source: "cron" });
  } catch (err) {
    console.error("[cron/no-shows] Error:", err instanceof Error ? err.message : "unknown");
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
