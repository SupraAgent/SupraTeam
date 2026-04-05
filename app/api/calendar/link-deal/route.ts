/**
 * POST /api/calendar/link-deal — Link a Google Calendar event to a CRM deal.
 * GET  /api/calendar/link-deal?deal_id=xxx — Get linked calendar events for a deal.
 *
 * Also supports auto-matching: POST with { auto_match: true } scans recent
 * calendar events and matches attendee emails to CRM contacts, suggesting deal links.
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

export async function POST(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const body = await request.json();
  const { deal_id, calendar_event_id, auto_match } = body;

  // Auto-match mode: scan recent events and suggest deal links
  if (auto_match) {
    const { data: events } = await supabase
      .from("crm_calendar_events")
      .select("id, google_event_id, summary, start_at, attendees")
      .gte("start_at", new Date(Date.now() - 7 * 86400_000).toISOString())
      .order("start_at", { ascending: false })
      .limit(50);

    if (!events || events.length === 0) {
      return NextResponse.json({ suggestions: [] });
    }

    // Collect all attendee emails
    const allEmails = new Set<string>();
    for (const ev of events) {
      const attendees = ev.attendees as { email: string }[] | null;
      if (attendees) {
        for (const a of attendees) {
          if (a.email) allEmails.add(a.email.toLowerCase());
        }
      }
    }

    // Match emails to contacts
    const { data: contacts } = await supabase
      .from("crm_contacts")
      .select("id, email, name")
      .in("email", [...allEmails]);

    interface MatchedContact { id: string; email: string; name: string }
    const emailToContact = new Map<string, MatchedContact>(
      (contacts ?? []).map((c: MatchedContact) => [c.email?.toLowerCase(), c])
    );

    // Find deals for matched contacts
    const contactIds = (contacts ?? []).map((c: { id: string }) => c.id);
    const { data: deals } = contactIds.length > 0
      ? await supabase
          .from("crm_deals")
          .select("id, deal_name, contact_id, stage:pipeline_stages(name, color)")
          .in("contact_id", contactIds)
      : { data: [] };

    interface MatchedDeal { contact_id: string; id: string; deal_name: string }
    const contactToDeal = new Map<string, MatchedDeal>(
      (deals ?? []).map((d: MatchedDeal) => [d.contact_id, d])
    );

    // Build suggestions
    const suggestions = events
      .map((ev: { id: string; summary: string; start_at: string; attendees: unknown }) => {
        const attendees = ev.attendees as { email: string }[] | null;
        if (!attendees) return null;
        for (const a of attendees) {
          const contact = emailToContact.get(a.email?.toLowerCase());
          if (contact) {
            const deal = contactToDeal.get(contact.id);
            if (deal) {
              return {
                event_id: ev.id,
                event_summary: ev.summary,
                event_start: ev.start_at,
                contact_name: contact.name,
                deal_id: deal.id,
                deal_name: deal.deal_name,
              };
            }
          }
        }
        return null;
      })
      .filter(Boolean);

    return NextResponse.json({ suggestions });
  }

  // Manual link mode
  if (!deal_id || !calendar_event_id) {
    return NextResponse.json({ error: "deal_id and calendar_event_id required" }, { status: 400 });
  }

  const { error } = await supabase
    .from("crm_deal_calendar_links")
    .upsert({
      deal_id,
      calendar_event_id,
    }, { onConflict: "deal_id,calendar_event_id" });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function GET(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const { searchParams } = new URL(request.url);
  const dealId = searchParams.get("deal_id");

  if (!dealId) {
    return NextResponse.json({ error: "deal_id required" }, { status: 400 });
  }

  const { data: links } = await supabase
    .from("crm_deal_calendar_links")
    .select("calendar_event_id, event:crm_calendar_events(id, summary, start_at, end_at, html_link, attendees)")
    .eq("deal_id", dealId);

  return NextResponse.json({ events: (links ?? []).map((l: { event: unknown }) => l.event) });
}
