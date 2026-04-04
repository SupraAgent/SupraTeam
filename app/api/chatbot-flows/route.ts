import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

export async function GET() {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const { data: flows, error } = await supabase
    .from("crm_chatbot_flows")
    .select("*")
    .order("priority", { ascending: false });

  if (error) {
    return NextResponse.json({ data: null, source: "chatbot-flows", error: error.message }, { status: 500 });
  }

  // Fetch stats for each flow
  const flowIds = (flows ?? []).map((f: Record<string, unknown>) => f.id as string);
  const { data: stats } = flowIds.length > 0
    ? await supabase.from("crm_chatbot_flow_stats").select("*").in("flow_id", flowIds)
    : { data: [] };

  const statsMap = new Map<string, Record<string, unknown>>();
  for (const s of stats ?? []) {
    statsMap.set(s.flow_id as string, s as Record<string, unknown>);
  }

  const enriched = (flows ?? []).map((f: Record<string, unknown>) => ({
    ...f,
    stats: statsMap.get(f.id as string) ?? {
      total_runs: 0,
      completed_runs: 0,
      escalated_runs: 0,
      avg_completion_time_seconds: 0,
      conversion_rate: 0,
    },
  }));

  return NextResponse.json({ data: enriched, source: "chatbot-flows" });
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user, supabase } = auth;

  const body = await request.json();
  const { name, description, trigger_type, trigger_keywords, target_groups, flow_data, priority } = body;

  if (!name || typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ data: null, source: "chatbot-flows", error: "Name is required" }, { status: 400 });
  }

  const validTriggers = ["dm_start", "group_mention", "keyword", "all_messages"];
  if (trigger_type && !validTriggers.includes(trigger_type)) {
    return NextResponse.json({ data: null, source: "chatbot-flows", error: "Invalid trigger type" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("crm_chatbot_flows")
    .insert({
      user_id: user.id,
      name: name.trim(),
      description: description || null,
      trigger_type: trigger_type ?? "dm_start",
      trigger_keywords: trigger_keywords ?? [],
      target_groups: target_groups ?? [],
      flow_data: flow_data ?? { nodes: [], edges: [] },
      priority: priority ?? 0,
      is_active: false,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ data: null, source: "chatbot-flows", error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data, source: "chatbot-flows" }, { status: 201 });
}

export async function PUT(request: NextRequest) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user, supabase } = auth;

  const body = await request.json();
  const { id, ...updates } = body;

  if (!id) {
    return NextResponse.json({ data: null, source: "chatbot-flows", error: "ID required" }, { status: 400 });
  }

  const payload: Record<string, unknown> = {};
  if (updates.name !== undefined) payload.name = updates.name;
  if (updates.description !== undefined) payload.description = updates.description;
  if (updates.trigger_type !== undefined) payload.trigger_type = updates.trigger_type;
  if (updates.trigger_keywords !== undefined) payload.trigger_keywords = updates.trigger_keywords;
  if (updates.target_groups !== undefined) payload.target_groups = updates.target_groups;
  if (updates.flow_data !== undefined) payload.flow_data = updates.flow_data;
  if (updates.is_active !== undefined) payload.is_active = updates.is_active;
  if (updates.priority !== undefined) payload.priority = updates.priority;

  const { data, error } = await supabase
    .from("crm_chatbot_flows")
    .update(payload)
    .eq("id", id)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ data: null, source: "chatbot-flows", error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data, source: "chatbot-flows" });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user, supabase } = auth;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ data: null, source: "chatbot-flows", error: "ID required" }, { status: 400 });
  }

  // Soft delete: deactivate the flow
  const { error } = await supabase
    .from("crm_chatbot_flows")
    .update({ is_active: false })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ data: null, source: "chatbot-flows", error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: { deleted: true }, source: "chatbot-flows" });
}
