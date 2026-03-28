/**
 * POST /api/inbox/assign — Evaluate assignment rules for a message and auto-assign if matched.
 * Called by the client's realtime handler when a new message arrives in an unassigned conversation.
 *
 * Body: { chat_id: number, message_text: string, sender_telegram_id: number }
 *
 * Design: This is a "pull" model — the client triggers evaluation.
 * A "push" model (DB trigger) would be more robust but requires Supabase Edge Functions.
 * This approach works for the team size and avoids infrastructure complexity.
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { evaluateAssignment } from "@/lib/assignment";

export async function POST(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { admin: supabase } = auth;

  let body: { chat_id?: number; message_text?: string; sender_telegram_id?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const chatId = Number(body.chat_id);
  if (!chatId || Number.isNaN(chatId)) {
    return NextResponse.json({ error: "Valid chat_id required" }, { status: 400 });
  }

  // Check if already assigned — never override manual assignments
  const { data: existing } = await supabase
    .from("crm_inbox_status")
    .select("assigned_to, status")
    .eq("chat_id", chatId)
    .single();

  if (existing?.assigned_to) {
    return NextResponse.json({ skipped: true, reason: "already_assigned" });
  }

  // Get group slugs for this chat
  const { data: group } = await supabase
    .from("tg_groups")
    .select("id")
    .eq("telegram_group_id", String(chatId))
    .single();

  let groupSlugs: string[] = [];
  if (group) {
    const { data: slugs } = await supabase
      .from("tg_group_slugs")
      .select("slug")
      .eq("group_id", group.id);
    groupSlugs = (slugs ?? []).map((s) => s.slug);
  }

  // Evaluate rules
  const result = await evaluateAssignment(supabase, {
    chatId,
    messageText: body.message_text ?? "",
    senderTelegramId: body.sender_telegram_id ?? 0,
    groupSlugs,
  });

  if (!result) {
    return NextResponse.json({ assigned: false, reason: "no_matching_rule" });
  }

  // Apply assignment — only if still unassigned (prevents TOCTOU race with manual assignment)
  // First try to update existing row only if assigned_to is null
  const { data: updated, error: updateErr } = await supabase
    .from("crm_inbox_status")
    .update({
      assigned_to: result.userId,
      assignment_reason: result.reason,
      status: "open",
      updated_at: new Date().toISOString(),
    })
    .eq("chat_id", chatId)
    .is("assigned_to", null)
    .select()
    .maybeSingle();

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  // If no row existed yet, insert a new one
  if (!updated && !existing) {
    const { error: insertErr } = await supabase
      .from("crm_inbox_status")
      .insert({
        chat_id: chatId,
        status: "open",
        assigned_to: result.userId,
        assignment_reason: result.reason,
        updated_at: new Date().toISOString(),
      });
    if (insertErr) {
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }
  } else if (!updated && existing?.assigned_to) {
    // Someone assigned manually between our initial check and now — respect it
    return NextResponse.json({ skipped: true, reason: "manually_assigned_during_evaluation" });
  }
  return NextResponse.json({
    assigned: true,
    user_id: result.userId,
    reason: result.reason,
    rule_name: result.ruleName,
  });
}
