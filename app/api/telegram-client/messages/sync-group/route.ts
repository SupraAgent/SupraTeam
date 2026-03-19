/**
 * POST /api/telegram-client/messages/sync-group
 * Sync messages from a CRM-linked Telegram group to the database
 * Only group messages are stored (DMs are NEVER stored)
 *
 * Body: { tgGroupId: string, limit?: number }
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { getConnectedClient, getMessages, buildPeer } from "@/lib/telegram-client";
import { Api } from "telegram";

export async function POST(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user, admin } = auth;

  let body: { tgGroupId?: string; limit?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!body.tgGroupId) {
    return NextResponse.json({ error: "tgGroupId required" }, { status: 400 });
  }

  // Verify this is a CRM-linked group
  const { data: group } = await admin
    .from("tg_groups")
    .select("id, telegram_group_id, group_type")
    .eq("id", body.tgGroupId)
    .single();

  if (!group) {
    return NextResponse.json({ error: "Group not found in CRM" }, { status: 404 });
  }

  // Get user session
  const { data: session } = await admin
    .from("tg_client_sessions")
    .select("session_encrypted")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .single();

  if (!session) {
    return NextResponse.json({ error: "Telegram not connected" }, { status: 400 });
  }

  try {
    const client = await getConnectedClient(user.id, session.session_encrypted);
    const limit = Math.min(body.limit || 100, 200);

    // Determine peer type from group_type
    const peerType =
      group.group_type === "supergroup" || group.group_type === "channel"
        ? "channel"
        : "chat";

    const peer = buildPeer(peerType, BigInt(group.telegram_group_id));
    const result = await getMessages(client, peer, limit);

    let synced = 0;

    if ("messages" in result && "users" in result) {
      const usersMap = new Map<string, Api.User>();
      for (const u of (result as Api.messages.Messages).users) {
        if (u instanceof Api.User) {
          usersMap.set(String(u.id), u);
        }
      }

      const rows: Array<Record<string, unknown>> = [];

      for (const m of (result as Api.messages.Messages).messages) {
        if (!(m instanceof Api.Message)) continue;

        let senderName: string | undefined;
        let senderTelegramId: number | undefined;

        if (m.fromId instanceof Api.PeerUser) {
          senderTelegramId = Number(m.fromId.userId);
          const sender = usersMap.get(String(m.fromId.userId));
          if (sender) {
            senderName = [sender.firstName, sender.lastName].filter(Boolean).join(" ");
          }
        }

        const messageType = m.media
          ? m.media instanceof Api.MessageMediaPhoto
            ? "photo"
            : m.media instanceof Api.MessageMediaDocument
              ? "document"
              : "other"
          : "text";

        rows.push({
          tg_group_id: group.id,
          telegram_message_id: m.id,
          telegram_chat_id: Number(group.telegram_group_id),
          sender_telegram_id: senderTelegramId || null,
          sender_name: senderName || null,
          message_text: m.message || null,
          message_type: messageType,
          reply_to_message_id:
            m.replyTo instanceof Api.MessageReplyHeader
              ? m.replyTo.replyToMsgId
              : null,
          sent_at: new Date(m.date * 1000).toISOString(),
        });
      }

      // Batch upsert
      if (rows.length > 0) {
        for (let i = 0; i < rows.length; i += 50) {
          const batch = rows.slice(i, i + 50);
          const { error } = await admin
            .from("tg_group_messages")
            .upsert(batch, {
              onConflict: "telegram_chat_id,telegram_message_id",
            });
          if (error) {
            console.error("[tg-client/sync-group] upsert error:", error);
          } else {
            synced += batch.length;
          }
        }
      }
    }

    return NextResponse.json({ ok: true, synced });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Sync failed";
    console.error("[tg-client/sync-group]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
