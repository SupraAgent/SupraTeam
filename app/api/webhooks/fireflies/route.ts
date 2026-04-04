import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { createSupabaseAdmin } from "@/lib/supabase";
import { fetchTranscript } from "@/lib/fireflies/client";
import { matchBookingLink } from "@/lib/meetings/match-booking";
import { matchOrCreateContact } from "@/lib/contacts/match-or-create";
import { hashPII } from "@/lib/crypto";

/**
 * POST: Fireflies webhook handler.
 * Receives transcription_complete events.
 * CRITICAL: Always returns 200 to avoid Fireflies marking endpoint as unhealthy.
 */
export async function POST(request: Request) {
  const admin = createSupabaseAdmin();
  if (!admin) {
    console.error("[fireflies/webhook] Supabase not configured");
    return new NextResponse(null, { status: 200 });
  }

  try {
    const url = new URL(request.url);
    const uid = url.searchParams.get("uid");

    if (!uid) {
      console.error("[fireflies/webhook] Missing uid param");
      return new NextResponse(null, { status: 200 });
    }

    const body = await request.text();

    // Verify webhook signature if secret exists
    const signature = request.headers.get("x-webhook-signature") ||
      request.headers.get("x-fireflies-signature");

    const { data: conn } = await admin
      .from("crm_fireflies_connections")
      .select("user_id, webhook_secret, is_active")
      .eq("user_id", uid)
      .eq("is_active", true)
      .single();

    if (!conn) {
      console.error("[fireflies/webhook] No active connection for uid:", uid);
      return new NextResponse(null, { status: 200 });
    }

    if (conn.webhook_secret && signature) {
      const expected = createHmac("sha256", conn.webhook_secret)
        .update(body)
        .digest("hex");
      const a = Buffer.from(signature);
      const b = Buffer.from(expected);
      if (a.length !== b.length || !timingSafeEqual(a, b)) {
        console.error("[fireflies/webhook] Invalid signature");
        return new NextResponse(null, { status: 200 });
      }
    }

    const payload = JSON.parse(body);
    const eventType = payload.event_type || payload.type;
    const meetingId = payload.meeting_id || payload.data?.meeting_id || payload.transcriptId;

    if (eventType !== "Transcription completed" && eventType !== "transcription_complete") {
      // Ignore non-transcription events
      return NextResponse.json({ ok: true });
    }

    if (!meetingId) {
      console.error("[fireflies/webhook] No meeting_id in payload");
      return new NextResponse(null, { status: 200 });
    }

    // Idempotency: check if already processed
    const { data: existing } = await admin
      .from("crm_meeting_transcripts")
      .select("id")
      .eq("fireflies_meeting_id", meetingId)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ ok: true }); // Already processed
    }

    // Fetch full transcript from Fireflies API
    await handleTranscriptionComplete(meetingId, conn.user_id, admin);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[fireflies/webhook] Error:", err instanceof Error ? err.message : "unknown");
    return new NextResponse(null, { status: 200 });
  }
}

