import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

/** POST: Enroll a deal/contact into a sequence */
export async function POST(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  let body: { sequence_id: string; deal_id: string; contact_id: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  if (!body.sequence_id || !body.deal_id || !body.contact_id) {
    return NextResponse.json({ error: "sequence_id, deal_id, and contact_id required" }, { status: 400 });
  }

  // Check if already enrolled and active
  const { data: existing } = await auth.admin
    .from("crm_email_sequence_enrollments")
    .select("id, status")
    .eq("sequence_id", body.sequence_id)
    .eq("contact_id", body.contact_id)
    .eq("status", "active")
    .limit(1);

  if (existing && existing.length > 0) {
    return NextResponse.json({ error: "Contact is already enrolled in this sequence" }, { status: 409 });
  }

  // Get sequence to calculate first send time
  const { data: sequence, error: seqErr } = await auth.admin
    .from("crm_email_sequences")
    .select("steps")
    .eq("id", body.sequence_id)
    .single();

  if (seqErr || !sequence) {
    return NextResponse.json({ error: "Sequence not found" }, { status: 404 });
  }

  const steps = sequence.steps as { delay_days: number }[];
  const firstDelay = steps[0]?.delay_days ?? 0;
  const nextSendAt = new Date();
  nextSendAt.setDate(nextSendAt.getDate() + firstDelay);

  const { data, error } = await auth.admin
    .from("crm_email_sequence_enrollments")
    .insert({
      sequence_id: body.sequence_id,
      deal_id: body.deal_id,
      contact_id: body.contact_id,
      current_step: 0,
      status: "active",
      next_send_at: nextSendAt.toISOString(),
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: "Failed to enroll" }, { status: 500 });
  }

  // Audit
  await auth.admin.from("crm_email_audit_log").insert({
    user_id: auth.user.id,
    action: "sequence_enroll",
    metadata: {
      sequence_id: body.sequence_id,
      deal_id: body.deal_id,
      contact_id: body.contact_id,
    },
  });

  return NextResponse.json({ data, source: "supabase" });
}

/** PATCH: Pause/resume/cancel an enrollment */
export async function PATCH(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  let body: { enrollment_id: string; action: "pause" | "resume" | "cancel" };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const statusMap = {
    pause: "paused",
    resume: "active",
    cancel: "completed",
  } as const;

  const newStatus = statusMap[body.action];
  if (!newStatus) {
    return NextResponse.json({ error: "action must be pause, resume, or cancel" }, { status: 400 });
  }

  const update: Record<string, unknown> = { status: newStatus };
  if (body.action === "cancel") {
    update.completed_at = new Date().toISOString();
  }

  const { error } = await auth.admin
    .from("crm_email_sequence_enrollments")
    .update(update)
    .eq("id", body.enrollment_id)
    .eq("enrolled_by", auth.user.id);

  if (error) {
    return NextResponse.json({ error: "Failed to update enrollment" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, source: "supabase" });
}
