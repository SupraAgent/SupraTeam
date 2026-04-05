import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import type { Node, Edge } from "@xyflow/react";

interface SequenceBody {
  id?: string;
  name: string;
  description?: string;
  trigger_type: string;
  trigger_config?: Record<string, unknown>;
  nodes: Node[];
  edges: Edge[];
  is_active?: boolean;
}

interface StepRecord {
  sequence_id: string;
  step_number: number;
  step_type: string;
  delay_hours: number;
  message_template: string;
  variant_b_template: string | null;
  variant_c_template: string | null;
  ab_split_pct: number | null;
  variant_b_delay_hours: number | null;
  step_label: string | null;
  condition_type: string | null;
  condition_config: Record<string, unknown> | null;
  on_true_step: number | null;
  on_false_step: number | null;
  split_percentage: number | null;
  position_x: number;
  position_y: number;
  node_id: string;
}

const VALID_STEP_TYPES = ["message", "condition", "wait"];
const VALID_TRIGGER_TYPES = ["manual", "group_join", "first_message", "keyword_match"];
const VALID_CONDITION_TYPES = [
  "reply_received",
  "no_reply_timeout",
  "engagement_score",
  "deal_stage",
  "message_keyword",
  "days_since_enroll",
  "ab_split",
];

function serializeNodesToSteps(
  sequenceId: string,
  nodes: Node[],
  edges: Edge[]
): StepRecord[] {
  // Filter out trigger node
  const stepNodes = nodes.filter((n) => n.type !== "trigger");
  if (stepNodes.length === 0) return [];

  // Build ordering: BFS from trigger node following edges
  const triggerNode = nodes.find((n) => n.type === "trigger");
  const adjacency = new Map<string, Array<{ target: string; handle: string | null }>>();
  for (const edge of edges) {
    if (!adjacency.has(edge.source)) adjacency.set(edge.source, []);
    adjacency.get(edge.source)!.push({
      target: edge.target,
      handle: edge.sourceHandle ?? null,
    });
  }

  // BFS to assign step numbers
  const visited = new Set<string>();
  const ordered: Node[] = [];
  const queue: string[] = [];

  if (triggerNode) {
    const triggerEdges = adjacency.get(triggerNode.id) ?? [];
    for (const e of triggerEdges) queue.push(e.target);
  }

  // Fallback: if no trigger edges, order by Y position
  if (queue.length === 0) {
    const sorted = [...stepNodes].sort((a, b) => a.position.y - b.position.y);
    ordered.push(...sorted);
  } else {
    while (queue.length > 0) {
      const nodeId = queue.shift()!;
      if (visited.has(nodeId)) continue;
      visited.add(nodeId);

      const node = stepNodes.find((n) => n.id === nodeId);
      if (node) ordered.push(node);

      const outEdges = adjacency.get(nodeId) ?? [];
      for (const e of outEdges) {
        if (!visited.has(e.target)) queue.push(e.target);
      }
    }

    // Add any unvisited step nodes
    for (const node of stepNodes) {
      if (!visited.has(node.id)) ordered.push(node);
    }
  }

  // Map node IDs to step numbers
  const nodeToStepNum = new Map<string, number>();
  ordered.forEach((n, i) => nodeToStepNum.set(n.id, i + 1));

  return ordered.map((node, idx) => {
    const data = node.data as Record<string, unknown>;
    const stepType = String(node.type ?? "message");

    const record: StepRecord = {
      sequence_id: sequenceId,
      step_number: idx + 1,
      step_type: stepType,
      delay_hours: Number(data.delay_hours ?? 0),
      message_template: String(data.template ?? ""),
      variant_b_template: data.variant_b_template ? String(data.variant_b_template) : null,
      variant_c_template: data.variant_c_template ? String(data.variant_c_template) : null,
      ab_split_pct: data.ab_split_pct != null ? Number(data.ab_split_pct) : null,
      variant_b_delay_hours: data.variant_b_delay_hours != null ? Number(data.variant_b_delay_hours) : null,
      step_label: data.label ? String(data.label) : null,
      condition_type: data.condition_type ? String(data.condition_type) : null,
      condition_config: null,
      on_true_step: null,
      on_false_step: null,
      split_percentage: data.split_percentage != null ? Number(data.split_percentage) : null,
      position_x: node.position.x,
      position_y: node.position.y,
      node_id: node.id,
    };

    // Build condition config
    if (stepType === "condition") {
      const condConfig: Record<string, unknown> = {};
      if (data.threshold != null) condConfig.threshold = Number(data.threshold);
      if (data.keyword) condConfig.keywords = [String(data.keyword)];
      if (data.stage_id) condConfig.stage_id = String(data.stage_id);
      if (data.timeout_hours != null) condConfig.timeout_hours = Number(data.timeout_hours);
      if (data.days != null) condConfig.days = Number(data.days);
      record.condition_config = Object.keys(condConfig).length > 0 ? condConfig : null;

      // Resolve true/false branch targets
      const outEdges = adjacency.get(node.id) ?? [];
      for (const e of outEdges) {
        const targetStepNum = nodeToStepNum.get(e.target);
        if (targetStepNum != null) {
          if (e.handle === "true") record.on_true_step = targetStepNum;
          else if (e.handle === "false") record.on_false_step = targetStepNum;
        }
      }
    }

    if (stepType === "wait") {
      record.delay_hours = Number(data.wait_hours ?? 24);
    }

    return record;
  });
}

