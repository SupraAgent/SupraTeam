import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

/**
 * GET /api/deals/[id]/conversation
 * Fetch chat messages for a deal's linked Telegram group.
 * Query params: cursor (ISO timestamp), limit (default 50)
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { admin } = auth;

  // Get deal's telegram_chat_id
  const { data: deal } = await admin
    .from("crm_deals")
    .select("telegram_chat_id")
    .eq("id", id)
    .single();

  if (!deal) {
    return NextResponse.json({ error: "Deal not found" }, { status: 404 });
  }

  if (!deal.telegram_chat_id) {
    return NextResponse.json({ messages: [], hasMore: false, source: "no_chat" });
  }

  const url = new URL(request.url);
  const cursor = url.searchParams.get("cursor");
  const limit = Math.min(Number(url.searchParams.get("limit") || "50"), 100);

  // Try tg_group_messages first (full synced messages)
  let query = admin
    .from("tg_group_messages")
    .select("id, sender_name, sender_username, sender_telegram_id, message_text, message_type, reply_to_message_id, sent_at, is_from_bot")
    .eq("telegram_chat_id", deal.telegram_chat_id)
    .order("sent_at", { ascending: false })
    .limit(limit + 1); // fetch one extra to check hasMore

  if (cursor) {
    query = query.lt("sent_at", cursor);
  }

  const { data: messages, error } = await query;

  if (error) {
    console.error("[conversation] query error:", error);
    return NextResponse.json({ error: "Failed to fetch messages" }, { status: 500 });
  }

  if (messages && messages.length > 0) {
    const hasMore = messages.length > limit;
    const result = (hasMore ? messages.slice(0, limit) : messages).reverse(); // oldest first for chat display
    return NextResponse.json({
      messages: result.map((m) => ({
        id: m.id,
        sender_name: m.sender_name,
        sender_username: m.sender_username,
        sender_telegram_id: m.sender_telegram_id,
        text: m.message_text,
        message_type: m.message_type,
        reply_to_message_id: m.reply_to_message_id,
        sent_at: m.sent_at,
        is_from_bot: m.is_from_bot,
        source: "synced" as const,
      })),
      hasMore,
    });
  }

  // Fallback: use crm_notifications (bot-captured, truncated)
  let notifQuery = admin
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
  const { user, admin } = auth;

  let body: { message?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!body.message?.trim()) {
    return NextResponse.json({ error: "Message required" }, { status: 400 });
  }

  // Get deal's telegram_chat_id
  const { data: deal } = await admin
    .from("crm_deals")
    .select("telegram_chat_id")
    .eq("id", id)
    .single();

  if (!deal?.telegram_chat_id) {
    return NextResponse.json({ error: "No Telegram chat linked to this deal" }, { status: 400 });
  }

  const chatId = Number(deal.telegram_chat_id);

  // Try MTProto user client first
  const { data: session } = await admin
    .from("tg_client_sessions")
    .select("session_encrypted")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .single();

  if (session) {
    try {
      const { getConnectedClient, sendMessage, buildPeer } = await import("@/lib/telegram-client");
      const client = await getConnectedClient(user.id, session.session_encrypted);
      // Negative IDs = supergroup/channel, positive = regular chat
      const peer = chatId < 0
        ? buildPeer("channel", Math.abs(chatId) - 1000000000000, 0)
        : buildPeer("chat", chatId);
      await sendMessage(client, peer, body.message.trim());
      return NextResponse.json({ ok: true, via: "user_client" });
    } catch (err) {
      console.error("[conversation] MTProto send failed, falling back to bot:", err);
    }
  }

  // Fallback: use bot token
  const { data: botToken } = await admin
    .from("user_tokens")
    .select("token_encrypted")
    .eq("provider", "telegram_bot")
    .single();

  if (!botToken) {
    return NextResponse.json({ error: "No Telegram bot configured. Connect one in Settings > Integrations." }, { status: 400 });
  }

  try {
    const { decryptToken } = await import("@/lib/crypto");
    const token = decryptToken(botToken.token_encrypted);
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: body.message.trim() }),
    });
    const data = await res.json();
    if (!data.ok) {
      return NextResponse.json({ error: data.description || "Bot send failed" }, { status: 500 });
    }
    return NextResponse.json({ ok: true, via: "bot" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Send failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
