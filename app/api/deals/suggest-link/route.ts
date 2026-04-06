import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

interface DealSuggestion {
  id: string;
  deal_name: string;
  stage_name?: string;
  contact_name?: string;
  match_reason: string;
}

/** Escape ILIKE metacharacters to prevent wildcard injection */
function escapeIlike(input: string): string {
  return input.replace(/[%_\\]/g, (ch) => `\\${ch}`);
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

  // Check if deals are already linked to this chat_id (junction table)
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
  const { data: legacyLinks, error: legacyError } = await supabase
    .from("crm_deals")
    .select("id")
    .eq("telegram_chat_id", chatId)
    .limit(1);

  if (legacyError) {
    console.error("[api/deals/suggest-link] legacy link check error:", legacyError);
  }

  if (legacyLinks && legacyLinks.length > 0) {
    return NextResponse.json({ suggestions: [] });
  }

  // No chat_title means we can't do fuzzy matching
  if (!chatTitle || !chatTitle.trim()) {
    return NextResponse.json({ suggestions: [] });
  }

  const title = chatTitle.trim();
  const escapedTitle = escapeIlike(title);
  const suggestions: DealSuggestion[] = [];
  const seenIds = new Set<string>();

  // Supabase returns joined relations as arrays or objects depending on cardinality.
  function firstOrObj<T>(val: T | T[] | null | undefined): T | null {
    if (val == null) return null;
    if (Array.isArray(val)) return val[0] ?? null;
    return val;
  }

  function addSuggestion(
    deal: Record<string, unknown>,
    reason: string
  ) {
    const id = deal.id as string;
    if (!id || seenIds.has(id) || suggestions.length >= 3) return;
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

  const selectFields = "id, deal_name, stage:pipeline_stages(name), contact:crm_contacts(name)";

  // a. Match by telegram_chat_name ILIKE chat_title (escaped)
  const { data: chatNameMatches } = await supabase
    .from("crm_deals")
    .select(selectFields)
    .ilike("telegram_chat_name", `%${escapedTitle}%`)
    .limit(3);

  for (const deal of chatNameMatches ?? []) {
    addSuggestion(deal as unknown as Record<string, unknown>, "Chat name matches group");
  }

  // b. Match by deal_name ILIKE chat_title (escaped)
  if (suggestions.length < 3) {
    const { data: dealNameMatches } = await supabase
      .from("crm_deals")
      .select(selectFields)
      .ilike("deal_name", `%${escapedTitle}%`)
      .limit(3);

    for (const deal of dealNameMatches ?? []) {
      addSuggestion(deal as unknown as Record<string, unknown>, "Deal name matches group");
    }
  }

  // c. Match by contact's telegram_username appearing in the chat_title
  //    Single query: find contacts whose username is in the title, then
  //    batch-fetch their deals in one query (avoids N+1).
  if (suggestions.length < 3) {
    const { data: contactMatches } = await supabase
      .from("crm_contacts")
      .select("id, telegram_username")
      .not("telegram_username", "is", null)
      .neq("telegram_username", "")
      .limit(100);

    const matchingContactIds: string[] = [];
    const contactUsernameMap = new Map<string, string>();
    const titleLower = title.toLowerCase();

    for (const contact of contactMatches ?? []) {
      const username = contact.telegram_username?.toLowerCase();
      if (username && titleLower.includes(username)) {
        matchingContactIds.push(contact.id);
        contactUsernameMap.set(contact.id, contact.telegram_username ?? "");
      }
    }

    if (matchingContactIds.length > 0) {
      const { data: contactDeals } = await supabase
        .from("crm_deals")
        .select(`contact_id, ${selectFields}`)
        .in("contact_id", matchingContactIds)
        .limit(3);

      for (const deal of contactDeals ?? []) {
        const contactId = (deal as unknown as Record<string, unknown>).contact_id as string;
        const username = contactUsernameMap.get(contactId) ?? "";
        addSuggestion(deal as unknown as Record<string, unknown>, `Contact @${username} in group name`);
      }
    }
  }

  return NextResponse.json({ suggestions });
}
