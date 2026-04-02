/**
 * GET /api/telegram-client/conversations
 * List user's Telegram dialogs (conversations) -- fetched LIVE, never stored
 *
 * Query params:
 *   limit: number (default 50, max 100)
 *   type: 'all' | 'private' | 'group' | 'channel' (default 'all')
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { getConnectedClient, getDialogs } from "@/lib/telegram-client";
import { Api } from "telegram";

type DialogItem = {
  id: string;
  type: "private" | "group" | "supergroup" | "channel";
  title: string;
  username?: string;
  unreadCount: number;
  lastMessage?: {
    text: string;
    date: number;
    senderName?: string;
  };
  telegramId: number;
  accessHash?: string;
  isCrmLinked: boolean;
};

export async function GET(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user, admin } = auth;

  const url = new URL(request.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "50", 10), 100);
  const typeFilter = url.searchParams.get("type") || "all";

  // Get user's session
  const { data: session } = await admin
    .from("tg_client_sessions")
    .select("session_encrypted")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .single();

  if (!session) {
    return NextResponse.json(
      { error: "Telegram not connected" },
      { status: 400 }
    );
  }

  try {
    const client = await getConnectedClient(user.id, session.session_encrypted);
    const result = await getDialogs(client, limit);

    // Get CRM-linked group IDs for marking
    const { data: crmGroups } = await admin
      .from("tg_groups")
      .select("telegram_group_id")
      .limit(1000);
    const crmGroupIds = new Set(
      (crmGroups || []).map((g) => String(g.telegram_group_id))
    );

    const dialogs: DialogItem[] = [];

    if ("dialogs" in result && "messages" in result && "users" in result && "chats" in result) {
      const fullResult = result as Api.messages.Dialogs | Api.messages.DialogsSlice;
      const usersMap = new Map<string, Api.User>();
      const chatsMap = new Map<string, Api.Chat | Api.Channel>();

      for (const u of fullResult.users) {
        if (u instanceof Api.User) {
          usersMap.set(String(u.id), u);
        }
      }
      for (const c of fullResult.chats) {
        if (c instanceof Api.Chat || c instanceof Api.Channel) {
          chatsMap.set(String(c.id), c);
        }
      }

      // Map messages by peer for last message lookup
      const messagesMap = new Map<string, Api.Message>();
      for (const m of fullResult.messages) {
        if (m instanceof Api.Message && m.peerId) {
          const peerId =
            m.peerId instanceof Api.PeerUser
              ? String(m.peerId.userId)
              : m.peerId instanceof Api.PeerChat
                ? String(m.peerId.chatId)
                : m.peerId instanceof Api.PeerChannel
                  ? String(m.peerId.channelId)
                  : null;
          if (peerId && !messagesMap.has(peerId)) {
            messagesMap.set(peerId, m);
          }
        }
      }

      for (const dialog of fullResult.dialogs) {
        if (!(dialog instanceof Api.Dialog)) continue;
        if (dialog.folderId === 1) continue; // skip archived

        const peer = dialog.peer;
        let item: DialogItem | null = null;

        if (peer instanceof Api.PeerUser) {
          const u = usersMap.get(String(peer.userId));
          if (!u || u.bot || u.deleted) continue;

          item = {
            id: `user_${peer.userId}`,
            type: "private",
            title: [u.firstName, u.lastName].filter(Boolean).join(" "),
            username: u.username || undefined,
            unreadCount: dialog.unreadCount,
            telegramId: Number(peer.userId),
            accessHash: u.accessHash ? String(u.accessHash) : undefined,
            isCrmLinked: false,
          };
        } else if (peer instanceof Api.PeerChat) {
          const c = chatsMap.get(String(peer.chatId));
          if (!c || !(c instanceof Api.Chat)) continue;

          item = {
            id: `chat_${peer.chatId}`,
            type: "group",
            title: c.title,
            unreadCount: dialog.unreadCount,
            telegramId: Number(peer.chatId),
            isCrmLinked: crmGroupIds.has(String(peer.chatId)),
          };
        } else if (peer instanceof Api.PeerChannel) {
          const ch = chatsMap.get(String(peer.channelId));
          if (!ch || !(ch instanceof Api.Channel)) continue;

          const isGroup = ch.megagroup || false;
          item = {
            id: `channel_${peer.channelId}`,
            type: isGroup ? "supergroup" : "channel",
            title: ch.title,
            username: ch.username || undefined,
            unreadCount: dialog.unreadCount,
            telegramId: Number(peer.channelId),
            accessHash: ch.accessHash ? String(ch.accessHash) : undefined,
            isCrmLinked: crmGroupIds.has(String(peer.channelId)),
          };
        }

        if (!item) continue;

        // Apply type filter
        if (typeFilter !== "all") {
          if (typeFilter === "private" && item.type !== "private") continue;
          if (typeFilter === "group" && item.type !== "group" && item.type !== "supergroup") continue;
          if (typeFilter === "channel" && item.type !== "channel") continue;
        }

        // Attach last message
        const msg = messagesMap.get(String(item.telegramId));
        if (msg) {
          let senderName: string | undefined;
          if (msg.fromId instanceof Api.PeerUser) {
            const sender = usersMap.get(String(msg.fromId.userId));
            if (sender) senderName = sender.firstName || undefined;
          }
          item.lastMessage = {
            text: msg.message?.slice(0, 200) || "[media]",
            date: msg.date,
            senderName,
          };
        }

        dialogs.push(item);
      }
    }

    // Fire-and-forget: don't block the response for a non-critical timestamp update
    admin
      .from("tg_client_sessions")
      .update({ last_used_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .then(({ error }) => { if (error) console.error("[tg-client] last_used_at update failed:", error.message); });

    return NextResponse.json({ data: dialogs, source: "live" });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to fetch conversations";
    console.error("[tg-client/conversations]", message);

    if (message.includes("AUTH_KEY_UNREGISTERED") || message.includes("SESSION_REVOKED")) {
      await admin
        .from("tg_client_sessions")
        .update({ is_active: false })
        .eq("user_id", user.id);
      return NextResponse.json(
        { error: "Session expired. Please reconnect." },
        { status: 401 }
      );
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
