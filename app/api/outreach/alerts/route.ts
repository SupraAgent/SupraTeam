/**
 * GET  /api/outreach/alerts — Fetch undismissed alerts
 * PATCH /api/outreach/alerts — Dismiss an alert by id
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

export async function GET() {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const { data: alerts, error } = await supabase
    .from("crm_outreach_alerts")
    .select("id, sequence_id, alert_type, message, created_at, crm_outreach_sequences(name)")
    .eq("dismissed", false)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const enriched = (alerts ?? []).map((a) => ({
    id: a.id,
    sequence_id: a.sequence_id,
    alert_type: a.alert_type,
    message: a.message,
    created_at: a.created_at,
    sequence_name: (a.crm_outreach_sequences as unknown as { name: string } | null)?.name ?? "Unknown",
  }));

  return NextResponse.json({ alerts: enriched });
}

export async function PATCH(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const { id } = await request.json();
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const { error } = await supabase
    .from("crm_outreach_alerts")
    .update({ dismissed: true })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
