import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase";
import { fetchRecentTranscripts, fetchTranscript, extractSpeakers } from "@/lib/fireflies/client";
import { matchBookingLink } from "@/lib/meetings/match-booking";
import { matchOrCreateContact } from "@/lib/contacts/match-or-create";
import { evaluateAutomationRules } from "@/lib/automation-engine";

/**
 * GET: Reconciliation poll for missed Fireflies webhooks.
 * Run via cron every 30 minutes.
 *
 * For each active Fireflies connection, fetches recent transcripts
 * and inserts any that were missed by the webhook (~5% failure rate).
 */
export async function GET(request: Request) {
  const cronSecret = request.headers.get("x-cron-secret");
  if (cronSecret !== process.env.CRON_SECRET && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }

  try {
    // Get all active Fireflies connections
    const { data: connections } = await admin
      .from("crm_fireflies_connections")
      .select("user_id, last_sync_cursor")
      .eq("is_active", true)
      .limit(100);

    if (!connections?.length) {
      return NextResponse.json({ data: { processed: 0 }, source: "cron" });
    }

    let totalProcessed = 0;

    for (const conn of connections) {
      try {
        // Default to 2 hours ago if no cursor
        const since = conn.last_sync_cursor
          ? new Date(conn.last_sync_cursor)
          : new Date(Date.now() - 2 * 60 * 60 * 1000);

        const transcripts = await fetchRecentTranscripts(conn.user_id, since);

        for (const t of transcripts) {
          // Skip if already in our DB
          const { data: existing } = await admin
            .from("crm_meeting_transcripts")
            .select("id")
            .eq("fireflies_meeting_id", t.id)
            .maybeSingle();

          if (existing) continue;

          // Fetch full transcript and process
          try {
            const full = await fetchTranscript(conn.user_id, t.id);
            const attendeeEmails = (full.meeting_attendees ?? [])
              .map((a) => a.email)
              .filter(Boolean);
            const scheduledAt = full.date ? new Date(full.date) : undefined;

            const match = await matchBookingLink({
              googleCalendarEventId: full.cal_id ?? undefined,
              scheduledAt,
              attendeeEmails,
              userId: conn.user_id,
            });

            const actionItems = (full.summary?.action_items ?? []).map((text, i) => ({
              text,
              completed: false,
              index: i,
            }));

            // Insert transcript
            const { data: record } = await admin
              .from("crm_meeting_transcripts")
              .insert({
                user_id: conn.user_id,
                deal_id: match?.dealId ?? null,
                contact_id: match?.contactId ?? null,
                booking_link_id: match?.bookingLinkId ?? null,
                fireflies_meeting_id: t.id,
                title: full.title ?? "Untitled meeting",
                duration_minutes: full.duration ? Math.round(full.duration / 60) : null,
                scheduled_at: scheduledAt?.toISOString() ?? null,
                attendees: full.meeting_attendees ?? [],
                summary: full.summary?.short_summary ?? full.summary?.overview ?? null,
                action_items: actionItems,
                key_topics: full.summary?.keywords ?? [],
                sentiment: full.sentiment ?? {},
                transcript_url: full.transcript_url ?? null,
                speakers: extractSpeakers(full),
                match_confidence: match?.matchTier
                  ? match.matchTier === 1 ? "high" : match.matchTier === 2 ? "high" : "medium"
                  : "unmatched",
              })
              .select("id")
              .single();

            // Mark booking link as completed
            if (match?.bookingLinkId) {
              await admin
                .from("crm_booking_links")
                .update({ status: "completed", updated_at: new Date().toISOString() })
                .eq("id", match.bookingLinkId)
                .eq("status", "booked");
            }

            // Create contact and log activity
            if (match?.dealId && record) {
              await admin.from("crm_deal_activities").insert({
                deal_id: match.dealId,
                user_id: conn.user_id,
                activity_type: "transcript_received",
                title: `Meeting transcript: ${full.title || "Untitled"} (reconciled)`,
                metadata: {
                  transcript_id: record.id,
                  match_tier: match.matchTier,
                  source: "reconciliation",
                },
                reference_id: record.id,
                reference_type: "transcript",
              });

              // Fire workflow trigger (same as webhook handler)
              evaluateAutomationRules({
                type: "meeting_transcribed",
                dealId: match.dealId,
                payload: {
                  transcript_title: full.title,
                  summary: full.summary?.short_summary ?? full.summary?.overview ?? null,
                  action_items_count: actionItems.length,
                  duration_minutes: full.duration ? Math.round(full.duration / 60) : null,
                  transcript_id: record.id,
                  source: "reconciliation",
                },
              }).catch((err) => console.error("[fireflies/reconciliation] workflow trigger error:", err));
            }

            // Contact creation for unmatched transcripts
            if (!match?.contactId && attendeeEmails.length > 0) {
              const externalEmail = attendeeEmails.find(
                (e) => e !== full.organizer_email
              ) ?? attendeeEmails[0];

              try {
                const { contact } = await matchOrCreateContact(
                  admin,
                  externalEmail,
                  full.meeting_attendees?.find((a) => a.email === externalEmail)?.displayName ?? externalEmail,
                  conn.user_id
                );

                if (record) {
                  await admin
                    .from("crm_meeting_transcripts")
                    .update({ contact_id: contact.id })
                    .eq("id", record.id);
                }
              } catch {
                // Non-fatal
              }
            }

            totalProcessed++;
          } catch (err) {
            console.error(`[fireflies/reconciliation] Failed to process transcript ${t.id}:`, err instanceof Error ? err.message : "unknown");
          }
        }

        // Update sync cursor
        await admin
          .from("crm_fireflies_connections")
          .update({
            last_sync_cursor: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", conn.user_id);
      } catch (err) {
        console.error(`[fireflies/reconciliation] Failed for user ${conn.user_id}:`, err instanceof Error ? err.message : "unknown");
      }
    }

    return NextResponse.json({ data: { processed: totalProcessed }, source: "cron" });
  } catch (err) {
    console.error("[fireflies/reconciliation] Error:", err instanceof Error ? err.message : "unknown");
    return NextResponse.json({ error: "Reconciliation failed" }, { status: 500 });
  }
}

