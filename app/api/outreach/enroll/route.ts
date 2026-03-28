/**
 * POST /api/outreach/enroll — Enroll a deal/contact in a sequence
 * GET  /api/outreach/enroll?sequence_id=xxx — List enrollments for a sequence
 * PATCH /api/outreach/enroll — Pause/resume/cancel an enrollment
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

  const { data: enrollments } = await supabase
    .from("crm_outreach_enrollments")
    .select("*, deal:crm_deals(id, deal_name, board_type), contact:crm_contacts(id, name, telegram_username)")
    .eq("sequence_id", sequenceId)
    .order("enrolled_at", { ascending: false });

  return NextResponse.json({ enrollments: enrollments ?? [] });
}

export async function POST(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user, admin: supabase } = auth;

  const { sequence_id, deal_id, contact_id, tg_chat_id } = await request.json();

  if (!sequence_id) {
    return NextResponse.json({ error: "sequence_id required" }, { status: 400 });
  }
  if (!deal_id && !contact_id) {
    return NextResponse.json({ error: "deal_id or contact_id required" }, { status: 400 });
  }

  // Check for duplicate active enrollment
  const duplicateQuery = supabase
    .from("crm_outreach_enrollments")
    .select("id")
    .eq("sequence_id", sequence_id)
    .in("status", ["active", "paused"]);

  if (deal_id) duplicateQuery.eq("deal_id", deal_id);
  if (contact_id) duplicateQuery.eq("contact_id", contact_id);

  const { data: existing } = await duplicateQuery.limit(1);
  if (existing?.length) {
    return NextResponse.json(
      { error: "Already enrolled in this sequence" },
      { status: 409 }
    );
  }

  // Get first step's delay to calculate next_send_at
  const { data: firstStep } = await supabase
    .from("crm_outreach_steps")
    .select("delay_hours")
    .eq("sequence_id", sequence_id)
    .eq("step_number", 1)
    .single();

  const delayMs = (firstStep?.delay_hours ?? 0) * 3600000;
  const nextSendAt = new Date(Date.now() + delayMs).toISOString();

  // Resolve chat ID from deal if not provided
  let chatId = tg_chat_id;
  if (!chatId && deal_id) {
    const { data: deal } = await supabase
      .from("crm_deals")
      .select("telegram_chat_id")
      .eq("id", deal_id)
      .single();
    chatId = deal?.telegram_chat_id ?? null;
  }

  const { data: enrollment, error } = await supabase
    .from("crm_outreach_enrollments")
    .insert({
      sequence_id,
      deal_id: deal_id || null,
      contact_id: contact_id || null,
      tg_chat_id: chatId || null,
      current_step: 1,
      next_send_at: nextSendAt,
      enrolled_by: user.id,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ enrollment, ok: true });
}

export async function PATCH(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { admin: supabase } = auth;

  const { id, status } = await request.json();
  if (!id || !status) {
    return NextResponse.json({ error: "id and status required" }, { status: 400 });
  }

  const updates: Record<string, unknown> = { status };
  if (status === "completed" || status === "replied") {
    updates.completed_at = new Date().toISOString();
  }

  const { error } = await supabase
    .from("crm_outreach_enrollments")
    .update(updates)
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
