/**
 * Browser-side GramJS Telegram service (zero-knowledge).
 *
 * Runs MTProto entirely in the browser over WebSocket.
 * The server never sees any Telegram data — all API calls happen client-side.
 *
 * Usage:
 *   const service = TelegramBrowserService.getInstance();
 *   await service.connect(sessionString);
 *   const dialogs = await service.getDialogs();
 */

"use client";

import { TelegramClient, Api } from "telegram";
import { StringSession } from "telegram/sessions/StringSession";
import bigInt from "big-integer";

const API_ID = parseInt(process.env.NEXT_PUBLIC_TELEGRAM_API_ID || "0", 10);
const API_HASH = process.env.NEXT_PUBLIC_TELEGRAM_API_HASH || "";

// ── Event Types ──────────────────────────────────────────────

export interface TgNewMessageEvent {
  chatId: number;
  message: TgMessage;
}

export interface TgMessageEditEvent {
  chatId: number;
  messageId: number;
  newText: string;
  editDate: number;
}

export interface TgMessageDeleteEvent {
  chatId: number;
  messageIds: number[];
}

export interface TgTypingEvent {
  chatId: number;
  userId: number;
  userName?: string;
  action: "typing" | "cancel";
}

export interface TgReadEvent {
  chatId: number;
  maxId: number;
  outgoing: boolean;
}

type TgEventHandler = {
  onNewMessage?: (event: TgNewMessageEvent) => void;
  onMessageEdit?: (event: TgMessageEditEvent) => void;
  onMessageDelete?: (event: TgMessageDeleteEvent) => void;
  onTyping?: (event: TgTypingEvent) => void;
  onRead?: (event: TgReadEvent) => void;
};

type TgEventUnsubscribe = () => void;

if (typeof window !== "undefined" && (!API_ID || !API_HASH)) {
  console.error(
    "[TelegramBrowserService] NEXT_PUBLIC_TELEGRAM_API_ID or NEXT_PUBLIC_TELEGRAM_API_HASH missing. " +
    "Restart the dev server after adding them to .env.local."
  );
}

// ── Types ─────────────────────────────────────────────────────

export interface TgDialog {
  id: string;
  type: "private" | "group" | "supergroup" | "channel";
  title: string;
  username?: string;
  unreadCount: number;
  telegramId: number;
  accessHash?: string;
  lastMessage?: {
    text: string;
    date: number;
    senderName?: string;
  };
}

export interface TgMessage {
  id: number;
  text: string;
  date: number;
  senderId?: number;
  senderName?: string;
  replyToId?: number;
  mediaType?: string;
  editDate?: number;
}

export interface TgFolder {
  id: number;
  title: string;
  includePeerIds: number[];
  isChatlist: boolean;
}

export interface TgContact {
  telegramUserId: number;
  firstName: string;
  lastName?: string;
  username?: string;
  /** Last 4 digits only — full phone number is never exposed from this interface. */
  phoneLast4?: string;
  isMutual: boolean;
}

// ── Singleton Service ─────────────────────────────────────────

export class TelegramBrowserService {
  private static instance: TelegramBrowserService | null = null;
  private client: TelegramClient | null = null;
  private _connected = false;
  private eventHandlers = new Set<TgEventHandler>();
  private eventHandlerRegistered = false;
  private userCache = new Map<string, { firstName: string; lastName?: string }>();

  static getInstance(): TelegramBrowserService {
    if (!TelegramBrowserService.instance) {
      TelegramBrowserService.instance = new TelegramBrowserService();
    }
    return TelegramBrowserService.instance;
  }

  get connected(): boolean {
    return this._connected && !!this.client?.connected;
  }

  // ── Connection ────────────────────────────────────────────

  /** Connect with an existing session string (from decrypted blob). */
  async connect(sessionString: string = ""): Promise<void> {
    if (!API_ID || !API_HASH) {
      throw new Error(
        "Telegram API credentials not configured. Restart the dev server after setting " +
        "NEXT_PUBLIC_TELEGRAM_API_ID and NEXT_PUBLIC_TELEGRAM_API_HASH in .env.local."
      );
    }

    if (this.client?.connected) {
      await this.client.disconnect();
    }

    const session = new StringSession(sessionString);
    this.client = new TelegramClient(session, API_ID, API_HASH, {
      connectionRetries: 3,
      useWSS: true,
    });

    await this.client.connect();
    this._connected = true;
  }

