import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAuth } from "@/lib/auth-guard";

const MESSAGE_SELECT =
  "id, telegram_chat_id, sender_name, sender_username, sender_telegram_id, message_text, message_type, media_type, media_file_id, media_thumb_id, media_mime, reply_to_message_id, sent_at, is_from_bot";

/**
 * Resolve which Telegram chat IDs to query for a given deal.
 * Prefers the junction table `crm_deal_linked_chats`; falls back to
 * `crm_deals.telegram_chat_id` for backward compatibility.
 *
 * If `filterChatId` is provided, only that chat is returned (provided it
 * is actually linked to the deal).
 */
async function resolveChatIds(
  supabase: SupabaseClient,
  dealId: string,
  legacyChatId: string | number | null,
  filterChatId: string | null
): Promise<number[]> {
  const { data: linkedChats } = await supabase
    .from("crm_deal_linked_chats")
    .select("telegram_chat_id")
    .eq("deal_id", dealId);

  if (linkedChats && linkedChats.length > 0) {
    const chatIds = (linkedChats as Array<{ telegram_chat_id: number }>).map(
      (lc) => lc.telegram_chat_id
    );
    if (filterChatId) {
      const filtered = Number(filterChatId);
      return chatIds.includes(filtered) ? [filtered] : [];
    }
    return chatIds;
  }

  // Backward compat: fall back to legacy single chat field
  if (legacyChatId) {
    const legacy = Number(legacyChatId);
    if (filterChatId && Number(filterChatId) !== legacy) return [];
    return [legacy];
  }

  return [];
}

/**
 * GET /api/deals/[id]/timeline
 * Fetch conversation timeline messages for a deal's linked Telegram conversations.
 * Paginated with limit/offset, ordered by sent_at desc (newest first).
 *
 * Query params:
 *   - chat_id: filter to a single linked chat
 *   - limit (default 50, max 100)
 *   - offset (default 0)
 *   - after (ISO timestamp) — for polling new messages since a point in time
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  // Get deal (need legacy telegram_chat_id for backward compat)
  const { data: deal } = await supabase
    .from("crm_deals")
    .select("telegram_chat_id")
    .eq("id", id)
    .single();

  if (!deal) {
    return NextResponse.json({ error: "Deal not found" }, { status: 404 });
  }

  const url = new URL(request.url);
  const chatIdFilter = url.searchParams.get("chat_id");
  const after = url.searchParams.get("after");
  const limit = Math.min(Number(url.searchParams.get("limit") || "50"), 100);
  const offset = Math.max(Number(url.searchParams.get("offset") || "0"), 0);

  const chatIds = await resolveChatIds(supabase, id, deal.telegram_chat_id, chatIdFilter);

  if (chatIds.length === 0) {
    return NextResponse.json({
      messages: [],
      total: 0,
      hasMore: false,
    });
  }

  // Polling mode: fetch messages after a timestamp
  if (after) {
    const { data: newMessages, error } = await supabase
      .from("tg_group_messages")
      .select(MESSAGE_SELECT)
      .in("telegram_chat_id", chatIds)
      .gt("sent_at", after)
      .order("sent_at", { ascending: true })
      .limit(50);

    if (error) {
      console.error("[timeline] poll query error:", error);
      return NextResponse.json({ error: "Failed to fetch messages" }, { status: 500 });
    }

    const contactMap = await buildContactMap(supabase, newMessages ?? []);

    return NextResponse.json({
      messages: (newMessages ?? []).map((m) => formatMessage(m, contactMap)),
      total: newMessages?.length ?? 0,
      hasMore: false,
    });
  }

  // Paginated mode: fetch limit+1 to detect hasMore, newest first
  const { data: messages, error } = await supabase
    .from("tg_group_messages")
    .select(MESSAGE_SELECT)
    .in("telegram_chat_id", chatIds)
    .order("sent_at", { ascending: false })
    .range(offset, offset + limit); // Inclusive on both ends → fetches limit+1 rows; extra row used to detect hasMore

  if (error) {
    console.error("[timeline] query error:", error);
    return NextResponse.json({ error: "Failed to fetch messages" }, { status: 500 });
  }

  const hasMore = (messages?.length ?? 0) > limit;
  const trimmed = hasMore ? (messages ?? []).slice(0, limit) : (messages ?? []);
  const contactMap = await buildContactMap(supabase, trimmed);
  const reversed = trimmed.reverse(); // oldest first for chat display

  return NextResponse.json({
    messages: reversed.map((m) => formatMessage(m, contactMap)),
    total: reversed.length,
    hasMore,
  });
}

interface RawMessage {
  sender_telegram_id: number | null;
  [key: string]: unknown;
}

/** Batch-lookup CRM contacts by their Telegram IDs for sender enrichment. */
async function buildContactMap(
  supabase: SupabaseClient,
  messages: RawMessage[]
): Promise<Record<number, { id: string; name: string }>> {
  const senderTgIds = [
    ...new Set(
      messages.map((m) => m.sender_telegram_id).filter(Boolean)
    ),
  ] as number[];

  const contactMap: Record<number, { id: string; name: string }> = {};
  if (senderTgIds.length === 0) return contactMap;

  const { data: contacts } = await supabase
    .from("crm_contacts")
    .select("id, name, telegram_user_id")
    .in("telegram_user_id", senderTgIds);

  if (contacts) {
    for (const c of contacts as Array<{ id: string; name: string; telegram_user_id: number | null }>) {
      if (c.telegram_user_id) contactMap[c.telegram_user_id] = { id: c.id, name: c.name };
    }
  }

  return contactMap;
}

/** Format a raw tg_group_messages row into the API response shape. */
function formatMessage(
  m: Record<string, unknown>,
  contactMap: Record<number, { id: string; name: string }>
) {
  const senderTgId = m.sender_telegram_id as number | null;
  const contact = senderTgId ? contactMap[senderTgId] : null;

  return {
    id: m.id,
    telegram_chat_id: m.telegram_chat_id,
    sender_name: m.sender_name,
    sender_username: m.sender_username,
    sender_telegram_id: senderTgId,
    message_text: m.message_text,
    message_type: m.message_type,
    media_type: m.media_type ?? null,
    media_file_id: m.media_file_id ?? null,
    media_thumb_id: m.media_thumb_id ?? null,
    media_mime: m.media_mime ?? null,
    reply_to_message_id: m.reply_to_message_id,
    sent_at: m.sent_at,
    is_from_bot: m.is_from_bot ?? false,
    contact_id: contact?.id ?? null,
    contact_name: contact?.name ?? null,
  };
}
