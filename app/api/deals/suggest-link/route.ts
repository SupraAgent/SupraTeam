import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

interface DealSuggestion {
  id: string;
  deal_name: string;
  stage_name?: string;
  contact_name?: string;
  match_reason: string;
}

export async function GET(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const { searchParams } = new URL(request.url);
  const chatIdParam = searchParams.get("chat_id");
  const chatTitle = searchParams.get("chat_title");

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

  // Check if deals are already linked to this chat_id
  const { data: existingLinks, error: linkError } = await supabase
    .from("crm_deal_linked_chats")
    .select("id")
    .eq("telegram_chat_id", chatId)
    .limit(1);

  if (linkError) {
    console.error("[api/deals/suggest-link] link check error:", linkError);
    return NextResponse.json(
      { error: "Failed to check existing links" },
      { status: 500 }
    );
  }

  if (existingLinks && existingLinks.length > 0) {
    return NextResponse.json({ suggestions: [] });
  }

  // Also check legacy telegram_chat_id on crm_deals
  const { data: legacyLinks } = await supabase
    .from("crm_deals")
    .select("id")
    .eq("telegram_chat_id", chatId)
    .limit(1);

  if (legacyLinks && legacyLinks.length > 0) {
    return NextResponse.json({ suggestions: [] });
  }

  // No chat_title means we can't do fuzzy matching
  if (!chatTitle || !chatTitle.trim()) {
    return NextResponse.json({ suggestions: [] });
  }

  const title = chatTitle.trim();
  const suggestions: DealSuggestion[] = [];
  const seenIds = new Set<string>();

  // Supabase returns joined relations as arrays or objects depending on cardinality.
  // We normalise to a single object (or null) for safety.
  function firstOrObj<T>(val: T | T[] | null | undefined): T | null {
    if (val == null) return null;
    if (Array.isArray(val)) return val[0] ?? null;
    return val;
  }

  // Helper to add a suggestion (deduplicating)
  function addSuggestion(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- raw supabase row
    deal: Record<string, unknown>,
    reason: string
  ) {
    const id = deal.id as string;
    if (seenIds.has(id) || suggestions.length >= 3) return;
    seenIds.add(id);
    const stage = firstOrObj(deal.stage as { name: string } | { name: string }[] | null);
    const contact = firstOrObj(deal.contact as { name: string } | { name: string }[] | null);
    suggestions.push({
      id,
      deal_name: deal.deal_name as string,
      stage_name: stage?.name ?? undefined,
      contact_name: contact?.name ?? undefined,
      match_reason: reason,
    });
  }

  // a. Match by telegram_chat_name ILIKE chat_title
  const { data: chatNameMatches } = await supabase
    .from("crm_deals")
    .select("id, deal_name, stage:pipeline_stages(name), contact:crm_contacts(name)")
    .ilike("telegram_chat_name", `%${title}%`)
    .limit(3);

  for (const deal of chatNameMatches ?? []) {
    addSuggestion(deal as Record<string, unknown>, "Chat name matches group");
  }

  // b. Match by deal_name ILIKE chat_title
  if (suggestions.length < 3) {
    const { data: dealNameMatches } = await supabase
      .from("crm_deals")
      .select("id, deal_name, stage:pipeline_stages(name), contact:crm_contacts(name)")
      .ilike("deal_name", `%${title}%`)
      .limit(3);

    for (const deal of dealNameMatches ?? []) {
      addSuggestion(deal as Record<string, unknown>, "Deal name matches group");
    }
  }

  // c. Match by contact's telegram_username appearing in the chat_title
  if (suggestions.length < 3) {
    const { data: contactMatches } = await supabase
      .from("crm_contacts")
      .select("id, telegram_username")
      .not("telegram_username", "is", null)
      .neq("telegram_username", "");

    for (const contact of contactMatches ?? []) {
      if (suggestions.length >= 3) break;
      const username = contact.telegram_username?.toLowerCase();
      if (!username || !title.toLowerCase().includes(username)) continue;

      // Find deals linked to this contact
      const { data: contactDeals } = await supabase
        .from("crm_deals")
        .select("id, deal_name, stage:pipeline_stages(name), contact:crm_contacts(name)")
        .eq("contact_id", contact.id)
        .limit(3);

      for (const deal of contactDeals ?? []) {
        addSuggestion(deal as unknown as Record<string, unknown>, `Contact @${contact.telegram_username} in group name`);
      }
    }
  }

  return NextResponse.json({ suggestions });
}
