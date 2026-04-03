import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

/** GET /api/workflows/alerts?workflow_id=X — list alert rules for a workflow */
export async function GET(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

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
  const { supabase } = auth;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { workflow_id, alert_type, channel, config } = body;

  if (!workflow_id || !alert_type || !channel) {
    return NextResponse.json({ error: "workflow_id, alert_type, and channel required" }, { status: 400 });
  }

  const validTypes = ["failure", "slow_run", "consecutive_failures"];
  const validChannels = ["telegram", "slack", "in_app"];

  if (!validTypes.includes(alert_type as string)) {
    return NextResponse.json({ error: `Invalid alert_type. Use: ${validTypes.join(", ")}` }, { status: 400 });
  }
  if (!validChannels.includes(channel as string)) {
    return NextResponse.json({ error: `Invalid channel. Use: ${validChannels.join(", ")}` }, { status: 400 });
  }

  // Validate config per alert type
  const alertConfig = (config as Record<string, unknown>) ?? {};
  const configErr = validateAlertConfig(alert_type as string, channel as string, alertConfig);
  if (configErr) {
    return NextResponse.json({ error: configErr }, { status: 400 });
  }

  // Verify workflow exists
  const { data: wf } = await supabase
    .from("crm_workflows")
    .select("id")
    .eq("id", workflow_id)
    .single();

  if (!wf) {
    return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
  }

  const { data, error } = await supabase
    .from("crm_workflow_alerts")
    .insert({
      workflow_id,
      alert_type,
      channel,
      config: alertConfig,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ alert: data, ok: true });
}

/** PATCH /api/workflows/alerts?id=X — update an alert rule (toggle active, update config) */
export async function PATCH(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const url = new URL(request.url);
  const id = url.searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};

  if (typeof body.is_active === "boolean") {
    updates.is_active = body.is_active;
  }
  if (body.config !== undefined) {
    // Fetch existing alert to validate config against its type/channel
    const { data: existing } = await supabase
      .from("crm_workflow_alerts")
      .select("alert_type, channel")
      .eq("id", id)
      .single();

    if (!existing) {
      return NextResponse.json({ error: "Alert not found" }, { status: 404 });
    }

    const configErr = validateAlertConfig(
      existing.alert_type,
      existing.channel,
      body.config as Record<string, unknown>
    );
    if (configErr) {
      return NextResponse.json({ error: configErr }, { status: 400 });
    }
    updates.config = body.config;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("crm_workflow_alerts")
    .update(updates)
    .eq("id", id)
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
  const { supabase } = auth;

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

function validateAlertConfig(
  alertType: string,
  channel: string,
  config: Record<string, unknown>
): string | null {
  // Validate per alert type
  if (alertType === "slow_run") {
    if (config.threshold_ms !== undefined) {
      const ms = Number(config.threshold_ms);
      if (isNaN(ms) || ms <= 0) {
        return "threshold_ms must be a positive number";
      }
    }
  }

  if (alertType === "consecutive_failures") {
    if (config.consecutive_count !== undefined) {
      const count = Number(config.consecutive_count);
      if (isNaN(count) || count < 2) {
        return "consecutive_count must be >= 2";
      }
    }
  }

  // Validate per channel
  if (channel === "telegram" && config.chat_id !== undefined) {
    const chatId = typeof config.chat_id === "string" ? parseInt(config.chat_id, 10) : Number(config.chat_id);
    if (isNaN(chatId)) {
      return "chat_id must be a valid number";
    }
  }

  return null;
}
