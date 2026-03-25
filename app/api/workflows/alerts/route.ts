import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

/** GET /api/workflows/alerts?workflow_id=X — list alert rules for a workflow */
export async function GET(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { admin: supabase } = auth;

  const url = new URL(request.url);
  const workflowId = url.searchParams.get("workflow_id");

  let query = supabase
    .from("crm_workflow_alerts")
    .select("id, workflow_id, alert_type, channel, config, is_active, created_at, crm_workflows!workflow_id(name)")
    .order("created_at", { ascending: false });

  if (workflowId) {
    query = query.eq("workflow_id", workflowId);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ alerts: data ?? [] });
}

/** POST /api/workflows/alerts — create an alert rule */
export async function POST(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { admin: supabase } = auth;

  const body = await request.json();
  const { workflow_id, alert_type, channel, config } = body;

  if (!workflow_id || !alert_type || !channel) {
    return NextResponse.json({ error: "workflow_id, alert_type, and channel required" }, { status: 400 });
  }

  const validTypes = ["failure", "slow_run", "consecutive_failures"];
  const validChannels = ["telegram", "slack", "in_app"];

  if (!validTypes.includes(alert_type)) {
    return NextResponse.json({ error: `Invalid alert_type. Use: ${validTypes.join(", ")}` }, { status: 400 });
  }
  if (!validChannels.includes(channel)) {
    return NextResponse.json({ error: `Invalid channel. Use: ${validChannels.join(", ")}` }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("crm_workflow_alerts")
    .insert({
      workflow_id,
      alert_type,
      channel,
      config: config ?? {},
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ alert: data, ok: true });
}

/** DELETE /api/workflows/alerts?id=X — delete an alert rule */
export async function DELETE(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { admin: supabase } = auth;

  const url = new URL(request.url);
  const id = url.searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const { error } = await supabase.from("crm_workflow_alerts").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
