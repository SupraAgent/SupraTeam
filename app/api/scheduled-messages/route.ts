import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

export async function GET() {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user, admin: supabase } = auth;

  const { data, error } = await supabase
    .from("crm_scheduled_messages")
    .select("*, deal:crm_deals(deal_name)")
    .eq("created_by", user.id)
    .order("send_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ messages: data ?? [] });
}

export async function POST(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user, admin: supabase } = auth;

  const { deal_id, message_text, send_at } = await request.json();

  if (!message_text || !send_at) {
    return NextResponse.json({ error: "message_text and send_at required" }, { status: 400 });
  }

  // Get chat_id from deal if deal_id provided
  let tgChatId: number | null = null;
  if (deal_id) {
    const { data: deal } = await supabase
      .from("crm_deals")
      .select("telegram_chat_id")
      .eq("id", deal_id)
      .single();
    tgChatId = deal?.telegram_chat_id ?? null;
  }

  if (!tgChatId) {
    return NextResponse.json({ error: "Deal has no linked Telegram chat" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("crm_scheduled_messages")
    .insert({
      deal_id,
      tg_chat_id: tgChatId,
      message_text,
      send_at,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ message: data, ok: true });
}

export async function DELETE(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user, admin: supabase } = auth;

  const { id } = await request.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const { error } = await supabase
    .from("crm_scheduled_messages")
    .update({ status: "cancelled" })
    .eq("id", id)
    .eq("created_by", user.id)
    .eq("status", "pending");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
