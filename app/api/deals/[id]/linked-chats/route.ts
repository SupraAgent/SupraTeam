import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const { data, error } = await supabase
    .from("crm_deal_linked_chats")
    .select("*")
    .eq("deal_id", id)
    .order("is_primary", { ascending: false })
    .order("linked_at", { ascending: true });

  if (error) {
    console.error("[api/deals/[id]/linked-chats] error:", error);
    return NextResponse.json({ error: "Failed to fetch linked chats" }, { status: 500 });
  }

  return NextResponse.json({ data: data ?? [] });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user, supabase } = auth;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { telegram_chat_id, chat_type, chat_title, chat_link, is_primary } = body;

  if (!telegram_chat_id || typeof telegram_chat_id !== "number") {
    return NextResponse.json({ error: "telegram_chat_id (number) is required" }, { status: 400 });
  }
  if (!chat_type || typeof chat_type !== "string" || !["dm", "group", "channel", "supergroup"].includes(chat_type)) {
    return NextResponse.json({ error: "chat_type must be dm, group, channel, or supergroup" }, { status: 400 });
  }

  // If setting as primary, unset existing primary first
  if (is_primary) {
    await supabase
      .from("crm_deal_linked_chats")
      .update({ is_primary: false })
      .eq("deal_id", id)
      .eq("is_primary", true);
  }

  const { data, error } = await supabase
    .from("crm_deal_linked_chats")
    .upsert(
      {
        deal_id: id,
        telegram_chat_id,
        chat_type,
        chat_title: chat_title ?? null,
        chat_link: chat_link ?? null,
        is_primary: is_primary ?? false,
        linked_by: user.id,
      },
      { onConflict: "deal_id,telegram_chat_id" }
    )
    .select()
    .single();

  if (error) {
    console.error("[api/deals/[id]/linked-chats] insert error:", error);
    return NextResponse.json({ error: "Failed to link chat" }, { status: 500 });
  }

  return NextResponse.json({ data, ok: true });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const { searchParams } = new URL(request.url);
  const chatId = searchParams.get("chat_id");

  if (!chatId) {
    return NextResponse.json({ error: "chat_id query param is required" }, { status: 400 });
  }

  const { error } = await supabase
    .from("crm_deal_linked_chats")
    .delete()
    .eq("deal_id", id)
    .eq("telegram_chat_id", Number(chatId));

  if (error) {
    console.error("[api/deals/[id]/linked-chats] delete error:", error);
    return NextResponse.json({ error: "Failed to unlink chat" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { telegram_chat_id, is_primary } = body;

  if (!telegram_chat_id || typeof is_primary !== "boolean") {
    return NextResponse.json({ error: "telegram_chat_id and is_primary are required" }, { status: 400 });
  }

  // If setting as primary, unset existing primary first
  if (is_primary) {
    await supabase
      .from("crm_deal_linked_chats")
      .update({ is_primary: false })
      .eq("deal_id", id)
      .eq("is_primary", true);
  }

  const { data, error } = await supabase
    .from("crm_deal_linked_chats")
    .update({ is_primary })
    .eq("deal_id", id)
    .eq("telegram_chat_id", telegram_chat_id)
    .select()
    .single();

  if (error) {
    console.error("[api/deals/[id]/linked-chats] patch error:", error);
    return NextResponse.json({ error: "Failed to update linked chat" }, { status: 500 });
  }

  return NextResponse.json({ data, ok: true });
}
