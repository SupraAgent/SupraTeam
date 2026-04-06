/**
 * GET /api/inbox/seen — Get last_seen_at for all conversations for current user
 * POST /api/inbox/seen — Mark a conversation as seen (upsert last_seen_at = now())
 * Body: { chat_id: number }
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

export async function GET() {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user, supabase } = auth;

  const { data, error } = await supabase
    .from("crm_inbox_last_seen")
    .select("chat_id, last_seen_at")
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const seenMap: Record<number, string> = {};
  for (const row of data ?? []) {
    seenMap[row.chat_id as number] = row.last_seen_at;
  }

  return NextResponse.json({ seen: seenMap });
}

export async function POST(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user, supabase } = auth;

  let body: { chat_id?: number; chat_ids?: number[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  // Support both single chat_id and batch chat_ids
  const ids: number[] = [];
  if (Array.isArray(body.chat_ids)) {
    for (const id of body.chat_ids) {
      const n = Number(id);
      if (Number.isFinite(n) && n !== 0) ids.push(n);
    }
  } else {
    const n = Number(body.chat_id);
    if (Number.isFinite(n) && n !== 0) ids.push(n);
  }

  if (ids.length === 0) {
    return NextResponse.json({ error: "Valid chat_id or chat_ids required" }, { status: 400 });
  }

  const now = new Date().toISOString();
  const rows = ids.map((chatId) => ({
    user_id: user.id,
    chat_id: chatId,
    last_seen_at: now,
  }));

  const { error } = await supabase
    .from("crm_inbox_last_seen")
    .upsert(rows, { onConflict: "user_id,chat_id" });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, count: ids.length });
}