  /** Get the current session string for encryption + storage. */
  getSessionString(): string {
    if (!this.client) return "";
    return (this.client.session as StringSession).save();
  }

  /** Disconnect and clean up. */
  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.disconnect().catch(() => {});
      this.client = null;
    }
    this._connected = false;
    this.eventHandlerRegistered = false;
    this.eventHandlers.clear();
    this.userCache.clear();
  }

  // ── Auth: Phone Login ─────────────────────────────────────

  /** Step 1: Send verification code to phone number. */
  async sendCode(phone: string): Promise<{ phoneCodeHash: string }> {
    await this.ensureClient();
    const result = await this.client!.sendCode(
      { apiId: API_ID, apiHash: API_HASH },
      phone
    );
    return { phoneCodeHash: result.phoneCodeHash };
  }

  /** Step 2: Sign in with the verification code. */
  async signIn(
    phone: string,
    code: string,
    phoneCodeHash: string
  ): Promise<Api.User> {
    this.requireClient();
    const result = await this.client!.invoke(
      new Api.auth.SignIn({
        phoneNumber: phone,
        phoneCodeHash,
        phoneCode: code,
      })
    );

    if (result instanceof Api.auth.AuthorizationSignUpRequired) {
      throw new Error("Account does not exist. Please sign up in Telegram first.");
    }

    const auth = result as Api.auth.Authorization;
    return auth.user as Api.User;
  }

  /** Step 2b: Sign in with 2FA password. */
  async signIn2FA(password: string): Promise<Api.User> {
    this.requireClient();
    const result = await this.client!.signInWithPassword(
      { apiId: API_ID, apiHash: API_HASH },
      {
        password: () => Promise.resolve(password),
        onError: async () => true,
      }
    );
    if (result instanceof Api.User) return result;
    const auth = result as { user?: Api.User };
    if (auth.user instanceof Api.User) return auth.user;
    throw new Error("Unexpected 2FA sign-in response");
  }

  // ── Auth: QR Login ────────────────────────────────────────

  /** Generate QR login token. Returns URL for QR code and listens for scan. */
  async requestQRLogin(): Promise<{
    qrUrl: string;
    expiresAt: number;
    waitForScan: () => Promise<Api.User>;
  }> {
    this.requireClient();

    const result = await this.client!.invoke(
      new Api.auth.ExportLoginToken({
        apiId: API_ID,
        apiHash: API_HASH,
        exceptIds: [],
      })
    );

    if (!(result instanceof Api.auth.LoginToken)) {
      throw new Error("Unexpected QR login response");
    }

    const tokenB64 = btoa(String.fromCharCode(...result.token));
    const qrUrl = `tg://login?token=${tokenB64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}`;

    const waitForScan = (): Promise<Api.User> => {
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error("QR login timed out"));
        }, 120_000);

        this.client!.addEventHandler((update: Api.TypeUpdate) => {
          if (update instanceof Api.UpdateLoginToken) {
            clearTimeout(timeout);
            // Re-export to get the authorized result
            this.client!
              .invoke(
                new Api.auth.ExportLoginToken({
                  apiId: API_ID,
                  apiHash: API_HASH,
                  exceptIds: [],
                })
              )
              .then((res) => {
                if (res instanceof Api.auth.LoginTokenSuccess) {
                  const auth = res.authorization;
                  if (auth instanceof Api.auth.Authorization) {
                    resolve(auth.user as Api.User);
                  }
                }
                // If we get LoginTokenMigrateTo, handle DC migration
                if (res instanceof Api.auth.LoginTokenMigrateTo) {
                  reject(new Error("DC migration required — please use phone login"));
                }
              })
              .catch(reject);
          }
        });
      });
    };

    return { qrUrl, expiresAt: result.expires, waitForScan };
  }

  // ── Dialogs (Conversations) ───────────────────────────────

  async getDialogs(limit = 50): Promise<TgDialog[]> {
    this.requireClient();

    const result = await this.client!.invoke(
      new Api.messages.GetDialogs({
        offsetDate: 0,
        offsetId: 0,
        offsetPeer: new Api.InputPeerEmpty(),
        limit,
        hash: bigInt(0),
        folderId: 0,
      })
    );

    if (result instanceof Api.messages.DialogsNotModified) return [];

    const dialogs = result as Api.messages.Dialogs | Api.messages.DialogsSlice;
    const users = new Map<string, Api.User>();
    const chats = new Map<string, Api.Chat | Api.Channel>();

    for (const u of dialogs.users) {
      if (u instanceof Api.User) {
        users.set(u.id.toString(), u);
        // Cache for event handler name resolution
        if (!u.deleted) {
          this.userCache.set(u.id.toString(), { firstName: u.firstName ?? "", lastName: u.lastName ?? undefined });
        }
      }
    }
    for (const c of dialogs.chats) {
      if (c instanceof Api.Chat || c instanceof Api.Channel) {
        chats.set(c.id.toString(), c);
      }
    }

    // Build message map for last messages
    const msgMap = new Map<number, Api.Message>();
    for (const m of dialogs.messages) {
      if (m instanceof Api.Message) msgMap.set(m.id, m);
    }

    const out: TgDialog[] = [];

    for (const d of dialogs.dialogs) {
      if (!(d instanceof Api.Dialog)) continue;
      const peer = d.peer;
      let type: TgDialog["type"] = "private";
      let title = "";
      let username: string | undefined;
      let telegramId = 0;
      let accessHash: string | undefined;

      if (peer instanceof Api.PeerUser) {
        const u = users.get(peer.userId.toString());
        if (!u || u.deleted) continue;
        type = "private";
        title = [u.firstName, u.lastName].filter(Boolean).join(" ") || "Unknown";
        username = u.username ?? undefined;
        telegramId = Number(u.id);
        accessHash = u.accessHash?.toString();
      } else if (peer instanceof Api.PeerChat) {
        const c = chats.get(peer.chatId.toString());
        if (!c) continue;
        type = "group";
        title = c.title;
        telegramId = Number(c.id);
      } else if (peer instanceof Api.PeerChannel) {
        const c = chats.get(peer.channelId.toString());
        if (!c || !(c instanceof Api.Channel)) continue;
        type = c.megagroup ? "supergroup" : "channel";
        title = c.title;
        username = c.username ?? undefined;
        telegramId = Number(c.id);
        accessHash = c.accessHash?.toString();
      }

      // Last message
      let lastMessage: TgDialog["lastMessage"];
      const msg = msgMap.get(d.topMessage);
      if (msg) {
        let senderName: string | undefined;
        if (msg.fromId instanceof Api.PeerUser) {
          const sender = users.get(msg.fromId.userId.toString());
          if (sender) senderName = sender.firstName ?? undefined;
        }
        lastMessage = {
          text: msg.message || "",
          date: msg.date,
          senderName,
        };
      }

      out.push({
        id: `${type}_${telegramId}`,
        type,
        title,
        username,
        unreadCount: d.unreadCount,
        telegramId,
        accessHash,
        lastMessage,
      });
    }

    return out;
  }

  // ── Messages ──────────────────────────────────────────────

  async getMessages(
    peerType: "user" | "chat" | "channel",
    id: number,
    accessHash?: string,
    limit = 50
  ): Promise<TgMessage[]> {
    this.requireClient();
    const peer = this.buildPeer(peerType, id, accessHash);

    const result = await this.client!.invoke(
      new Api.messages.GetHistory({
        peer,
        offsetId: 0,
        offsetDate: 0,
        addOffset: 0,
        limit,
        maxId: 0,
        minId: 0,
        hash: bigInt(0),
      })
    );

    if (result instanceof Api.messages.MessagesNotModified) return [];
    return this.parseMessagesFromResult(result as Api.messages.Messages | Api.messages.MessagesSlice | Api.messages.ChannelMessages);
  }

  /** Send a text message. */
  async sendMessage(
    peerType: "user" | "chat" | "channel",
    id: number,
    accessHash: string | undefined,
    message: string
  ): Promise<void> {
    this.requireClient();
    const peer = this.buildPeer(peerType, id, accessHash);
    await this.client!.invoke(
      new Api.messages.SendMessage({ peer, message, randomId: this.generateRandomId() })
    );
  }

  /** Send a text message replying to a specific message. */
  async sendReply(
    peerType: "user" | "chat" | "channel",
    id: number,
    accessHash: string | undefined,
    message: string,
    replyToMsgId: number
  ): Promise<void> {
    this.requireClient();
    const peer = this.buildPeer(peerType, id, accessHash);
    await this.client!.invoke(
      new Api.messages.SendMessage({
        peer,
        message,
        randomId: this.generateRandomId(),
        replyTo: new Api.InputReplyToMessage({ replyToMsgId }),
      })
    );
  }

  /** Forward messages to another peer. */
  async forwardMessages(
    fromPeerType: "user" | "chat" | "channel",
    fromId: number,
    fromAccessHash: string | undefined,
    toPeerType: "user" | "chat" | "channel",
    toId: number,
    toAccessHash: string | undefined,
    messageIds: number[]
  ): Promise<void> {
    this.requireClient();
    const fromPeer = this.buildPeer(fromPeerType, fromId, fromAccessHash);
    const toPeer = this.buildPeer(toPeerType, toId, toAccessHash);

    const randomIds = messageIds.map(() => this.generateRandomId());

    await this.client!.invoke(
      new Api.messages.ForwardMessages({
        fromPeer,
        id: messageIds,
        randomId: randomIds,
        toPeer,
      })
    );
  }

  /** Search messages within a peer. */
  async searchMessages(
    peerType: "user" | "chat" | "channel",
    id: number,
    accessHash: string | undefined,
    query: string,
    limit = 30
  ): Promise<TgMessage[]> {
    this.requireClient();
    const peer = this.buildPeer(peerType, id, accessHash);

    const result = await this.client!.invoke(
      new Api.messages.Search({
        peer,
        q: query,
        filter: new Api.InputMessagesFilterEmpty(),
        minDate: 0,
        maxDate: 0,
        offsetId: 0,
        addOffset: 0,
        limit,
        maxId: 0,
        minId: 0,
        hash: bigInt(0),
      })
    );

    if (result instanceof Api.messages.MessagesNotModified) return [];
    return this.parseMessagesFromResult(result as Api.messages.Messages | Api.messages.MessagesSlice | Api.messages.ChannelMessages);
  }

  /** Send a reaction emoji to a message. */
  async sendReaction(
    peerType: "user" | "chat" | "channel",
    id: number,
    accessHash: string | undefined,
    msgId: number,
    emoji: string
  ): Promise<void> {
    this.requireClient();
    const peer = this.buildPeer(peerType, id, accessHash);
    await this.client!.invoke(
      new Api.messages.SendReaction({
        peer,
        msgId,
        reaction: [new Api.ReactionEmoji({ emoticon: emoji })],
      })
    );
  }

  /** Mark messages as read in a peer. */
  async markAsRead(
    peerType: "user" | "chat" | "channel",
    id: number,
    accessHash: string | undefined,
    maxId: number
  ): Promise<void> {
    this.requireClient();
    if (peerType === "channel") {
      const peer = this.buildPeer(peerType, id, accessHash) as Api.InputPeerChannel;
      await this.client!.invoke(
        new Api.channels.ReadHistory({ channel: new Api.InputChannel({ channelId: peer.channelId, accessHash: peer.accessHash }), maxId })
      );
    } else {
      const peer = this.buildPeer(peerType, id, accessHash);
      await this.client!.invoke(
        new Api.messages.ReadHistory({ peer, maxId })
      );
    }
  }

  /** Get participants of a chat/channel (first N). */
  async getChatMembers(
    peerType: "chat" | "channel",
    id: number,
    accessHash: string | undefined,
    limit = 50
  ): Promise<{ userId: number; firstName: string; lastName?: string; username?: string }[]> {
    this.requireClient();

    if (peerType === "chat") {
      const result = await this.client!.invoke(
        new Api.messages.GetFullChat({ chatId: bigInt(id) })
      );
      const users = new Map<string, Api.User>();
      for (const u of result.users) {
        if (u instanceof Api.User) users.set(u.id.toString(), u);
      }
      const chat = result.fullChat;
      if (chat instanceof Api.ChatFull && chat.participants instanceof Api.ChatParticipants) {
        return chat.participants.participants
          .map((p) => {
            const uid = "userId" in p ? Number(p.userId) : 0;
            const u = users.get(uid.toString());
            return u ? {
              userId: Number(u.id),
              firstName: u.firstName ?? "",
              lastName: u.lastName ?? undefined,
              username: u.username ?? undefined,
            } : null;
          })
          .filter((x): x is NonNullable<typeof x> => x !== null);
      }
      return [];
    }

    // Channel/supergroup
    const channel = new Api.InputChannel({ channelId: bigInt(id), accessHash: bigInt(accessHash || "0") });
    const result = await this.client!.invoke(
      new Api.channels.GetParticipants({
        channel,
        filter: new Api.ChannelParticipantsRecent(),
        offset: 0,
        limit,
        hash: bigInt(0),
      })
    );

    if (result instanceof Api.channels.ChannelParticipantsNotModified) return [];
    const participants = result as Api.channels.ChannelParticipants;

    return participants.users
      .filter((u): u is Api.User => u instanceof Api.User && !u.deleted)
      .map((u) => ({
        userId: Number(u.id),
        firstName: u.firstName ?? "",
        lastName: u.lastName ?? undefined,
        username: u.username ?? undefined,
      }));
  }

  // ── Contacts ──────────────────────────────────────────────

  async getContacts(): Promise<TgContact[]> {
    this.requireClient();
    const result = await this.client!.invoke(
      new Api.contacts.GetContacts({ hash: bigInt(0) })
    );

    if (result instanceof Api.contacts.ContactsNotModified) return [];
    const contacts = result as Api.contacts.Contacts;

    return contacts.users
      .filter((u): u is Api.User => u instanceof Api.User && !u.deleted)
      .map((u) => {
        const phone = u.phone ?? undefined;
        return {
          telegramUserId: Number(u.id),
          firstName: u.firstName ?? "",
          lastName: u.lastName ?? undefined,
          username: u.username ?? undefined,
          // Full phone number intentionally omitted — only last 4 digits exposed
          phoneLast4: phone ? phone.slice(-4) : undefined,
          isMutual: u.mutualContact ?? false,
        };
      });
  }

  // ── Real-time Events ──────────────────────────────────────

  /** Subscribe to real-time events. Returns unsubscribe function. */
  subscribe(handler: TgEventHandler): TgEventUnsubscribe {
    this.eventHandlers.add(handler);
    this.ensureEventHandlers();
    return () => { this.eventHandlers.delete(handler); };
  }

  private ensureEventHandlers(): void {
    if (this.eventHandlerRegistered || !this.client) return;
    this.eventHandlerRegistered = true;

    this.client.addEventHandler((update: Api.TypeUpdate) => {
      // New messages
      if (update instanceof Api.UpdateNewMessage || update instanceof Api.UpdateNewChannelMessage) {
        const msg = update.message;
        if (!(msg instanceof Api.Message)) return;

        const chatId = this.extractChatId(msg);
        if (!chatId) return;

        let senderId: number | undefined;
        let senderName: string | undefined;
        if (msg.fromId instanceof Api.PeerUser) {
          senderId = Number(msg.fromId.userId);
          senderName = this.userCache.get(msg.fromId.userId.toString())?.firstName;
        }

        let mediaType: string | undefined;
        if (msg.media) {
          if (msg.media instanceof Api.MessageMediaPhoto) mediaType = "photo";
          else if (msg.media instanceof Api.MessageMediaDocument) mediaType = "document";
          else mediaType = "other";
        }

        const tgMsg: TgMessage = {
          id: msg.id,
          text: msg.message || "",
          date: msg.date,
          senderId,
          senderName,
          replyToId: msg.replyTo instanceof Api.MessageReplyHeader ? msg.replyTo.replyToMsgId : undefined,
          mediaType,
        };
        for (const h of this.eventHandlers) h.onNewMessage?.({ chatId, message: tgMsg });
      }

      // Edited messages
      if (update instanceof Api.UpdateEditMessage || update instanceof Api.UpdateEditChannelMessage) {
        const msg = update.message;
        if (!(msg instanceof Api.Message)) return;
        const chatId = this.extractChatId(msg);
        if (!chatId) return;
        for (const h of this.eventHandlers) {
          h.onMessageEdit?.({ chatId, messageId: msg.id, newText: msg.message || "", editDate: msg.editDate ?? msg.date });
        }
      }

      // Deleted messages — non-channel deletes don't include chatId in Telegram's API,
      // so we can only safely handle channel deletes. Private/group deletes are ignored
      // to prevent cross-conversation message removal due to ID collisions.
      if (update instanceof Api.UpdateDeleteChannelMessages) {
        const chatId = Number(update.channelId);
        for (const h of this.eventHandlers) {
          h.onMessageDelete?.({ chatId, messageIds: update.messages });
        }
      }

      // Typing indicators
      if (update instanceof Api.UpdateUserTyping) {
        const userId = Number(update.userId);
        const cached = this.userCache.get(update.userId.toString());
        const action = update.action instanceof Api.SendMessageCancelAction ? "cancel" as const : "typing" as const;
        for (const h of this.eventHandlers) {
          h.onTyping?.({ chatId: userId, userId, userName: cached?.firstName, action });
        }
      }
      if (update instanceof Api.UpdateChatUserTyping) {
        const chatId = Number(update.chatId);
        const userId = update.fromId instanceof Api.PeerUser ? Number(update.fromId.userId) : 0;
        const cached = userId ? this.userCache.get(userId.toString()) : undefined;
        const action = update.action instanceof Api.SendMessageCancelAction ? "cancel" as const : "typing" as const;
        for (const h of this.eventHandlers) {
          h.onTyping?.({ chatId, userId, userName: cached?.firstName, action });
        }
      }
      if (update instanceof Api.UpdateChannelUserTyping) {
        const chatId = Number(update.channelId);
        const userId = update.fromId instanceof Api.PeerUser ? Number(update.fromId.userId) : 0;
        const cached = userId ? this.userCache.get(userId.toString()) : undefined;
        const action = update.action instanceof Api.SendMessageCancelAction ? "cancel" as const : "typing" as const;
        for (const h of this.eventHandlers) {
          h.onTyping?.({ chatId, userId, userName: cached?.firstName, action });
        }
      }

      // Read receipts — outgoing reads (other party read our message)
      if (update instanceof Api.UpdateReadHistoryOutbox) {
        const peer = update.peer;
        const chatId = peer instanceof Api.PeerUser ? Number(peer.userId) : peer instanceof Api.PeerChat ? Number(peer.chatId) : 0;
        for (const h of this.eventHandlers) h.onRead?.({ chatId, maxId: update.maxId, outgoing: true });
      }
      if (update instanceof Api.UpdateReadChannelOutbox) {
        for (const h of this.eventHandlers) h.onRead?.({ chatId: Number(update.channelId), maxId: update.maxId, outgoing: true });
      }
      // Incoming reads
      if (update instanceof Api.UpdateReadHistoryInbox) {
        const peer = update.peer;
        const chatId = peer instanceof Api.PeerUser ? Number(peer.userId) : peer instanceof Api.PeerChat ? Number(peer.chatId) : 0;
        for (const h of this.eventHandlers) h.onRead?.({ chatId, maxId: update.maxId, outgoing: false });
      }
      if (update instanceof Api.UpdateReadChannelInbox) {
        for (const h of this.eventHandlers) h.onRead?.({ chatId: Number(update.channelId), maxId: update.maxId, outgoing: false });
      }
    });
  }

  private extractChatId(msg: Api.Message): number | null {
    const peer = msg.peerId;
    if (peer instanceof Api.PeerUser) return Number(peer.userId);
    if (peer instanceof Api.PeerChat) return Number(peer.chatId);
    if (peer instanceof Api.PeerChannel) return Number(peer.channelId);
    return null;
  }

  // ── Edit / Delete ────────────────────────────────────────

  /** Edit a sent message's text. */
  async editMessage(
    peerType: "user" | "chat" | "channel",
    id: number,
    accessHash: string | undefined,
    msgId: number,
    newText: string
  ): Promise<void> {
    this.requireClient();
    const peer = this.buildPeer(peerType, id, accessHash);
    await this.client!.invoke(
      new Api.messages.EditMessage({ peer, id: msgId, message: newText })
    );
  }

  /** Delete messages. */
  async deleteMessages(
    peerType: "user" | "chat" | "channel",
    id: number,
    accessHash: string | undefined,
    msgIds: number[],
    revoke = true
  ): Promise<void> {
    this.requireClient();
    if (peerType === "channel") {
      const channel = new Api.InputChannel({
        channelId: bigInt(id),
        accessHash: bigInt(accessHash || "0"),
      });
      await this.client!.invoke(
        new Api.channels.DeleteMessages({ channel, id: msgIds })
      );
    } else {
      await this.client!.invoke(
        new Api.messages.DeleteMessages({ id: msgIds, revoke })
      );
    }
  }

  // ── Typing ───────────────────────────────────────────────

  /** Send typing indicator to a peer. */
  async sendTyping(
    peerType: "user" | "chat" | "channel",
    id: number,
    accessHash: string | undefined
  ): Promise<void> {
    this.requireClient();
    const peer = this.buildPeer(peerType, id, accessHash);
    await this.client!.invoke(
      new Api.messages.SetTyping({ peer, action: new Api.SendMessageTypingAction() })
    );
  }

  // ── Media Download ───────────────────────────────────────

  /** Download media from a message. Returns object URL. */
  async downloadMedia(
    peerType: "user" | "chat" | "channel",
    id: number,
    accessHash: string | undefined,
    msgId: number
  ): Promise<string | null> {
    this.requireClient();
    // Fetch the message to get its media — channels require channels.GetMessages
    let msg: Api.Message | undefined;
    if (peerType === "channel") {
      const channel = new Api.InputChannel({ channelId: bigInt(id), accessHash: bigInt(accessHash || "0") });
      const result = await this.client!.invoke(
        new Api.channels.GetMessages({ channel, id: [new Api.InputMessageID({ id: msgId })] })
      );
      const msgs = result as Api.messages.ChannelMessages;
      msg = msgs.messages.find((m): m is Api.Message => m instanceof Api.Message && m.id === msgId);
    } else {
      const result = await this.client!.invoke(
        new Api.messages.GetMessages({ id: [new Api.InputMessageID({ id: msgId })] })
      );
      const msgs = result as Api.messages.Messages;
      msg = msgs.messages.find((m): m is Api.Message => m instanceof Api.Message && m.id === msgId);
    }
    if (!msg?.media) return null;

    const buffer = await this.client!.downloadMedia(msg, {});
    if (!buffer) return null;

    // GramJS downloadMedia returns Buffer | string | undefined
    let blob: Blob;
    if (typeof buffer === "string") {
      blob = new Blob([buffer]);
    } else {
      // Buffer → copy to a fresh ArrayBuffer to satisfy strict TS (avoids SharedArrayBuffer union)
      const buf = buffer as Buffer;
      const copy = new ArrayBuffer(buf.byteLength);
      new Uint8Array(copy).set(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength));
      blob = new Blob([copy]);
    }
    return URL.createObjectURL(blob);
  }

  /** Upload and send a file/photo via GramJS sendFile. */
  async sendFileSimple(
    peerType: "user" | "chat" | "channel",
    id: number,
    accessHash: string | undefined,
    file: File,
    caption?: string
  ): Promise<void> {
    this.requireClient();
    const peer = this.buildPeer(peerType, id, accessHash);
    const buffer = Buffer.from(await file.arrayBuffer());

    await this.client!.sendFile(peer, {
      file: buffer,
      caption: caption || "",
      forceDocument: !file.type.startsWith("image/"),
    });
  }

  // ── Messages with pagination ─────────────────────────────

  /** Get messages with pagination support via offsetId. */
  async getMessagesPage(
    peerType: "user" | "chat" | "channel",
    id: number,
    accessHash: string | undefined,
    limit = 50,
    offsetId = 0
  ): Promise<{ messages: TgMessage[]; hasMore: boolean }> {
    this.requireClient();
    const peer = this.buildPeer(peerType, id, accessHash);

    const result = await this.client!.invoke(
      new Api.messages.GetHistory({
        peer,
        offsetId,
        offsetDate: 0,
        addOffset: 0,
        limit,
        maxId: 0,
        minId: 0,
        hash: bigInt(0),
      })
    );

    if (result instanceof Api.messages.MessagesNotModified) return { messages: [], hasMore: false };

    const msgs = result as Api.messages.Messages | Api.messages.MessagesSlice | Api.messages.ChannelMessages;
    const parsed = this.parseMessagesFromResult(msgs);

    // Cache users for event handler name resolution
    for (const u of msgs.users) {
      if (u instanceof Api.User && !u.deleted) {
        this.userCache.set(u.id.toString(), {
          firstName: u.firstName ?? "",
          lastName: u.lastName ?? undefined,
        });
      }
    }

    const totalCount = "count" in msgs ? (msgs as Api.messages.MessagesSlice).count : parsed.length;
    const hasMore = parsed.length === limit;

    return { messages: parsed, hasMore };
  }

  // ── Helpers ───────────────────────────────────────────────

  private generateRandomId(): bigInt.BigInteger {
    return bigInt(
      Array.from(crypto.getRandomValues(new Uint8Array(8)))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join(""),
      16
    );
  }

  private parseMessagesFromResult(
    msgs: { messages: Api.TypeMessage[]; users: Api.TypeUser[] }
  ): TgMessage[] {
    const users = new Map<string, Api.User>();
    for (const u of msgs.users) {
      if (u instanceof Api.User) users.set(u.id.toString(), u);
    }
    const out: TgMessage[] = [];
    for (const m of msgs.messages) {
      if (!(m instanceof Api.Message)) continue;
      let senderId: number | undefined;
      let senderName: string | undefined;
      if (m.fromId instanceof Api.PeerUser) {
        senderId = Number(m.fromId.userId);
        const u = users.get(m.fromId.userId.toString());
        if (u) senderName = [u.firstName, u.lastName].filter(Boolean).join(" ");
      }
      let mediaType: string | undefined;
      if (m.media) {
        if (m.media instanceof Api.MessageMediaPhoto) mediaType = "photo";
        else if (m.media instanceof Api.MessageMediaDocument) mediaType = "document";
        else mediaType = "other";
      }
      out.push({
        id: m.id,
        text: m.message || "",
        date: m.date,
        senderId,
        senderName,
        replyToId: m.replyTo instanceof Api.MessageReplyHeader ? m.replyTo.replyToMsgId : undefined,
        mediaType,
        editDate: m.editDate ?? undefined,
      });
    }
    return out;
  }

  private buildPeer(
    type: "user" | "chat" | "channel",
    id: number,
    accessHash?: string
  ): Api.TypeInputPeer {
    const idBig = bigInt(id);
    const hashBig = bigInt(accessHash || "0");

    switch (type) {
      case "user":
        return new Api.InputPeerUser({ userId: idBig, accessHash: hashBig });
      case "chat":
        return new Api.InputPeerChat({ chatId: idBig });
      case "channel":
        return new Api.InputPeerChannel({ channelId: idBig, accessHash: hashBig });
    }
  }

  /** Ensure a client exists (may not be connected yet). */
  private async ensureClient(): Promise<void> {
    if (!this.client) {
      const session = new StringSession("");
      this.client = new TelegramClient(session, API_ID, API_HASH, {
        connectionRetries: 3,
        useWSS: true,
      });
      await this.client.connect();
      this._connected = true;
    }
  }

  /** Require a connected client. */
  private requireClient(): void {
    if (!this.client?.connected) {
      throw new Error("Telegram client not connected");
    }
  }
}
