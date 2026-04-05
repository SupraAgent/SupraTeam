import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, context: RouteContext) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const { id } = await context.params;

  const { data: linkedChats, error } = await supabase
    .from("crm_deal_linked_chats")
    .select("*")
    .eq("deal_id", id)
    .order("linked_at", { ascending: false });

  if (error) {
    console.error("[api/deals/linked-chats] error:", error);
    return NextResponse.json({ error: "Failed to fetch linked chats" }, { status: 500 });
  }

  return NextResponse.json({ linked_chats: linkedChats, source: "supabase" });
}

export async function POST(request: Request, context: RouteContext) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user, supabase } = auth;

  const { id } = await context.params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { telegram_chat_id, chat_type, chat_title, chat_link, is_primary } = body;

  if (!telegram_chat_id || !chat_type) {
    return NextResponse.json(
      { error: "telegram_chat_id and chat_type are required" },
      { status: 400 }
    );
  }

  const validChatTypes = ["dm", "group", "channel", "supergroup"];
  if (!validChatTypes.includes(chat_type as string)) {
    return NextResponse.json(
      { error: "chat_type must be one of: dm, group, channel, supergroup" },
      { status: 400 }
    );
  }

  // Verify the deal exists
  const { data: deal, error: dealErr } = await supabase
    .from("crm_deals")
    .select("id")
    .eq("id", id)
    .single();

  if (dealErr || !deal) {
    return NextResponse.json({ error: "Deal not found" }, { status: 404 });
  }

  const { data: linkedChat, error } = await supabase
    .from("crm_deal_linked_chats")
    .insert({
      deal_id: id,
      telegram_chat_id: Number(telegram_chat_id),
      chat_type: chat_type as string,
      chat_title: (chat_title as string) ?? null,
      chat_link: (chat_link as string) ?? null,
      is_primary: (is_primary as boolean) ?? false,
      linked_by: user.id,
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "This conversation is already linked to this deal" },
        { status: 409 }
      );
    }
    console.error("[api/deals/linked-chats] insert error:", error);
    return NextResponse.json({ error: "Failed to link chat" }, { status: 500 });
  }

  return NextResponse.json({ linked_chat: linkedChat, ok: true });
}
