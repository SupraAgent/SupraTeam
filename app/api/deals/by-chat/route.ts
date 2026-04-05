import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import type { Deal, DealLinkedChat } from "@/lib/types";

interface DealWithLink extends Deal {
  link: DealLinkedChat;
}

export async function GET(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const { searchParams } = new URL(request.url);
  const chatIdParam = searchParams.get("chat_id");

  if (!chatIdParam) {
    return NextResponse.json(
      { error: "chat_id query parameter is required" },
      { status: 400 }
    );
  }

  const chatId = Number(chatIdParam);
  if (!Number.isFinite(chatId) || chatId === 0) {
    return NextResponse.json(
      { error: "chat_id must be a valid non-zero number" },
      { status: 400 }
    );
  }

  // 1. Query junction table: deals linked via crm_deal_linked_chats
  const { data: linkedRows, error: linkedError } = await supabase
    .from("crm_deal_linked_chats")
    .select(`
      deal_id,
      telegram_chat_id,
      chat_type,
      chat_title,
      chat_link,
      is_primary,
      linked_by,
      linked_at,
      deal:crm_deals(
        *,
        contact:crm_contacts(*),
        stage:pipeline_stages(*)
      )
    `)
    .eq("telegram_chat_id", chatId);

  if (linkedError) {
    console.error("[api/deals/by-chat] junction query error:", linkedError);
    return NextResponse.json(
      { error: "Failed to query linked chats" },
      { status: 500 }
    );
  }

  // Build results from junction table
  const dealsMap = new Map<string, DealWithLink>();

  for (const row of linkedRows ?? []) {
    // Supabase returns joined single row as object (not array) for belongs-to
    const deal = row.deal as unknown as Deal | null;
    if (!deal) continue;

    const link: DealLinkedChat = {
      deal_id: row.deal_id,
      telegram_chat_id: row.telegram_chat_id,
      chat_type: row.chat_type,
      chat_title: row.chat_title,
      chat_link: row.chat_link,
      is_primary: row.is_primary,
      linked_by: row.linked_by,
      linked_at: row.linked_at,
    };

    dealsMap.set(deal.id, { ...deal, link });
  }

  // 2. Legacy fallback: check crm_deals.telegram_chat_id directly
  const { data: legacyDeals, error: legacyError } = await supabase
    .from("crm_deals")
    .select(`
      *,
      contact:crm_contacts(*),
      stage:pipeline_stages(*)
    `)
    .eq("telegram_chat_id", chatId);

  if (legacyError) {
    console.error("[api/deals/by-chat] legacy query error:", legacyError);
    // Non-fatal: we still have junction results
  }

  // Merge legacy deals (deduplicate by deal id)
  for (const deal of legacyDeals ?? []) {
    if (dealsMap.has(deal.id)) continue;

    const syntheticLink: DealLinkedChat = {
      deal_id: deal.id,
      telegram_chat_id: chatId,
      chat_type: "group",
      chat_title: deal.telegram_chat_name ?? null,
      chat_link: deal.telegram_chat_link ?? null,
      is_primary: true,
      linked_by: deal.created_by ?? null,
      linked_at: deal.created_at,
    };

    dealsMap.set(deal.id, { ...deal, link: syntheticLink });
  }

  const data = Array.from(dealsMap.values());

  return NextResponse.json({ data, source: "supabase" });
}