async function handleTranscriptionComplete(
  meetingId: string,
  userId: string,
  admin: NonNullable<ReturnType<typeof createSupabaseAdmin>>
) {
  // Fetch transcript from Fireflies
  let transcript;
  try {
    transcript = await fetchTranscript(userId, meetingId);
  } catch (err) {
    console.error("[fireflies/webhook] Failed to fetch transcript:", err instanceof Error ? err.message : "unknown");
    // Insert a placeholder record so reconciliation can backfill
    await admin.from("crm_meeting_transcripts").insert({
      user_id: userId,
      fireflies_meeting_id: meetingId,
      title: "Transcript pending",
    });
    return;
  }

  // Extract attendee emails
  const attendeeEmails = (transcript.meeting_attendees ?? [])
    .map((a) => a.email)
    .filter(Boolean);

  // Parse scheduled time
  const scheduledAt = transcript.date ? new Date(transcript.date) : undefined;

  // 3-tier matching
  const match = await matchBookingLink({
    googleCalendarEventId: transcript.cal_id ?? undefined,
    scheduledAt,
    attendeeEmails,
    userId,
  });

  // Extract structured data from transcript summary
  const actionItems = (transcript.summary?.action_items ?? []).map((text, i) => ({
    text,
    completed: false,
    index: i,
  }));

  const keyTopics = transcript.summary?.keywords ?? [];

  // Insert transcript record
  const { data: transcriptRecord } = await admin
    .from("crm_meeting_transcripts")
    .insert({
      user_id: userId,
      deal_id: match?.dealId ?? null,
      contact_id: match?.contactId ?? null,
      booking_link_id: match?.bookingLinkId ?? null,
      fireflies_meeting_id: meetingId,
      title: transcript.title ?? "Untitled meeting",
      duration_minutes: transcript.duration ? Math.round(transcript.duration / 60) : null,
      scheduled_at: scheduledAt?.toISOString() ?? null,
      attendees: transcript.meeting_attendees ?? [],
      summary: transcript.summary?.short_summary ?? transcript.summary?.overview ?? null,
      action_items: actionItems,
      key_topics: keyTopics,
      sentiment: {},
      transcript_url: transcript.transcript_url ?? null,
      speakers: extractSpeakers(transcript),
    })
    .select("id")
    .single();

  // If matched to a booking link, update its status to completed
  if (match?.bookingLinkId) {
    await admin
      .from("crm_booking_links")
      .update({ status: "completed", updated_at: new Date().toISOString() })
      .eq("id", match.bookingLinkId)
      .eq("status", "booked");
  }

  // Match or create contact from attendees (pick first non-organizer)
  let contactId = match?.contactId ?? null;
  if (!contactId && attendeeEmails.length > 0) {
    const externalEmail = attendeeEmails.find(
      (e) => e !== transcript.organizer_email
    ) ?? attendeeEmails[0];

    try {
      const { contact } = await matchOrCreateContact(
        admin,
        externalEmail,
        transcript.meeting_attendees?.find((a) => a.email === externalEmail)?.displayName ?? externalEmail,
        userId
      );
      contactId = contact.id;

      // Update transcript with contact
      if (transcriptRecord) {
        await admin
          .from("crm_meeting_transcripts")
          .update({ contact_id: contactId })
          .eq("id", transcriptRecord.id);
      }
    } catch {
      // Non-fatal: contact creation failed
    }
  }

  // Log deal activity
  const dealId = match?.dealId ?? null;
  if (dealId && transcriptRecord) {
    await admin.from("crm_deal_activities").insert({
      deal_id: dealId,
      user_id: userId,
      activity_type: "transcript_received",
      title: `Meeting transcript: ${transcript.title || "Untitled"}`,
      metadata: {
        transcript_id: transcriptRecord.id,
        duration_minutes: transcript.duration ? Math.round(transcript.duration / 60) : null,
        action_items_count: actionItems.length,
        match_tier: match?.matchTier,
        attendee_count: attendeeEmails.length,
      },
      reference_id: transcriptRecord.id,
      reference_type: "transcript",
    });
  }

  // If no deal match, try to find a deal via contact
  if (!dealId && contactId) {
    const { data: deals } = await admin
      .from("crm_deals")
      .select("id")
      .eq("contact_id", contactId)
      .eq("outcome", "open")
      .order("updated_at", { ascending: false })
      .limit(1);

    if (deals?.[0] && transcriptRecord) {
      await admin
        .from("crm_meeting_transcripts")
        .update({ deal_id: deals[0].id })
        .eq("id", transcriptRecord.id);

      await admin.from("crm_deal_activities").insert({
        deal_id: deals[0].id,
        user_id: userId,
        activity_type: "transcript_received",
        title: `Meeting transcript: ${transcript.title || "Untitled"}`,
        metadata: {
          transcript_id: transcriptRecord.id,
          match_tier: "contact_fallback",
          attendee_count: attendeeEmails.length,
        },
        reference_id: transcriptRecord.id,
        reference_type: "transcript",
      });
    }
  }

  if (!dealId && !contactId) {
    console.warn("[fireflies/webhook] Transcript saved but no deal/contact match", {
      meeting_id: meetingId,
      attendee_emails_hash: attendeeEmails.map(hashPII),
    });
  }
}

function extractSpeakers(transcript: {
  sentences?: Array<{ speaker_id: number; speaker_name: string; start_time: number; end_time: number }>;
}): Array<{ name: string; talk_time_pct: number }> {
  if (!transcript.sentences?.length) return [];

  const speakerTime = new Map<string, number>();
  let totalTime = 0;

  for (const s of transcript.sentences) {
    const duration = Math.max(0, s.end_time - s.start_time);
    speakerTime.set(s.speaker_name, (speakerTime.get(s.speaker_name) ?? 0) + duration);
    totalTime += duration;
  }

  if (totalTime === 0) return [];

  return Array.from(speakerTime.entries()).map(([name, time]) => ({
    name,
    talk_time_pct: Math.round((time / totalTime) * 100),
  }));
}
