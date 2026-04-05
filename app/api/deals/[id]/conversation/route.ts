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

interface MessageRow {
  id: string;
  telegram_chat_id: number;
  sender_name: string | null;
  sender_username: string | null;
  sender_telegram_id: number | null;
  message_text: string | null;
  message_type: string;
  media_type: string | null;
  media_file_id: string | null;
  media_thumb_id: string | null;
  media_mime: string | null;
  reply_to_message_id: number | null;
  sent_at: string;
  is_from_bot: boolean;
}

function formatSyncedMessage(
  m: MessageRow,
  contactMap: Record<number, { id: string; name: string }>
) {
  const contact = m.sender_telegram_id ? contactMap[m.sender_telegram_id] : null;
  return {
    id: m.id,
    telegram_chat_id: m.telegram_chat_id,
    sender_name: m.sender_name,
    sender_username: m.sender_username,
    sender_telegram_id: m.sender_telegram_id,
    text: m.message_text,
    message_type: m.message_type,
    media_type: m.media_type ?? null,
    media_file_id: m.media_file_id ?? null,
    media_thumb_id: m.media_thumb_id ?? null,
    media_mime: m.media_mime ?? null,
    reply_to_message_id: m.reply_to_message_id,
    sent_at: m.sent_at,
    is_from_bot: m.is_from_bot,
    source: "synced" as const,
    contact_id: contact?.id ?? null,
    contact_name: contact?.name ?? null,
  };
}

