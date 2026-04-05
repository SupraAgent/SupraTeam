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

  // Fetch last 3 messages per deal's TG chat
  interface DealRow { id: string; deal_name: string; telegram_chat_id: number | null }
  interface MessageRow { sender_name: string | null; message_text: string | null; sent_at: string }

  const conversations = await Promise.all(
    (deals as DealRow[]).map(async (deal: DealRow) => {
      const { data: messages } = await auth.supabase
        .from("tg_group_messages")
        .select("sender_name, message_text, sent_at")
        .eq("telegram_chat_id", deal.telegram_chat_id!)
        .order("sent_at", { ascending: false })
        .limit(3);

      return {
        deal_id: deal.id,
        deal_name: deal.deal_name,
        telegram_chat_id: deal.telegram_chat_id as number,
        messages: ((messages ?? []) as MessageRow[])
          .reverse()
          .map((m: MessageRow) => ({
            sender: m.sender_name ?? "Unknown",
            text: m.message_text ?? "",
            sent_at: m.sent_at,
          })),
      };
    })
  );

  return NextResponse.json({ conversations });
}
