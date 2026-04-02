/**
 * GET /api/telegram-client/messages
 * Fetch messages from a specific Telegram conversation (LIVE, never stored for DMs)
 *
 * Query params:
 *   type: 'user' | 'chat' | 'channel'
 *   id: telegram ID
 *   accessHash: access hash (required for user/channel)
 *   limit: number (default 50, max 100)
 *   offsetId: number (for pagination)
 *
 * POST /api/telegram-client/messages
 * Send a message in a Telegram conversation
 *
 * Body: { type, id, accessHash?, message }
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import {
  getConnectedClient,
  getMessages,
  sendMessage,
  buildPeer,
} from "@/lib/telegram-client";
import { Api } from "telegram";

const VALID_PEER_TYPES = new Set<string>(["user", "chat", "channel"]);

function parsePeerParams(params: URLSearchParams) {
  const type = params.get("type");
  const idStr = params.get("id");
  const accessHashStr = params.get("accessHash");

  if (!type || !idStr || !VALID_PEER_TYPES.has(type)) return null;
  try {
    const id = BigInt(idStr);
    const accessHash = accessHashStr ? BigInt(accessHashStr) : BigInt(0);
    return { type: type as "user" | "chat" | "channel", id, accessHash };
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user, admin } = auth;

  const url = new URL(request.url);
  const peerInfo = parsePeerParams(url.searchParams);
  if (!peerInfo) {
    return NextResponse.json(
      { error: "type and id query params required" },
      { status: 400 }
    );
  }

  const limit = Math.min(
    parseInt(url.searchParams.get("limit") || "50", 10),
    100
  );
  const offsetId = parseInt(url.searchParams.get("offsetId") || "0", 10);

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
    const peer = buildPeer(peerInfo.type, peerInfo.id, peerInfo.accessHash);
    const result = await getMessages(client, peer, limit, offsetId);

    const messages: Array<{
      id: number;
      text: string;
      date: number;
      senderId?: number;
      senderName?: string;
      replyToId?: number;
      mediaType?: string;
    }> = [];

    if ("messages" in result && "users" in result) {
      const usersMap = new Map<string, Api.User>();
      for (const u of (result as Api.messages.Messages).users) {
        if (u instanceof Api.User) {
          usersMap.set(String(u.id), u);
        }
      }

      for (const m of (result as Api.messages.Messages).messages) {
        if (!(m instanceof Api.Message)) continue;

        let senderName: string | undefined;
        let senderId: number | undefined;

        if (m.fromId instanceof Api.PeerUser) {
          senderId = Number(m.fromId.userId);
          const sender = usersMap.get(String(m.fromId.userId));
          if (sender) {
            senderName = [sender.firstName, sender.lastName].filter(Boolean).join(" ");
          }
        }

        messages.push({
          id: m.id,
          text: m.message || "",
          date: m.date,
          senderId,
          senderName,
          replyToId:
            m.replyTo instanceof Api.MessageReplyHeader
              ? m.replyTo.replyToMsgId
              : undefined,
          mediaType: m.media
            ? m.media instanceof Api.MessageMediaPhoto
              ? "photo"
              : m.media instanceof Api.MessageMediaDocument
                ? "document"
                : "other"
            : undefined,
        });
      }
    }

    return NextResponse.json({ data: messages, source: "live" });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to fetch messages";
    console.error("[tg-client/messages] GET error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user, admin } = auth;

  let body: { type?: string; id?: string; accessHash?: string; message?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!body.type || !body.id || !body.message?.trim()) {
    return NextResponse.json(
      { error: "type, id, and message are required" },
      { status: 400 }
    );
  }
  if (!VALID_PEER_TYPES.has(body.type)) {
    return NextResponse.json(
      { error: "type must be user, chat, or channel" },
      { status: 400 }
    );
  }

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
    let peerId: bigint;
    let peerAccessHash: bigint;
    try {
      peerId = BigInt(body.id);
      peerAccessHash = body.accessHash ? BigInt(body.accessHash) : BigInt(0);
    } catch {
      return NextResponse.json({ error: "Invalid id or accessHash" }, { status: 400 });
    }

    const client = await getConnectedClient(user.id, session.session_encrypted);
    const peer = buildPeer(
      body.type as "user" | "chat" | "channel",
      peerId,
      peerAccessHash
    );

    await sendMessage(client, peer, body.message.trim());

    // Audit log
    await admin.from("tg_client_audit_log").insert({
      user_id: user.id,
      action: "send_message",
      target_type: body.type,
      target_id: body.id,
      metadata: { messageLength: body.message.trim().length },
    });

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to send message";
    console.error("[tg-client/messages] POST error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