/**
 * GET /api/deals/[id]/conversation
 * Fetch chat messages for a deal's linked Telegram conversations.
 *
 * Query params:
 *   - chat_id: filter to a single linked chat
 *   - cursor: ISO timestamp for backward pagination
 *   - after: ISO timestamp for forward polling
 *   - limit: page size (default 50, max 100)
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
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
  const cursor = url.searchParams.get("cursor");
  const after = url.searchParams.get("after");
  const limit = Math.min(Number(url.searchParams.get("limit") || "50"), 100);

  const chatIds = await resolveChatIds(supabase, id, deal.telegram_chat_id, chatIdFilter);

  if (chatIds.length === 0) {
    return NextResponse.json({ messages: [], hasMore: false, source: "no_chat" });
  }

  // Query synced messages across all linked chats
  let query = supabase
    .from("tg_group_messages")
    .select(MESSAGE_SELECT)
    .in("telegram_chat_id", chatIds)
    .order("sent_at", { ascending: !!after })
    .limit(after ? 50 : limit + 1);

  if (after) {
    query = query.gt("sent_at", after);
  } else if (cursor) {
    query = query.lt("sent_at", cursor);
  }

  const { data: messages, error } = await query;

  if (error) {
    console.error("[conversation] query error:", error);
    return NextResponse.json({ error: "Failed to fetch messages" }, { status: 500 });
  }

  if (messages && messages.length > 0) {
    const typedMessages = messages as MessageRow[];

    // Batch-lookup contacts for senders
    const senderTgIds = [
      ...new Set(typedMessages.map((m) => m.sender_telegram_id).filter(Boolean)),
    ] as number[];
    const contactMap: Record<number, { id: string; name: string }> = {};
    if (senderTgIds.length > 0) {
      const { data: contacts } = await supabase
        .from("crm_contacts")
        .select("id, name, telegram_user_id")
        .in("telegram_user_id", senderTgIds);
      if (contacts) {
        for (const c of contacts as Array<{ id: string; name: string; telegram_user_id: number | null }>) {
          if (c.telegram_user_id) contactMap[c.telegram_user_id] = { id: c.id, name: c.name };
        }
      }
    }

    if (after) {
      return NextResponse.json({
        messages: typedMessages.map((m) => formatSyncedMessage(m, contactMap)),
        hasMore: false,
      });
    }

    const hasMore = typedMessages.length > limit;
    const result = (hasMore ? typedMessages.slice(0, limit) : typedMessages).reverse();
    return NextResponse.json({
      messages: result.map((m) => formatSyncedMessage(m, contactMap)),
      hasMore,
    });
  }

  // Fallback: use crm_notifications (bot-captured, truncated)
  let notifQuery = supabase
    .from("crm_notifications")
    .select("id, title, body, tg_deep_link, tg_sender_name, created_at")
    .eq("deal_id", id)
    .eq("type", "tg_message")
    .order("created_at", { ascending: false })
    .limit(limit + 1);

  if (cursor) {
    notifQuery = notifQuery.lt("created_at", cursor);
  }

  const { data: notifs } = await notifQuery;

  const hasMore = (notifs?.length ?? 0) > limit;
  const trimmed = hasMore ? (notifs ?? []).slice(0, limit) : (notifs ?? []);

  return NextResponse.json({
    messages: trimmed.reverse().map((n) => ({
      id: n.id,
      sender_name: n.tg_sender_name ?? n.title?.split(" in ")[0] ?? "Unknown",
      sender_username: null,
      sender_telegram_id: null,
      text: n.body,
      message_type: "text",
      reply_to_message_id: null,
      sent_at: n.created_at,
      is_from_bot: false,
      tg_deep_link: n.tg_deep_link,
      source: "notification" as const,
    })),
    hasMore,
  });
}

/**
 * POST /api/deals/[id]/conversation
 * Send a reply message to the deal's linked Telegram group.
 * Body: { message: string }
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user, supabase } = auth;

  let body: { message?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!body.message?.trim()) {
    return NextResponse.json({ error: "Message required" }, { status: 400 });
  }

  // Resolve target chat — prefer chat_id param, then junction table, then legacy column
  const targetChatParam = new URL(request.url).searchParams.get("chat_id");
  const { data: deal } = await supabase
    .from("crm_deals")
    .select("telegram_chat_id")
    .eq("id", id)
    .single();

  let chatId: number | null = null;
  let chatType: string | null = null;

  if (targetChatParam) {
    chatId = Number(targetChatParam);
    // Look up chat_type for the specified chat
    const { data: chatInfo } = await supabase
      .from("crm_deal_linked_chats")
      .select("chat_type")
      .eq("deal_id", id)
      .eq("telegram_chat_id", chatId)
      .limit(1)
      .maybeSingle();
    chatType = chatInfo?.chat_type ?? null;
  } else {
    // Check junction table for primary linked chat
    const { data: linkedChats } = await supabase
      .from("crm_deal_linked_chats")
      .select("telegram_chat_id, chat_type")
      .eq("deal_id", id)
      .eq("is_primary", true)
      .limit(1);

    if (linkedChats && linkedChats.length > 0) {
      chatId = Number(linkedChats[0].telegram_chat_id);
      chatType = linkedChats[0].chat_type;
    } else {
      // Fallback: any linked chat
      const { data: anyLinked } = await supabase
        .from("crm_deal_linked_chats")
        .select("telegram_chat_id, chat_type")
        .eq("deal_id", id)
        .limit(1);

      if (anyLinked && anyLinked.length > 0) {
        chatId = Number(anyLinked[0].telegram_chat_id);
        chatType = anyLinked[0].chat_type;
      } else if (deal?.telegram_chat_id) {
        // Legacy fallback
        chatId = Number(deal.telegram_chat_id);
      }
    }
  }

  if (!chatId) {
    return NextResponse.json({ error: "No Telegram chat linked to this deal" }, { status: 400 });
  }

  // Try MTProto user client first (only for server-encrypted sessions)
  const { data: session } = await supabase
    .from("tg_client_sessions")
    .select("session_encrypted, encryption_method")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .order("connected_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (session && session.encryption_method !== "client") {
    try {
      const { getConnectedClient, sendMessage, buildPeer } = await import("@/lib/telegram-client");
      const client = await getConnectedClient(user.id, session.session_encrypted);
      // Use chat_type to determine correct peer type
      let peer;
      if (chatType === "channel" || chatType === "supergroup") {
        // Supergroups/channels use channel peer with the positive ID portion
        peer = buildPeer("channel", Math.abs(chatId) - 1000000000000, 0);
      } else if (chatType === "dm" || chatId > 0) {
        peer = buildPeer("user", chatId, 0);
      } else {
        // Regular group (negative ID, no -100 prefix)
        peer = buildPeer("chat", Math.abs(chatId));
      }
      await sendMessage(client, peer, body.message.trim());
      return NextResponse.json({ ok: true, via: "user_client" });
    } catch (err) {
      console.error("[conversation] MTProto send failed, falling back to bot:", err);
    }
  }

  // Fallback: use bot token (scoped to current user)
  const { data: botToken } = await supabase
    .from("user_tokens")
    .select("encrypted_token")
    .eq("provider", "telegram_bot")
    .eq("user_id", user.id)
    .single();

  if (!botToken) {
    return NextResponse.json({ error: "No Telegram bot configured. Connect one in Settings > Integrations." }, { status: 400 });
  }

  try {
    const { decryptToken } = await import("@/lib/crypto");
    const token = decryptToken(botToken.encrypted_token);
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: body.message.trim() }),
    });
    let data: Record<string, unknown>;
    try {
      data = await res.json();
    } catch {
      return NextResponse.json({ error: `Telegram API returned ${res.status} (non-JSON)` }, { status: 502 });
    }
    if (!data.ok) {
      return NextResponse.json({ error: (data.description as string) || "Bot send failed" }, { status: 500 });
    }
    return NextResponse.json({ ok: true, via: "bot" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Send failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
