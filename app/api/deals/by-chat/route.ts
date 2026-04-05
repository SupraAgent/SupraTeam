import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

export async function GET(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const { searchParams } = new URL(request.url);
  const chatId = searchParams.get("chat_id");

  if (!chatId) {
    return NextResponse.json({ error: "chat_id is required" }, { status: 400 });
  }

  const numericChatId = Number(chatId);
  if (isNaN(numericChatId)) {
    return NextResponse.json({ error: "chat_id must be a number" }, { status: 400 });
  }

  // Find deals linked via the crm_deal_linked_chats junction table
  const { data: linkedChats, error: linkedErr } = await supabase
    .from("crm_deal_linked_chats")
    .select("deal_id, is_primary, linked_at")
    .eq("telegram_chat_id", numericChatId);

  if (linkedErr) {
    console.error("[api/deals/by-chat] linked chats error:", linkedErr);
    return NextResponse.json({ error: "Failed to fetch linked chats" }, { status: 500 });
  }

  // Also find deals linked via the legacy telegram_chat_id column on crm_deals
  const { data: legacyDeals, error: legacyErr } = await supabase
    .from("crm_deals")
    .select(`
      id, deal_name, board_type, stage_id, value, probability, health_score,
      ai_summary, assigned_to,
      contact:crm_contacts(id, name),
      stage:pipeline_stages(id, name, color, position)
    `)
    .eq("telegram_chat_id", numericChatId);

  if (legacyErr) {
    console.error("[api/deals/by-chat] legacy deals error:", legacyErr);
  }

  // Fetch full deal data for linked chat deals
  const linkedDealIds = (linkedChats ?? []).map((lc) => lc.deal_id);
  let linkedDeals: typeof legacyDeals = [];

  if (linkedDealIds.length > 0) {
    const { data, error } = await supabase
      .from("crm_deals")
      .select(`
        id, deal_name, board_type, stage_id, value, probability, health_score,
        ai_summary, assigned_to,
        contact:crm_contacts(id, name),
        stage:pipeline_stages(id, name, color, position)
      `)
      .in("id", linkedDealIds);

    if (error) {
      console.error("[api/deals/by-chat] linked deals fetch error:", error);
    } else {
      linkedDeals = data;
    }
  }

  // Merge and deduplicate by deal id
  const allDeals = [...(legacyDeals ?? []), ...(linkedDeals ?? [])];
  const seen = new Set<string>();
  const deals = allDeals.filter((d) => {
    if (seen.has(d.id)) return false;
    seen.add(d.id);
    return true;
  });

  return NextResponse.json({ deals, source: "supabase" });
}
