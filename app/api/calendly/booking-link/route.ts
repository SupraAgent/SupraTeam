import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { rateLimit } from "@/lib/rate-limit";
import {
  createSchedulingLink,
  getCalendlyEventTypes,
} from "@/lib/calendly/client";

/** POST: Generate a tracked Calendly booking link for a deal */
export async function POST(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  const rl = rateLimit(`calendly-booking:${auth.user.id}`, { max: 30, windowSec: 60 });
  if (rl) return rl;

  try {
    const body = await request.json();
    const { deal_id, contact_id, event_type_uri, tg_chat_id } = body as {
      deal_id?: string;
      contact_id?: string;
      event_type_uri?: string;
      tg_chat_id?: number;
    };

    // Resolve event type
    let resolvedUri = event_type_uri;
    let eventTypeName: string | null = null;
    let eventTypeDuration: number | null = null;

    if (!resolvedUri) {
      // Auto-select if user has exactly 1 event type
      const eventTypes = await getCalendlyEventTypes(auth.user.id);
      if (eventTypes.length === 0) {
        return NextResponse.json(
          { error: "No active Calendly event types found. Create one in Calendly first." },
          { status: 400 }
        );
      }
      if (eventTypes.length === 1) {
        resolvedUri = eventTypes[0].uri;
        eventTypeName = eventTypes[0].name;
        eventTypeDuration = eventTypes[0].duration;
      } else {
        return NextResponse.json(
          { error: "Multiple event types found. Please specify event_type_uri.", event_types: eventTypes },
          { status: 400 }
        );
      }
    } else {
      // Look up name/duration from cache
      const eventTypes = await getCalendlyEventTypes(auth.user.id);
      const match = eventTypes.find((et) => et.uri === resolvedUri);
      if (match) {
        eventTypeName = match.name;
        eventTypeDuration = match.duration;
      }
    }

    // Create single-use scheduling link via Calendly API
    const { booking_url } = await createSchedulingLink(auth.user.id, resolvedUri);

    // Append UTM params for tracking
    const utmParams: Record<string, string> = {
      utm_source: "supracrm",
    };
    if (deal_id) utmParams.utm_campaign = deal_id;
    if (contact_id) utmParams.utm_content = contact_id;

    const urlWithUtm = new URL(booking_url);
    for (const [k, v] of Object.entries(utmParams)) {
      urlWithUtm.searchParams.set(k, v);
    }
    const trackedUrl = urlWithUtm.toString();

    // Store booking link in DB
    const { data: bookingLink, error: insertError } = await auth.admin
      .from("crm_booking_links")
      .insert({
        user_id: auth.user.id,
        deal_id: deal_id || null,
        contact_id: contact_id || null,
        calendly_event_type_uri: resolvedUri,
        calendly_event_type_name: eventTypeName,
        calendly_event_type_duration: eventTypeDuration,
        calendly_scheduling_link: trackedUrl,
        utm_params: utmParams,
        tg_chat_id: tg_chat_id || null,
        status: "pending",
      })
      .select("id")
      .single();

    if (insertError) {
      console.error("[calendly/booking-link] Insert failed:", insertError.message);
      return NextResponse.json({ error: "Failed to store booking link" }, { status: 500 });
    }

    // Log deal activity
    if (deal_id) {
      await auth.admin.from("crm_deal_activities").insert({
        deal_id,
        user_id: auth.user.id,
        activity_type: "booking_link_sent",
        title: `Booking link sent: ${eventTypeName || "Meeting"}`,
        metadata: { booking_link_id: bookingLink.id, event_type: eventTypeName },
        reference_id: bookingLink.id,
        reference_type: "booking_link",
      });
    }

    return NextResponse.json({
      data: {
        booking_url: trackedUrl,
        booking_link_id: bookingLink.id,
        event_type_name: eventTypeName,
      },
      source: "calendly",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to generate booking link";
    console.error("[calendly/booking-link]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
