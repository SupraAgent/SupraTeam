import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

export async function POST(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user, admin: supabase } = auth;

  const { sequence_id } = await request.json();
  if (!sequence_id) {
    return NextResponse.json({ error: "sequence_id required" }, { status: 400 });
  }

  // Fetch original sequence
  const { data: original, error: seqErr } = await supabase
    .from("crm_outreach_sequences")
    .select("name, description, board_type, goal_stage_id, goal_event")
    .eq("id", sequence_id)
    .single();

  if (seqErr || !original) {
    return NextResponse.json({ error: "Sequence not found" }, { status: 404 });
  }

  // Fetch original steps
  const { data: originalSteps } = await supabase
    .from("crm_outreach_steps")
    .select("step_number, delay_hours, message_template, step_type, step_label, condition_type, condition_config, on_true_step, on_false_step, split_percentage")
    .eq("sequence_id", sequence_id)
    .order("step_number");

  // Create cloned sequence
  const { data: cloned, error: cloneErr } = await supabase
    .from("crm_outreach_sequences")
    .insert({
      name: `${original.name} (copy)`,
      description: original.description,
      board_type: original.board_type,
      goal_stage_id: original.goal_stage_id,
      goal_event: original.goal_event,
      status: "draft",
      created_by: user.id,
    })
    .select()
    .single();

  if (cloneErr || !cloned) {
    return NextResponse.json({ error: cloneErr?.message ?? "Failed to clone" }, { status: 500 });
  }

  // Clone steps
  if (originalSteps && originalSteps.length > 0) {
    const clonedSteps = originalSteps.map((s) => ({
      sequence_id: cloned.id,
      step_number: s.step_number,
      delay_hours: s.delay_hours,
      message_template: s.message_template,
      step_type: s.step_type,
      step_label: s.step_label,
      condition_type: s.condition_type,
      condition_config: s.condition_config,
      on_true_step: s.on_true_step,
      on_false_step: s.on_false_step,
      split_percentage: s.split_percentage,
    }));

    const { error: stepErr } = await supabase
      .from("crm_outreach_steps")
      .insert(clonedSteps);

    if (stepErr) {
      // Clean up orphaned sequence
      await supabase.from("crm_outreach_sequences").delete().eq("id", cloned.id);
      return NextResponse.json({ error: `Steps failed: ${stepErr.message}` }, { status: 500 });
    }
  }

  return NextResponse.json({ sequence: cloned, ok: true });
}
