import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import type { DealLinkedChat, LinkedChatType } from "@/lib/types";

const VALID_CHAT_TYPES: LinkedChatType[] = ["dm", "group", "channel", "supergroup"];

/**
 * GET /api/deals/[id]/linked-chats
 * List all linked Telegram chats for a deal.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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
    console.error("[linked-chats] GET error:", error);
    return NextResponse.json({ error: "Failed to fetch linked chats" }, { status: 500 });
  }

  return NextResponse.json({ data: (data ?? []) as DealLinkedChat[] });
}

interface LinkChatBody {
  telegram_chat_id?: number;
  chat_type?: string;
  chat_title?: string;
  chat_link?: string;
  is_primary?: boolean;
}

/**
 * POST /api/deals/[id]/linked-chats
 * Link a Telegram chat to a deal.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user, supabase } = auth;

  let body: LinkChatBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.telegram_chat_id || typeof body.telegram_chat_id !== "number") {
    return NextResponse.json(
      { error: "telegram_chat_id is required and must be a number" },
      { status: 400 }
    );
  }

  if (!body.chat_type || !VALID_CHAT_TYPES.includes(body.chat_type as LinkedChatType)) {
    return NextResponse.json(
      { error: `chat_type is required and must be one of: ${VALID_CHAT_TYPES.join(", ")}` },
      { status: 400 }
    );
  }

  // Verify deal exists
  const { data: deal } = await supabase
    .from("crm_deals")
    .select("id")
    .eq("id", id)
    .single();

  if (!deal) {
    return NextResponse.json({ error: "Deal not found" }, { status: 404 });
  }

  // If marking as primary, clear primary flag on other links for this deal
  if (body.is_primary) {
    const { error: updateError } = await supabase
      .from("crm_deal_linked_chats")
      .update({ is_primary: false })
      .eq("deal_id", id)
      .eq("is_primary", true);

    if (updateError) {
      console.error("[linked-chats] clear primary error:", updateError);
      return NextResponse.json({ error: "Failed to update primary status" }, { status: 500 });
    }
  }

  const { data, error } = await supabase
    .from("crm_deal_linked_chats")
    .insert({
      deal_id: id,
      telegram_chat_id: body.telegram_chat_id,
      chat_type: body.chat_type,
      chat_title: body.chat_title ?? null,
      chat_link: body.chat_link ?? null,
      is_primary: body.is_primary ?? false,
      linked_by: user.id,
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "This chat is already linked to this deal" },
        { status: 409 }
      );
    }
    console.error("[linked-chats] POST error:", error);
    return NextResponse.json({ error: "Failed to link chat" }, { status: 500 });
  }

  return NextResponse.json({ data: data as DealLinkedChat }, { status: 201 });
}

/**
 * DELETE /api/deals/[id]/linked-chats?chat_id=<telegram_chat_id>
 * Unlink a Telegram chat from a deal.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const url = new URL(request.url);
  const chatIdParam = url.searchParams.get("chat_id");

  if (!chatIdParam) {
    return NextResponse.json(
      { error: "chat_id query parameter is required" },
      { status: 400 }
    );
  }

  const telegramChatId = Number(chatIdParam);
  if (isNaN(telegramChatId)) {
    return NextResponse.json(
      { error: "chat_id must be a valid number" },
      { status: 400 }
    );
  }

  const { error, count } = await supabase
    .from("crm_deal_linked_chats")
    .delete({ count: "exact" })
    .eq("deal_id", id)
    .eq("telegram_chat_id", telegramChatId);

  if (error) {
    console.error("[linked-chats] DELETE error:", error);
    return NextResponse.json({ error: "Failed to unlink chat" }, { status: 500 });
  }

  if (count === 0) {
    return NextResponse.json({ error: "Linked chat not found" }, { status: 404 });
  }

  return NextResponse.json({ data: { success: true } });
}
