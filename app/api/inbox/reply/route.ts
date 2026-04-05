/**
 * POST /api/inbox/reply — Send a reply to a Telegram group from the inbox.
 * Body: { chat_id: number, message: string, reply_to_message_id?: number, send_as?: "bot" | "user" }
 *
 * Strategy: tries user's MTProto session first (send_as=user or default),
 * falls back to bot token. Same dual-path as /api/deals/[id]/conversation POST.
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

export async function POST(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user, admin } = auth;

  let body: { chat_id?: number; message?: string; reply_to_message_id?: number; send_as?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const chatId = Number(body.chat_id);
  if (!chatId || Number.isNaN(chatId)) {
    return NextResponse.json({ error: "Valid chat_id required" }, { status: 400 });
  }
  if (!body.message?.trim()) {
    return NextResponse.json({ error: "Message required" }, { status: 400 });
  }

  const trimmed = body.message.trim();
  const sendAs = body.send_as === "bot" ? "bot" : "user";

  // Validate chat_id belongs to a CRM-linked group
  const { data: group } = await admin
    .from("tg_groups")
    .select("id, telegram_group_id")
    .eq("telegram_group_id", String(chatId))
    .single();

  if (!group) {
    return NextResponse.json({ error: "Chat not linked to CRM" }, { status: 403 });
  }

  // Build Telegram API send payload
  const sendPayload: Record<string, unknown> = {
    chat_id: chatId,
    text: trimmed,
  };
  if (body.reply_to_message_id) {
    sendPayload.reply_parameters = { message_id: body.reply_to_message_id };
  }

  // Try user MTProto session first (unless explicitly send_as=bot)
  if (sendAs === "user") {
    const { data: session } = await admin
      .from("tg_client_sessions")
      .select("session_encrypted, encryption_method")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .single();

    if (session && session.encryption_method !== "client") {
      try {
        const { getConnectedClient, sendMessage, buildPeer } = await import("@/lib/telegram-client");
        const client = await getConnectedClient(user.id, session.session_encrypted);
        const peer = chatId < 0
          ? buildPeer("channel", Math.abs(chatId) - 1000000000000, 0)
          : buildPeer("chat", chatId);
        await sendMessage(client, peer, trimmed, body.reply_to_message_id);
        return NextResponse.json({ ok: true, via: "user_client" });
      } catch (err) {
        console.error("[inbox/reply] MTProto send failed, falling back to bot:", err);
      }
    }
  }

  // Fallback (or explicit): use bot token
  const { data: botToken } = await admin
    .from("user_tokens")
    .select("encrypted_token")
    .eq("provider", "telegram_bot")
    .single();

  if (!botToken) {
    return NextResponse.json(
      { error: "No Telegram bot configured. Connect one in Settings > Integrations." },
      { status: 400 }
    );
  }

  try {
    const { decryptToken } = await import("@/lib/crypto");
    const token = decryptToken(botToken.encrypted_token);
    let res: Response;
    try {
      res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sendPayload),
      });
    } catch {
      // Catch fetch errors to avoid leaking bot token from URL in error messages
      throw new Error("Telegram API request failed");
    }
    const data = await res.json();
    if (!data.ok) {
      return NextResponse.json({ error: data.description || "Bot send failed" }, { status: 500 });
    }
    return NextResponse.json({ ok: true, via: "bot", message_id: data.result?.message_id });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Send failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
