/**
 * GET /api/contacts/[id]/conversations
 * Returns recent TG messages from deals linked to this contact.
 * Light preview: last 3 messages per deal conversation.
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  const { id: contactId } = await params;

  // Find all deals linked to this contact that have a telegram_chat_id
  const { data: deals, error } = await auth.supabase
    .from("crm_deals")
    .select("id, deal_name, telegram_chat_id")
    .eq("contact_id", contactId)
    .not("telegram_chat_id", "is", null)
    .order("updated_at", { ascending: false })
    .limit(10);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!deals || deals.length === 0) {
    return NextResponse.json({ conversations: [] });
  }

  interface DealRow { id: string; deal_name: string; telegram_chat_id: number | null }

  // Filter out any deals where telegram_chat_id is null (defensive — .not() should handle it)
  const validDeals = (deals as DealRow[]).filter(
    (d): d is DealRow & { telegram_chat_id: number } => d.telegram_chat_id != null
  );

  if (validDeals.length === 0) {
    return NextResponse.json({ conversations: [] });
  }

  // Single query for all chats — avoids N+1 by using .in() with partition logic
  const chatIds = validDeals.map((d) => d.telegram_chat_id);
  const { data: allMessages } = await auth.supabase
    .from("tg_group_messages")
    .select("telegram_chat_id, sender_name, message_text, sent_at")
    .in("telegram_chat_id", chatIds)
    .order("sent_at", { ascending: false })
    .limit(chatIds.length * 5); // fetch slightly more than 3 per chat to account for uneven distribution

  // Group messages by chat_id, keep only last 3 per chat
  const messagesByChatId = new Map<number, { sender: string; text: string; sent_at: string }[]>();
  for (const msg of allMessages ?? []) {
    const chatId = msg.telegram_chat_id as number;
    if (!messagesByChatId.has(chatId)) messagesByChatId.set(chatId, []);
    const bucket = messagesByChatId.get(chatId)!;
    if (bucket.length < 3) {
      bucket.push({
        sender: (msg.sender_name as string | null) ?? "Unknown",
        text: (msg.message_text as string | null) ?? "",
        sent_at: msg.sent_at as string,
      });
    }
  }

  const conversations = validDeals.map((deal) => ({
    deal_id: deal.id,
    deal_name: deal.deal_name,
    telegram_chat_id: deal.telegram_chat_id,
    messages: (messagesByChatId.get(deal.telegram_chat_id) ?? []).reverse(),
  }));

  return NextResponse.json({ conversations });
}
