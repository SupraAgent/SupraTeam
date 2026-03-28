/**
 * GET /api/inbox — Unified inbox: recent TG messages across all CRM-linked groups
 * Groups messages into conversation threads by chat. Includes linked deal/contact info.
 *
 * Query params:
 *   limit — max conversations (default 30)
 *   before — cursor for pagination (ISO timestamp)
 *   chat_id — filter to specific chat
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

interface ThreadMessage {
  id: string;
  telegram_message_id: number;
  telegram_chat_id: number;
  sender_telegram_id: number;
  sender_name: string;
  sender_username: string | null;
  message_text: string;
  message_type: string;
  reply_to_message_id: number | null;
  sent_at: string;
  is_from_bot: boolean;
}

export async function GET(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { admin: supabase } = auth;

  const { searchParams } = new URL(request.url);
  const limit = Math.min(Number(searchParams.get("limit") ?? 30), 50);
  const before = searchParams.get("before");
  const chatIdFilter = searchParams.get("chat_id");

  // Get all CRM-linked groups with their latest message timestamp
  let groupsQuery = supabase
    .from("tg_groups")
    .select("id, telegram_group_id, group_name, group_type, member_count, invite_link");

  const { data: groups } = await groupsQuery;
  if (!groups || groups.length === 0) {
    return NextResponse.json({ conversations: [], deals: {} });
  }

  const groupMap = new Map(groups.map((g) => [g.telegram_group_id, g]));
  const chatIds = chatIdFilter
    ? [Number(chatIdFilter)]
    : groups.map((g) => g.telegram_group_id);

  // Fetch recent messages across all groups, ordered by time
  let messagesQuery = supabase
    .from("tg_group_messages")
    .select("id, telegram_message_id, telegram_chat_id, sender_telegram_id, sender_name, sender_username, message_text, message_type, reply_to_message_id, sent_at, is_from_bot")
    .in("telegram_chat_id", chatIds)
    .order("sent_at", { ascending: false })
    .limit(500); // fetch more to group into conversations

  if (before) {
    messagesQuery = messagesQuery.lt("sent_at", before);
  }

  const { data: messages, error } = await messagesQuery;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Group messages into conversations by chat_id
  const conversationMap = new Map<number, ThreadMessage[]>();
  for (const msg of (messages ?? []) as ThreadMessage[]) {
    const list = conversationMap.get(msg.telegram_chat_id) ?? [];
    list.push(msg);
    conversationMap.set(msg.telegram_chat_id, list);
  }

  // Build thread trees: group messages that are replies into threads
  const conversations = [];
  for (const [chatId, chatMessages] of conversationMap) {
    const group = groupMap.get(chatId);
    if (!group) continue;

    // Identify threads: messages that are replies form a thread rooted at the original
    const threadRoots = new Map<number, ThreadMessage[]>();
    const standalone: ThreadMessage[] = [];

    for (const msg of chatMessages) {
      if (msg.reply_to_message_id) {
        const rootId = msg.reply_to_message_id;
        const thread = threadRoots.get(rootId) ?? [];
        thread.push(msg);
        threadRoots.set(rootId, thread);
      } else {
        standalone.push(msg);
      }
    }

    // Attach thread replies to their root messages
    const rootMessages = standalone.map((msg) => ({
      ...msg,
      replies: threadRoots.get(msg.telegram_message_id) ?? [],
    }));

    // Orphan replies (root not in this batch) — show as standalone
    for (const [rootId, replies] of threadRoots) {
      if (!standalone.find((m) => m.telegram_message_id === rootId)) {
        rootMessages.push({
          ...replies[0],
          replies: replies.slice(1),
        });
      }
    }

    // Sort by most recent activity (root or latest reply)
    rootMessages.sort((a, b) => {
      const aLatest = a.replies.length > 0 ? a.replies[0].sent_at : a.sent_at;
      const bLatest = b.replies.length > 0 ? b.replies[0].sent_at : b.sent_at;
      return bLatest.localeCompare(aLatest);
    });

    conversations.push({
      chat_id: chatId,
      group_name: group.group_name,
      group_type: group.group_type,
      tg_group_id: group.id,
      member_count: group.member_count,
      message_count: chatMessages.length,
      latest_at: chatMessages[0]?.sent_at ?? null,
      messages: rootMessages.slice(0, 20), // cap per conversation
    });
  }

  // Sort conversations by latest message
  conversations.sort((a, b) => (b.latest_at ?? "").localeCompare(a.latest_at ?? ""));

  // Fetch linked deals for these chats
  const dealChatIds = conversations.map((c) => c.chat_id);
  const { data: deals } = await supabase
    .from("crm_deals")
    .select("id, deal_name, board_type, telegram_chat_id, stage:pipeline_stages(name, color), assigned_to, contact:crm_contacts(id, name)")
    .in("telegram_chat_id", dealChatIds)
    .eq("outcome", "open");

  const dealsByChat: Record<number, typeof deals> = {};
  for (const deal of deals ?? []) {
    const chatId = deal.telegram_chat_id as number;
    if (!dealsByChat[chatId]) dealsByChat[chatId] = [];
    dealsByChat[chatId].push(deal);
  }

  return NextResponse.json({
    conversations: conversations.slice(0, limit),
    deals: dealsByChat,
  });
}
