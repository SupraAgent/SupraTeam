/**
 * GET    /api/drip/sequences — List all drip sequences with stats
 * POST   /api/drip/sequences — Create a new drip sequence with steps
 * PUT    /api/drip/sequences — Update sequence status or metadata
 * DELETE /api/drip/sequences — Delete a sequence
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

export async function GET() {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { admin: supabase } = auth;

  const { data: sequences, error } = await supabase
    .from("crm_drip_sequences")
    .select("*, steps:crm_drip_steps(count)")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Enrollment stats per sequence
  const seqIds = (sequences ?? []).map((s) => s.id);
  const enrollmentStats: Record<string, { total: number; active: number; completed: number }> = {};

  if (seqIds.length > 0) {
    const { data: enrollments } = await supabase
      .from("crm_drip_enrollments")
      .select("sequence_id, status")
      .in("sequence_id", seqIds);

    for (const e of enrollments ?? []) {
      if (!enrollmentStats[e.sequence_id]) {
        enrollmentStats[e.sequence_id] = { total: 0, active: 0, completed: 0 };
      }
      enrollmentStats[e.sequence_id].total++;
      if (e.status === "active") enrollmentStats[e.sequence_id].active++;
      if (e.status === "completed") enrollmentStats[e.sequence_id].completed++;
    }
  }

  const enriched = (sequences ?? []).map((s) => ({
    ...s,
    step_count: s.steps?.[0]?.count ?? 0,
    enrollment_stats: enrollmentStats[s.id] ?? { total: 0, active: 0, completed: 0 },
  }));

  return NextResponse.json({ sequences: enriched });
}

export async function POST(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user, admin: supabase } = auth;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { name, description, trigger_event, trigger_config, board_type, steps } = body;

  if (!name?.trim()) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }
  if (!trigger_event) {
    return NextResponse.json({ error: "trigger_event required" }, { status: 400 });
  }

  const { data: sequence, error } = await supabase
    .from("crm_drip_sequences")
    .insert({
      name: name.trim(),
      description: description || null,
      trigger_event,
      trigger_config: trigger_config ?? {},
      board_type: board_type || null,
      created_by: user.id,
    })
    .select()
    .single();

  if (error || !sequence) {
    return NextResponse.json({ error: error?.message ?? "Failed to create" }, { status: 500 });
  }

  // Insert steps if provided
  if (Array.isArray(steps) && steps.length > 0) {
    const stepRows = steps.map((s: {
      message_template?: string;
      delay_hours?: number;
      step_type?: string;
      condition_type?: string;
      condition_config?: Record<string, unknown>;
      on_true_step?: number;
      on_false_step?: number;
    }, i: number) => ({
      sequence_id: sequence.id,
      step_number: i + 1,
      delay_hours: s.delay_hours ?? 0,
      message_template: s.message_template ?? "",
      step_type: s.step_type ?? "message",
      condition_type: s.condition_type || null,
      condition_config: s.condition_config ?? {},
      on_true_step: s.on_true_step ?? null,
      on_false_step: s.on_false_step ?? null,
    }));

    const { error: stepError } = await supabase.from("crm_drip_steps").insert(stepRows);
    if (stepError) {
      await supabase.from("crm_drip_sequences").delete().eq("id", sequence.id);
      return NextResponse.json({ error: `Steps failed: ${stepError.message}` }, { status: 500 });
    }
  }

  return NextResponse.json({ sequence, ok: true });
}

export async function PUT(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user, admin: supabase } = auth;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { id, status, name, description, trigger_config } = body;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (status) updates.status = status;
  if (name) updates.name = name;
  if (description !== undefined) updates.description = description;
  if (trigger_config !== undefined) updates.trigger_config = trigger_config;

  const { error } = await supabase
    .from("crm_drip_sequences")
    .update(updates)
    .eq("id", id)
    .eq("created_by", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user, admin: supabase } = auth;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { id } = body;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const { error } = await supabase
    .from("crm_drip_sequences")
    .delete()
    .eq("id", id)
    .eq("created_by", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
