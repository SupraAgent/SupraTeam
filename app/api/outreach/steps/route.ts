/**
 * GET  /api/outreach/steps?sequence_id=xxx — List steps for a sequence
 * PUT  /api/outreach/steps — Bulk update steps for a sequence
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import type { SupabaseClient } from "@supabase/supabase-js";

async function verifySequenceAccess(supabase: SupabaseClient, sequenceId: string, userId: string) {
  const { data: seq } = await supabase
    .from("crm_outreach_sequences")
    .select("created_by")
    .eq("id", sequenceId)
    .single();
  if (!seq) return NextResponse.json({ error: "Sequence not found" }, { status: 404 });
  if (seq.created_by !== userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return null;
}

export async function GET(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user, supabase } = auth;

  const { searchParams } = new URL(request.url);
  const sequenceId = searchParams.get("sequence_id");

  if (!sequenceId) {
    return NextResponse.json({ error: "sequence_id required" }, { status: 400 });
  }

  const accessErr = await verifySequenceAccess(supabase, sequenceId, user.id);
  if (accessErr) return accessErr;

  const { data: steps } = await supabase
    .from("crm_outreach_steps")
    .select("*")
    .eq("sequence_id", sequenceId)
    .order("step_number");

  return NextResponse.json({ steps: steps ?? [] });
}

export async function PUT(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user, supabase } = auth;

  const { sequence_id, steps } = await request.json();

  if (!sequence_id || !Array.isArray(steps)) {
    return NextResponse.json({ error: "sequence_id and steps array required" }, { status: 400 });
  }

  const accessErr = await verifySequenceAccess(supabase, sequence_id, user.id);
  if (accessErr) return accessErr;

  // Fetch existing steps to diff against
  const { data: existingSteps } = await supabase
    .from("crm_outreach_steps")
    .select("id, step_number")
    .eq("sequence_id", sequence_id)
    .order("step_number");

  const existingByStepNumber = new Map(
    (existingSteps ?? []).map((s: { id: string; step_number: number }) => [s.step_number, s.id])
  );

  type StepInput = { message_template: string; variant_b_template?: string; variant_c_template?: string; ab_split_pct?: number; variant_b_delay_hours?: number; delay_hours?: number; step_type?: string; step_label?: string; condition_type?: string; condition_config?: Record<string, unknown>; on_true_step?: number; on_false_step?: number; split_percentage?: number };

  const buildStepFields = (s: StepInput) => ({
    delay_hours: s.delay_hours ?? 24,
    message_template: s.message_template,
    variant_b_template: s.variant_b_template || null,
    variant_c_template: s.variant_c_template || null,
    ab_split_pct: s.ab_split_pct ?? 50,
    variant_b_delay_hours: s.variant_b_delay_hours ?? null,
    step_type: s.step_type ?? "message",
    step_label: s.step_label || null,
    condition_type: s.condition_type ?? null,
    condition_config: s.condition_config ?? null,
    on_true_step: s.on_true_step ?? null,
    on_false_step: s.on_false_step ?? null,
    split_percentage: s.split_percentage ?? null,
  });

  // Update existing steps, insert new ones
  for (let i = 0; i < steps.length; i++) {
    const stepNumber = i + 1;
    const s = steps[i] as StepInput;
    const existingId = existingByStepNumber.get(stepNumber);

    if (existingId) {
      const { error } = await supabase
        .from("crm_outreach_steps")
        .update(buildStepFields(s))
        .eq("id", existingId);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    } else {
      const { error } = await supabase
        .from("crm_outreach_steps")
        .insert({ sequence_id, step_number: stepNumber, ...buildStepFields(s) });
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }
  }

  // Delete steps whose step_number exceeds the new count
  const newStepCount = steps.length;
  const stepsToDelete = (existingSteps ?? [])
    .filter((s: { id: string; step_number: number }) => s.step_number > newStepCount)
    .map((s: { id: string; step_number: number }) => s.id);

  if (stepsToDelete.length > 0) {
    const { error } = await supabase
      .from("crm_outreach_steps")
      .delete()
      .in("id", stepsToDelete);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
