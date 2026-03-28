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
  const { user, admin: supabase } = auth;

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
  const { user, admin: supabase } = auth;

  let body: { chat_id?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const chatId = Number(body.chat_id);
  if (!chatId || Number.isNaN(chatId)) {
    return NextResponse.json({ error: "Valid chat_id required" }, { status: 400 });
  }

  const { error } = await supabase
    .from("crm_inbox_last_seen")
    .upsert(
      { user_id: user.id, chat_id: chatId, last_seen_at: new Date().toISOString() },
      { onConflict: "user_id,chat_id" }
    );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
