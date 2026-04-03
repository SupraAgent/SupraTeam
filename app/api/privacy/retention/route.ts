/**
 * GET  /api/privacy/retention — List data retention policies
 * PUT  /api/privacy/retention — Update a retention policy
 * POST /api/privacy/retention — Run purge for a specific data type
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

const PURGE_TARGETS: Record<string, { table: string; dateCol: string }> = {
  messages: { table: "tg_group_messages", dateCol: "synced_at" },
  audit_logs: { table: "crm_email_audit_log", dateCol: "created_at" },
  tracking_events: { table: "crm_email_tracking_events", dateCol: "created_at" },
  webhook_deliveries: { table: "crm_webhook_deliveries", dateCol: "created_at" },
  ai_conversations: { table: "crm_ai_conversations", dateCol: "created_at" },
  outreach_step_logs: { table: "crm_outreach_step_log", dateCol: "created_at" },
};

export async function GET() {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const { data: policies } = await supabase
    .from("crm_data_retention_policies")
    .select("*")
    .order("data_type");

  // Get row counts for each data type
  const counts: Record<string, number> = {};
  for (const [key, target] of Object.entries(PURGE_TARGETS)) {
    const { count } = await supabase
      .from(target.table)
      .select("*", { count: "exact", head: true });
    counts[key] = count ?? 0;
  }

  return NextResponse.json({ policies: policies ?? [], counts });
}

export async function PUT(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const { id, retention_days, auto_purge } = await request.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (retention_days !== undefined) updates.retention_days = retention_days;
  if (auto_purge !== undefined) updates.auto_purge = auto_purge;

  const { error } = await supabase
    .from("crm_data_retention_policies")
    .update(updates)
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function POST(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const { data_type } = await request.json();
  const target = PURGE_TARGETS[data_type];
  if (!target) return NextResponse.json({ error: "Invalid data type" }, { status: 400 });

  // Get retention policy
  const { data: policy } = await supabase
    .from("crm_data_retention_policies")
    .select("*")
    .eq("data_type", data_type)
    .single();

  if (!policy) return NextResponse.json({ error: "No policy found" }, { status: 404 });

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - policy.retention_days);

  // Count before delete
  const { count: beforeCount } = await supabase
    .from(target.table)
    .select("*", { count: "exact", head: true })
    .lt(target.dateCol, cutoff.toISOString());

  const { error } = await supabase
    .from(target.table)
    .delete()
    .lt(target.dateCol, cutoff.toISOString());

  const count = beforeCount ?? 0;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Update last purged
  await supabase
    .from("crm_data_retention_policies")
    .update({ last_purged_at: new Date().toISOString() })
    .eq("id", policy.id);

  return NextResponse.json({ ok: true, purged: count ?? 0 });
}
