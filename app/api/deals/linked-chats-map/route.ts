import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

/**
 * GET /api/deals/linked-chats-map
 *
 * Returns a lightweight list of all deal-chat links with deal name and stage info.
 * Used by the Telegram conversation list to show deal badges without N+1 queries.
 */
export async function GET() {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const { data, error } = await supabase
    .from("crm_deal_linked_chats")
    .select(`
      telegram_chat_id,
      deal_id,
      deal:crm_deals(
        deal_name,
        board_type,
        stage:pipeline_stages(name, color)
      )
    `);

  if (error) {
    console.error("[api/deals/linked-chats-map]", error);
    return NextResponse.json({ error: "Failed to query" }, { status: 500 });
  }

  const links = (data ?? [])
    .filter((row) => row.deal)
    .map((row) => {
      const deal = row.deal as unknown as {
        deal_name: string;
        board_type: string | null;
        stage: { name: string; color: string } | null;
      };
      return {
        telegram_chat_id: row.telegram_chat_id,
        deal_id: row.deal_id,
        deal_name: deal.deal_name,
        stage_name: deal.stage?.name ?? null,
        stage_color: deal.stage?.color ?? null,
        board_type: deal.board_type,
      };
    });

  return NextResponse.json({ links });
}
