/**
 * GET /api/inbox/status — Fetch all conversation statuses
 * PATCH /api/inbox/status — Update status for a conversation
 * Body: { chat_id: number, status?: "open" | "snoozed" | "closed", assigned_to?: string | null, snoozed_until?: string | null }
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

export async function GET() {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { admin: supabase } = auth;

  // Auto un-snooze expired conversations before returning statuses
  const { error: unsnoozeErr } = await supabase.rpc("unsnooze_expired");
  if (unsnoozeErr) {
    // If RPC not deployed yet, do it inline
    await supabase
      .from("crm_inbox_status")
      .update({ status: "open", snoozed_until: null, updated_at: new Date().toISOString() })
      .eq("status", "snoozed")
      .lte("snoozed_until", new Date().toISOString());
  }

  const { data, error } = await supabase
    .from("crm_inbox_status")
    .select("chat_id, status, assigned_to, snoozed_until, closed_at, updated_at, updated_by");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Index by chat_id for fast lookup
  const statusMap: Record<number, (typeof data)[0]> = {};
  for (const row of data ?? []) {
    statusMap[row.chat_id as number] = row;
  }

  return NextResponse.json({ statuses: statusMap });
}

export async function PATCH(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user, admin: supabase } = auth;

  let body: {
    chat_id?: number;
    status?: string;
    assigned_to?: string | null;
    snoozed_until?: string | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const chatId = Number(body.chat_id);
  if (!chatId || Number.isNaN(chatId)) {
    return NextResponse.json({ error: "Valid chat_id required" }, { status: 400 });
  }

  const validStatuses = ["open", "snoozed", "closed"];
  if (body.status && !validStatuses.includes(body.status)) {
    return NextResponse.json({ error: `Status must be one of: ${validStatuses.join(", ")}` }, { status: 400 });
  }

  // Validate snoozed_until is a future date when snoozing
  if (body.status === "snoozed") {
    if (!body.snoozed_until) {
      return NextResponse.json({ error: "snoozed_until required when snoozing" }, { status: 400 });
    }
    const snoozeDate = new Date(body.snoozed_until);
    if (Number.isNaN(snoozeDate.getTime()) || snoozeDate.getTime() <= Date.now()) {
      return NextResponse.json({ error: "snoozed_until must be a future date" }, { status: 400 });
    }
  }

  const update: Record<string, unknown> = {
    chat_id: chatId,
    updated_at: new Date().toISOString(),
    updated_by: user.id,
  };
  if (body.status) update.status = body.status;
  if (body.status === "closed") update.closed_at = new Date().toISOString();
  if (body.status === "open") {
    update.closed_at = null;
    update.snoozed_until = null;
  }
  if (body.status === "snoozed") update.snoozed_until = body.snoozed_until;
  if (body.assigned_to !== undefined) update.assigned_to = body.assigned_to;

  const { data, error } = await supabase
    .from("crm_inbox_status")
    .upsert(update, { onConflict: "chat_id" })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ status: data });
}
