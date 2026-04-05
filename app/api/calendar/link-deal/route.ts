/**
 * POST /api/calendar/link-deal — Link a calendar event to a deal
 * DELETE /api/calendar/link-deal — Unlink a calendar event from a deal
 * GET /api/calendar/link-deal?deal_id=X — Get linked events for a deal
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

export async function POST(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const { calendar_event_id, deal_id } = await request.json();

  if (!calendar_event_id || !deal_id) {
    return NextResponse.json({ error: "calendar_event_id and deal_id required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("crm_calendar_event_deals")
    .upsert({ calendar_event_id, deal_id }, { onConflict: "calendar_event_id,deal_id" })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ link: data, ok: true });
}

export async function DELETE(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const { calendar_event_id, deal_id } = await request.json();

  if (!calendar_event_id || !deal_id) {
    return NextResponse.json({ error: "calendar_event_id and deal_id required" }, { status: 400 });
  }

  const { error } = await supabase
    .from("crm_calendar_event_deals")
    .delete()
    .eq("calendar_event_id", calendar_event_id)
    .eq("deal_id", deal_id);

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
  const eventId = searchParams.get("event_id");

  if (!dealId && !eventId) {
    return NextResponse.json({ error: "deal_id or event_id required" }, { status: 400 });
  }

  let query = supabase
    .from("crm_calendar_event_deals")
    .select(`
      id,
      calendar_event_id,
      deal_id,
      event:crm_calendar_events(id, summary, start_at, start_date, hangout_link, html_link),
      deal:crm_deals(id, deal_name, board_type, stage:pipeline_stages(name, color))
    `);

  if (dealId) query = query.eq("deal_id", dealId);
  if (eventId) query = query.eq("calendar_event_id", eventId);

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ links: data ?? [] });
}
