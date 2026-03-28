/**
 * GET /api/drip/steps?sequence_id=xxx — Fetch steps for a drip sequence
 * PUT /api/drip/steps — Bulk update steps for a sequence (replace all)
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

export async function GET(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { admin: supabase } = auth;

  const { searchParams } = new URL(request.url);
  const sequenceId = searchParams.get("sequence_id");
  if (!sequenceId) {
    return NextResponse.json({ error: "sequence_id required" }, { status: 400 });
  }

  const { data: steps, error } = await supabase
    .from("crm_drip_steps")
    .select("*")
    .eq("sequence_id", sequenceId)
    .order("step_number");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ steps: steps ?? [] });
}

export async function PUT(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { admin: supabase } = auth;

  const { sequence_id, steps } = await request.json();
  if (!sequence_id) return NextResponse.json({ error: "sequence_id required" }, { status: 400 });
  if (!Array.isArray(steps)) return NextResponse.json({ error: "steps must be array" }, { status: 400 });

  // Delete existing steps and re-insert
  const { error: deleteError } = await supabase
    .from("crm_drip_steps")
    .delete()
    .eq("sequence_id", sequence_id);

  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });

  if (steps.length > 0) {
    const stepRows = steps.map((s: {
      message_template?: string;
      delay_hours?: number;
      step_type?: string;
      condition_type?: string;
      condition_config?: Record<string, unknown>;
      on_true_step?: number;
      on_false_step?: number;
    }, i: number) => ({
      sequence_id,
      step_number: i + 1,
      delay_hours: s.delay_hours ?? 0,
      message_template: s.message_template ?? "",
      step_type: s.step_type ?? "message",
      condition_type: s.condition_type || null,
      condition_config: s.condition_config ?? {},
      on_true_step: s.on_true_step ?? null,
      on_false_step: s.on_false_step ?? null,
    }));

    const { error: insertError } = await supabase.from("crm_drip_steps").insert(stepRows);
    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