export async function GET() {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const { data: sequences, error } = await supabase
    .from("crm_outreach_sequences")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }

  // Fetch enrollment stats per sequence
  const seqIds = (sequences ?? []).map((s: Record<string, unknown>) => s.id as string);
  let enrollmentStats: Record<string, { enrolled: number; active: number; completed: number; replied: number; reply_rate: number }> = {};

  if (seqIds.length > 0) {
    const { data: enrollments } = await supabase
      .from("crm_outreach_enrollments")
      .select("sequence_id, status, reply_count")
      .in("sequence_id", seqIds);

    const statsMap: Record<string, { enrolled: number; active: number; completed: number; replied: number }> = {};
    for (const e of (enrollments ?? []) as Array<{ sequence_id: string; status: string; reply_count: number }>) {
      if (!statsMap[e.sequence_id]) {
        statsMap[e.sequence_id] = { enrolled: 0, active: 0, completed: 0, replied: 0 };
      }
      statsMap[e.sequence_id].enrolled++;
      if (e.status === "active") statsMap[e.sequence_id].active++;
      if (e.status === "completed") statsMap[e.sequence_id].completed++;
      if (e.reply_count > 0) statsMap[e.sequence_id].replied++;
    }

    enrollmentStats = {};
    for (const [sid, stats] of Object.entries(statsMap)) {
      enrollmentStats[sid] = {
        ...stats,
        reply_rate: stats.enrolled > 0 ? (stats.replied / stats.enrolled) * 100 : 0,
      };
    }
  }

  // Fetch steps to reconstruct canvas data
  const { data: allSteps } = await supabase
    .from("crm_outreach_steps")
    .select("*")
    .in("sequence_id", seqIds)
    .order("step_number");

  const stepsBySeq = new Map<string, Array<Record<string, unknown>>>();
  for (const step of (allSteps ?? []) as Array<Record<string, unknown>>) {
    const sid = step.sequence_id as string;
    if (!stepsBySeq.has(sid)) stepsBySeq.set(sid, []);
    stepsBySeq.get(sid)!.push(step);
  }

  const result = (sequences ?? []).map((seq: Record<string, unknown>) => {
    const sid = seq.id as string;
    const stats = enrollmentStats[sid] ?? { enrolled: 0, active: 0, completed: 0, replied: 0, reply_rate: 0 };
    const steps = (stepsBySeq.get(sid) ?? []).map((s) => ({
      id: s.node_id ?? s.id,
      type: s.step_type,
      position: { x: Number(s.position_x ?? 250), y: Number(s.position_y ?? 150) },
      ...(s.step_type === "message" ? {
        template: s.message_template ?? "",
        variant_b_template: s.variant_b_template ?? null,
        variant_c_template: s.variant_c_template ?? null,
        ab_split_pct: s.ab_split_pct ?? 50,
        delay_hours: s.delay_hours ?? 0,
        variant_b_delay_hours: s.variant_b_delay_hours ?? null,
      } : {}),
      ...(s.step_type === "condition" ? {
        condition_type: s.condition_type ?? "reply_received",
        threshold: (s.condition_config as Record<string, unknown> | null)?.threshold ?? null,
        keyword: ((s.condition_config as Record<string, unknown> | null)?.keywords as string[] | undefined)?.[0] ?? null,
        stage_id: (s.condition_config as Record<string, unknown> | null)?.stage_id ?? null,
        timeout_hours: (s.condition_config as Record<string, unknown> | null)?.timeout_hours ?? null,
        days: (s.condition_config as Record<string, unknown> | null)?.days ?? null,
        split_percentage: s.split_percentage ?? null,
        on_true_step: s.on_true_step ?? null,
        on_false_step: s.on_false_step ?? null,
      } : {}),
      ...(s.step_type === "wait" ? {
        wait_hours: s.delay_hours ?? 24,
      } : {}),
    }));

    return {
      id: sid,
      name: seq.name,
      description: seq.description ?? null,
      trigger_type: seq.trigger_type ?? "manual",
      trigger_config: seq.trigger_config ?? {},
      steps,
      is_active: seq.status === "active",
      stats,
      created_at: seq.created_at,
      updated_at: seq.updated_at,
    };
  });

  return NextResponse.json({ data: result, source: "db" });
}

