/**
 * GET  /api/outreach/steps?sequence_id=xxx — List steps for a sequence
 * PUT  /api/outreach/steps — Bulk update steps for a sequence
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
  const { admin: supabase } = auth;

  const { sequence_id, steps } = await request.json();

  if (!sequence_id || !Array.isArray(steps)) {
    return NextResponse.json({ error: "sequence_id and steps array required" }, { status: 400 });
  }

  // Delete existing steps and re-insert (simpler than diffing)
  await supabase
    .from("crm_outreach_steps")
    .delete()
    .eq("sequence_id", sequence_id);

  if (steps.length > 0) {
    const stepRows = steps.map((s: { message_template: string; delay_hours?: number; step_type?: string }, i: number) => ({
      sequence_id,
      step_number: i + 1,
      delay_hours: s.delay_hours ?? 24,
      message_template: s.message_template,
      step_type: s.step_type ?? "message",
    }));

    const { error } = await supabase
      .from("crm_outreach_steps")
      .insert(stepRows);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
