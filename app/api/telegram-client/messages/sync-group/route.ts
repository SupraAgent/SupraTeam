/**
 * POST /api/telegram-client/messages/sync-group
 * Store group messages sent from the browser (zero-knowledge architecture).
 *
 * The browser fetches messages via GramJS client-side, then POSTs them here
 * for CRM storage. Only CRM-linked group messages are accepted.
 *
 * Body: { tgGroupId: string, messages: Array<{...}> }
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

interface SyncMessage {
  messageId: number;
  chatId: number;
  senderTelegramId?: number;
  senderName?: string;
  text?: string;
  messageType: string;
  replyToMessageId?: number;
  sentAt: string; // ISO string
}

export async function POST(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { admin } = auth;

  let body: { tgGroupId?: string; messages?: SyncMessage[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!body.tgGroupId || !body.messages?.length) {
    return NextResponse.json({ error: "tgGroupId and messages required" }, { status: 400 });
  }

  // Verify this is a CRM-linked group
  const { data: group } = await admin
    .from("tg_groups")
    .select("id, telegram_group_id")
    .eq("id", body.tgGroupId)
    .single();

  if (!group) {
    return NextResponse.json({ error: "Group not found in CRM" }, { status: 404 });
  }

  const rows = body.messages.map((m) => ({
    tg_group_id: group.id,
    telegram_message_id: m.messageId,
    telegram_chat_id: m.chatId || Number(group.telegram_group_id),
    sender_telegram_id: m.senderTelegramId || null,
    sender_name: m.senderName || null,
    message_text: m.text || null,
    message_type: m.messageType || "text",
    reply_to_message_id: m.replyToMessageId || null,
    sent_at: m.sentAt,
  }));

  let synced = 0;
  for (let i = 0; i < rows.length; i += 50) {
    const batch = rows.slice(i, i + 50);
    const { error } = await admin
      .from("tg_group_messages")
      .upsert(batch, { onConflict: "telegram_chat_id,telegram_message_id" });

    if (error) {
      console.error("[tg-client/sync-group] upsert error:", error);
    } else {
      synced += batch.length;
    }
  }

  return NextResponse.json({ ok: true, synced });
}