export async function POST(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase, user } = auth;

  let body: SequenceBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.name?.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  if (body.trigger_type && !VALID_TRIGGER_TYPES.includes(body.trigger_type)) {
    return NextResponse.json({ error: `Invalid trigger_type: ${body.trigger_type}` }, { status: 400 });
  }

  // Validate step types
  const stepNodes = (body.nodes ?? []).filter((n) => n.type !== "trigger");
  for (const node of stepNodes) {
    if (!VALID_STEP_TYPES.includes(String(node.type))) {
      return NextResponse.json({ error: `Invalid step type: ${node.type}` }, { status: 400 });
    }
    if (node.type === "condition") {
      const condType = (node.data as Record<string, unknown>).condition_type;
      if (condType && !VALID_CONDITION_TYPES.includes(String(condType))) {
        return NextResponse.json({ error: `Invalid condition_type: ${condType}` }, { status: 400 });
      }
    }
  }

  // Create sequence
  const { data: seq, error: seqError } = await supabase
    .from("crm_outreach_sequences")
    .insert({
      name: body.name.trim(),
      description: body.description?.trim() || null,
      trigger_type: body.trigger_type || "manual",
      trigger_config: body.trigger_config ?? {},
      status: "paused",
      created_by: user.id,
    })
    .select()
    .single();

  if (seqError || !seq) {
    return NextResponse.json(
      { error: seqError?.message ?? "Failed to create sequence" },
      { status: 500 }
    );
  }

  // Insert steps
  const steps = serializeNodesToSteps(seq.id, body.nodes ?? [], body.edges ?? []);
  if (steps.length > 0) {
    const { error: stepsError } = await supabase
      .from("crm_outreach_steps")
      .insert(steps);

    if (stepsError) {
      // Clean up sequence on step insert failure
      await supabase.from("crm_outreach_sequences").delete().eq("id", seq.id);
      return NextResponse.json(
        { error: stepsError.message },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ data: { id: seq.id }, source: "db" }, { status: 201 });
}

export async function PUT(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  let body: SequenceBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.id) {
    return NextResponse.json({ error: "Sequence ID is required" }, { status: 400 });
  }

  if (!body.name?.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  // Validate step types
  const stepNodes = (body.nodes ?? []).filter((n) => n.type !== "trigger");
  for (const node of stepNodes) {
    if (!VALID_STEP_TYPES.includes(String(node.type))) {
      return NextResponse.json({ error: `Invalid step type: ${node.type}` }, { status: 400 });
    }
    if (node.type === "condition") {
      const condType = (node.data as Record<string, unknown>).condition_type;
      if (condType && !VALID_CONDITION_TYPES.includes(String(condType))) {
        return NextResponse.json({ error: `Invalid condition_type: ${condType}` }, { status: 400 });
      }
    }
  }

  // Update sequence record
  const updatePayload: Record<string, unknown> = {
    name: body.name.trim(),
    description: body.description?.trim() || null,
    trigger_type: body.trigger_type || "manual",
    trigger_config: body.trigger_config ?? {},
    updated_at: new Date().toISOString(),
  };

  if (body.is_active !== undefined) {
    updatePayload.status = body.is_active ? "active" : "paused";
  }

  const { error: updateError } = await supabase
    .from("crm_outreach_sequences")
    .update(updatePayload)
    .eq("id", body.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // Replace steps: delete existing, insert new
  await supabase
    .from("crm_outreach_steps")
    .delete()
    .eq("sequence_id", body.id);

  const steps = serializeNodesToSteps(body.id, body.nodes ?? [], body.edges ?? []);
  if (steps.length > 0) {
    const { error: stepsError } = await supabase
      .from("crm_outreach_steps")
      .insert(steps);

    if (stepsError) {
      return NextResponse.json({ error: stepsError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ data: { id: body.id }, source: "db" });
}

export async function DELETE(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "Sequence ID is required" }, { status: 400 });
  }

  // Delete steps first (FK), then sequence
  await supabase.from("crm_outreach_steps").delete().eq("sequence_id", id);
  const { error } = await supabase.from("crm_outreach_sequences").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: { deleted: true }, source: "db" });
}
