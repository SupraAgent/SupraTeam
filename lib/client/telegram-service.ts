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
      if (u instanceof Api.User) users.set(u.id.toString(), u);
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

  // ── Folders (Dialog Filters) ───────────────────────────────

  /** Get all user's Telegram folders. */
  async getDialogFilters(): Promise<TgFolder[]> {
    this.requireClient();

    const result = await this.client!.invoke(
      new Api.messages.GetDialogFilters()
    );

    const filters = (result as { filters?: Api.TypeDialogFilter[] }).filters ?? [];
    const out: TgFolder[] = [];

    for (const f of filters) {
      if (f instanceof Api.DialogFilter) {
        const title =
          (f.title as unknown as { text?: string })?.text ??
          (typeof f.title === "string" ? f.title : "");
        out.push({
          id: f.id,
          title,
          includePeerIds: (f.includePeers ?? []).map((p) => {
            if (p instanceof Api.InputPeerUser) return Number(p.userId);
            if (p instanceof Api.InputPeerChat) return Number(p.chatId);
            if (p instanceof Api.InputPeerChannel) return Number(p.channelId);
            return 0;
          }).filter(Boolean),
          isChatlist: false,
        });
      }
    }

    return out;
  }

  /**
   * Create or update a Telegram folder.
   * Pass peers from the browser's dialog cache (which has access hashes).
   */
  async updateDialogFilter(params: {
    id: number;
    title: string;
    peers: Array<{ type: "user" | "chat" | "channel"; id: number; accessHash?: string }>;
  }): Promise<boolean> {
    this.requireClient();

    const includePeers = params.peers.map((p) => this.buildPeer(p.type, p.id, p.accessHash));

    // Build title — GramJS layer ≥167 uses TextWithEntities, older uses string.
    // Use type assertion to handle both cases at runtime.
    let title: Api.TypeTextWithEntities | string = params.title;
    if (Api.TextWithEntities) {
      title = new Api.TextWithEntities({ text: params.title, entities: [] });
    }

    const result = await this.client!.invoke(
      new Api.messages.UpdateDialogFilter({
        id: params.id,
        filter: new Api.DialogFilter({
          id: params.id,
          title: title as Api.TypeTextWithEntities,
          includePeers,
          pinnedPeers: [],
          excludePeers: [],
          groups: true,
          broadcasts: true,
        }),
      })
    );

    return !!result;
  }

  /** Delete a Telegram folder by its filter ID. */
  async deleteDialogFilter(id: number): Promise<boolean> {
    this.requireClient();
    const result = await this.client!.invoke(
      new Api.messages.UpdateDialogFilter({ id })
    );
    return !!result;
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
