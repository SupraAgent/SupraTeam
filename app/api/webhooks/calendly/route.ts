import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { createSupabaseAdmin } from "@/lib/supabase";
import { matchOrCreateContact } from "@/lib/contacts/match-or-create";
import { hashPII } from "@/lib/crypto";

/**
 * POST: Calendly webhook handler.
 * Receives invitee.created and invitee.canceled events.
 * CRITICAL: Always returns 200 to avoid Calendly marking endpoint as unhealthy.
 */
export async function POST(request: Request) {
  const admin = createSupabaseAdmin();
  if (!admin) {
    console.error("[calendly/webhook] Supabase not configured");
    return new NextResponse(null, { status: 200 });
  }

  try {
    // Verify webhook signature
    const signature = request.headers.get("calendly-webhook-signature");
    const body = await request.text();
    const signingKey = process.env.CALENDLY_WEBHOOK_SIGNING_KEY;

    if (signingKey) {
      if (!signature || !verifyCalendlySignature(body, signature, signingKey)) {
        console.error("[calendly/webhook] Missing or invalid signature");
        return new NextResponse(null, { status: 200 });
      }
    } else if (process.env.NODE_ENV === "production") {
      console.error("[calendly/webhook] CALENDLY_WEBHOOK_SIGNING_KEY not set in production");
      return new NextResponse(null, { status: 200 });
    }

    const payload = JSON.parse(body);
    const event = payload.event as string;
    const data = payload.payload;

    if (event === "invitee.created") {
      await handleInviteeCreated(data, admin);
    } else if (event === "invitee.canceled") {
      await handleInviteeCanceled(data, admin);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[calendly/webhook] Error:", err instanceof Error ? err.message : "unknown");
    return new NextResponse(null, { status: 200 });
  }
}

function verifyCalendlySignature(body: string, signatureHeader: string, key: string): boolean {
  try {
    // Calendly sends: t=timestamp,v1=signature
    const parts = signatureHeader.split(",");
    const timestamp = parts.find((p) => p.startsWith("t="))?.slice(2);
    const sig = parts.find((p) => p.startsWith("v1="))?.slice(3);

    if (!timestamp || !sig) return false;

    // Tolerance: 5 minutes
    const ts = parseInt(timestamp, 10);
    if (Math.abs(Date.now() / 1000 - ts) > 300) return false;

    const expected = createHmac("sha256", key)
      .update(`${timestamp}.${body}`)
      .digest("hex");

    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

async function handleInviteeCreated(
  data: Record<string, unknown>,
  admin: NonNullable<ReturnType<typeof createSupabaseAdmin>>
) {
  const inviteeEmail = (data.email as string)?.toLowerCase()?.trim();
  const inviteeName = data.name as string;
  const eventUri = data.event as string;
  const scheduledEvent = data.scheduled_event as Record<string, unknown> | undefined;
  const scheduledAt = (scheduledEvent?.start_time as string | undefined) ??
    (data as Record<string, unknown>).scheduled_event_start_time as string | undefined;
  const googleCalEventId = scheduledEvent?.google_calendar_event_id as string | undefined;
  const utmSource = (data.tracking as Record<string, string>)?.utm_source;
  const utmCampaign = (data.tracking as Record<string, string>)?.utm_campaign; // deal_id
  const utmContent = (data.tracking as Record<string, string>)?.utm_content; // contact_id

  if (!inviteeEmail) {
    console.error("[calendly/webhook] No invitee email in payload");
    return;
  }

  // Idempotency: check if we already processed this event
  if (eventUri) {
    const { data: existing } = await admin
      .from("crm_booking_links")
      .select("id")
      .eq("calendly_event_uri", eventUri)
      .limit(1)
      .maybeSingle();

    if (existing) {
      return; // Already processed
    }
  }

  // Resolve the host user first — this is the primary identification signal
  let userId: string | null = null;
  const eventHostUri = (data as Record<string, unknown>).event_memberships as Array<{ user: string }> | undefined;
  if (eventHostUri?.[0]?.user) {
    const { data: conn } = await admin
      .from("crm_calendly_connections")
      .select("user_id")
      .eq("calendly_user_uri", eventHostUri[0].user)
      .eq("is_active", true)
      .single();

    if (conn) userId = conn.user_id;
  }

  // Try to match booking link via UTM deal_id
  let bookingLink: Record<string, unknown> | null = null;
  let dealId: string | null = utmCampaign || null;

  if (utmSource === "supracrm" && utmCampaign) {
    // Match by deal_id from UTM
    const query = admin
      .from("crm_booking_links")
      .select("*")
      .eq("deal_id", utmCampaign)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1);

    // Scope to user if known
    if (userId) query.eq("user_id", userId);

    const { data: links } = await query;

    if (links?.[0]) {
      bookingLink = links[0];
      userId = userId || links[0].user_id;
    }
  }

  // Fallback: find most recent pending link for THIS user only
  if (!bookingLink && userId) {
    const { data: links } = await admin
      .from("crm_booking_links")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1);

    if (links?.[0]) {
      bookingLink = links[0];
      dealId = dealId || (links[0].deal_id as string);
    }
  }

  if (!userId) {
    console.error("[calendly/webhook] Could not determine user for booking", {
      event_uri: eventUri,
      invitee_email_hash: hashPII(inviteeEmail),
      host_uri: eventHostUri?.[0]?.user ?? "none",
      utm_source: utmSource ?? "none",
    });
    return;
  }

  // Update the matched booking link
  if (bookingLink) {
    await admin
      .from("crm_booking_links")
      .update({
        status: "booked",
        invitee_email: inviteeEmail,
        invitee_name: inviteeName,
        scheduled_at: scheduledAt || null,
        calendly_event_uri: eventUri || null,
        google_calendar_event_id: googleCalEventId || null,
        booked_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", bookingLink.id);
  } else {
    // Create a new booking link record for untracked bookings
    const { data: newLink } = await admin
      .from("crm_booking_links")
      .insert({
        user_id: userId,
        deal_id: dealId,
        calendly_event_type_uri: "unknown",
        calendly_scheduling_link: "direct",
        status: "booked",
        invitee_email: inviteeEmail,
        invitee_name: inviteeName,
        scheduled_at: scheduledAt || null,
        calendly_event_uri: eventUri || null,
        google_calendar_event_id: googleCalEventId || null,
        booked_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    bookingLink = newLink;
  }

  // Match or create contact
  const { contact } = await matchOrCreateContact(admin, inviteeEmail, inviteeName || inviteeEmail, userId);

  // Find the deal to auto-advance
  if (!dealId) {
    // Try to find a deal for this contact in "Calendly Sent" or "Outreach" stage
    const { data: deals } = await admin
      .from("crm_deals")
      .select("id, stage:pipeline_stages!inner(name)")
      .eq("contact_id", contact.id)
      .eq("outcome", "open")
      .order("updated_at", { ascending: false })
      .limit(5);

    if (deals?.length === 1) {
      dealId = deals[0].id;
    } else if (deals && deals.length > 1) {
      // Prefer deal in "Calendly Sent" stage
      const calendlySent = deals.find(
        (d) => (d.stage as unknown as { name: string })?.name === "Calendly Sent"
      );
      if (calendlySent) dealId = calendlySent.id;
      // If ambiguous, don't auto-advance — will show as unmatched notification
    }
  }

  // Auto-advance deal from "Calendly Sent" to "Video Call"
  if (dealId) {
    // Update booking link with deal_id if it wasn't set
    if (bookingLink && !bookingLink.deal_id) {
      await admin
        .from("crm_booking_links")
        .update({ deal_id: dealId, contact_id: contact.id })
        .eq("id", bookingLink.id);
    }

    const { data: deal } = await admin
      .from("crm_deals")
      .select("id, stage_id, stage:pipeline_stages!inner(name, board_type)")
      .eq("id", dealId)
      .single();

    if (deal) {
      const stageName = (deal.stage as unknown as { name: string; board_type: string })?.name;
      const boardType = (deal.stage as unknown as { name: string; board_type: string })?.board_type;

      // Only auto-advance from "Calendly Sent" — don't regress
      if (stageName === "Calendly Sent") {
        const { data: videoCallStage } = await admin
          .from("pipeline_stages")
          .select("id")
          .eq("name", "Video Call")
          .eq("board_type", boardType)
          .single();

        if (videoCallStage) {
          await admin
            .from("crm_deals")
            .update({
              stage_id: videoCallStage.id,
              stage_changed_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq("id", dealId);

          // Log stage change in history
          await admin.from("crm_deal_stage_history").insert({
            deal_id: dealId,
            from_stage_id: deal.stage_id,
            to_stage_id: videoCallStage.id,
            changed_by: userId,
          });

          // Log activity
          await admin.from("crm_deal_activities").insert({
            deal_id: dealId,
            user_id: userId,
            activity_type: "stage_change",
            title: "Auto-advanced to Video Call (Calendly booking)",
            metadata: { from_stage: "Calendly Sent", to_stage: "Video Call", trigger: "calendly_booking" },
          });
        }
      }

      // Log meeting scheduled activity
      await admin.from("crm_deal_activities").insert({
        deal_id: dealId,
        user_id: userId,
        activity_type: "meeting_scheduled",
        title: `Meeting scheduled with ${inviteeName || inviteeEmail}`,
        metadata: {
          invitee_email: inviteeEmail,
          invitee_name: inviteeName,
          scheduled_at: scheduledAt,
          booking_link_id: bookingLink?.id,
        },
        reference_id: bookingLink?.id as string,
        reference_type: "booking_link",
      });
    }
  }
}

async function handleInviteeCanceled(
  data: Record<string, unknown>,
  admin: NonNullable<ReturnType<typeof createSupabaseAdmin>>
) {
  const eventUri = data.event as string;
  const cancelerEmail = (data.email as string)?.toLowerCase()?.trim();
  const rescheduled = (data as Record<string, unknown>).rescheduled === true;

  if (!eventUri) return;

  // Find the booking link
  const { data: bookingLink } = await admin
    .from("crm_booking_links")
    .select("id, deal_id, user_id")
    .eq("calendly_event_uri", eventUri)
    .single();

  if (!bookingLink) return;

  const newStatus = rescheduled ? "rescheduled" : "canceled";

  await admin
    .from("crm_booking_links")
    .update({
      status: newStatus,
      canceled_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", bookingLink.id);

  // Log activity
  if (bookingLink.deal_id) {
    await admin.from("crm_deal_activities").insert({
      deal_id: bookingLink.deal_id,
      user_id: bookingLink.user_id,
      activity_type: rescheduled ? "meeting_rescheduled" : "meeting_canceled",
      title: rescheduled
        ? `Meeting rescheduled by ${cancelerEmail || "invitee"}`
        : `Meeting canceled by ${cancelerEmail || "invitee"}`,
      metadata: { booking_link_id: bookingLink.id, rescheduled },
      reference_id: bookingLink.id,
      reference_type: "booking_link",
    });
  }

  // NOTE: Do NOT regress deal stage on cancellation — rep should decide next action
}
