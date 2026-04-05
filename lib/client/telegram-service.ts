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

export interface TgMessageReaction {
  emoji: string;
  count: number;
}

export interface TgMessage {
  id: number;
  text: string;
  date: number;
  senderId?: number;
  senderName?: string;
  replyToId?: number;
  mediaType?: string;
  /** "voice" | "audio" | "video_note" — sub-type for document media */
  mediaSubType?: string;
  /** Duration in seconds for voice/audio/video_note */
  mediaDuration?: number;
  editDate?: number;
  reactions?: TgMessageReaction[];
  /** Whether this message is pinned */
  isPinned?: boolean;
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

export interface TgAdminGroup {
  telegramId: number;
  accessHash?: string;
  title: string;
  type: "group" | "supergroup";
  memberCount: number;
  isCreator: boolean;
  username?: string;
}

export interface TgGroupParticipant {
  telegramUserId: number;
  accessHash?: string;
  firstName: string;
  lastName?: string;
  username?: string;
  role: "creator" | "admin" | "member" | "banned" | "restricted";
}

export interface TgSearchResult {
  messageIds: number[];
  hasMore: boolean;
  nextOffsetId: number;
}

export interface TgCommonChat {
  id: number;
  type: "group" | "supergroup" | "channel";
  title: string;
  accessHash?: string;
}

export interface TgUserProfile {
  id: number;
  firstName: string;
  lastName?: string;
  username?: string;
  phoneLast4?: string;
  bio?: string;
  status: string;
  lastSeen: number;
  photoUrl: string | null;
  isBot: boolean;
  isVerified: boolean;
  commonChatsCount: number;
}

export interface TgChatProfile {
  id: number;
  title: string;
  username?: string;
  about?: string;
  membersCount: number;
  photoUrl: string | null;
  isChannel: boolean;
  isMegagroup: boolean;
}

// ── Singleton Service ─────────────────────────────────────────

export class TelegramBrowserService {
  private static instance: TelegramBrowserService | null = null;
  private client: TelegramClient | null = null;
  private _connected = false;
  private _selfId: number | null = null;
  private _lastApiCall = 0;
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
    // Use raw invoke instead of client.sendCode() — the wrapper goes through
    // an auth helper that relies on dynamic TL constructors which break
    // under Turbopack bundling ("u.default.type is not a function").
    const result = await this.client!.invoke(
      new Api.auth.SendCode({
        phoneNumber: phone,
        apiId: API_ID,
        apiHash: API_HASH,
        settings: new Api.CodeSettings({}),
      })
    );
    if (result instanceof Api.auth.SentCodeSuccess) {
      throw new Error("Logged in immediately — no code needed");
    }
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

  /**
   * Step 2b: Sign in with 2FA password.
   *
   * Uses raw invoke for SRP auth: GetPassword → computeCheck → CheckPassword.
   *
   * GramJS's computeCheck returns Buffer instances for the SRP proof, but
   * Turbopack may provide different Buffer polyfills to different modules,
   * causing `serializeBytes` to fail with "Bytes or str expected, not Buffer"
   * (instanceof check across different Buffer references). We convert Buffer
   * fields to Uint8Array before invoking to avoid this cross-realm issue.
   */
  async signIn2FA(password: string): Promise<Api.User> {
    this.requireClient();

    // 1. Get SRP parameters
    const passwordInfo = await this.client!.invoke(
      new Api.account.GetPassword()
    );

    // 2. Compute SRP proof
    const { computeCheck } = await import("telegram/Password");
    const srpResult = await computeCheck(passwordInfo, password);

    // 3. Fix cross-realm Buffer polyfill issue.
    //    Turbopack may give Password.js and generationHelpers.js different
    //    Buffer polyfills. serializeBytes does `instanceof Buffer` which fails
    //    when the Buffer was created by a different polyfill. Re-wrapping with
    //    the global Buffer.from() ensures the instanceof check passes.
    if (srpResult.A) {
      srpResult.A = Buffer.from(srpResult.A);
    }
    if (srpResult.M1) {
      srpResult.M1 = Buffer.from(srpResult.M1);
    }

    // 4. Submit SRP proof
    const result = await this.client!.invoke(
      new Api.auth.CheckPassword({ password: srpResult })
    );

    if (result instanceof Api.auth.Authorization) {
      return result.user as Api.User;
    }
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

  // ── Group Admin Actions ───────────────────────────────────

  /** Ban a user from a channel/supergroup. */
  async banUser(
    channelId: number,
    accessHash: string | undefined,
    userId: number,
    userAccessHash: string | undefined
  ): Promise<void> {
    this.requireClient();
    const channel = new Api.InputChannel({ channelId: bigInt(channelId), accessHash: bigInt(accessHash || "0") });
    const participant = new Api.InputPeerUser({ userId: bigInt(userId), accessHash: bigInt(userAccessHash || "0") });
    await this.client!.invoke(
      new Api.channels.EditBanned({
        channel,
        participant,
        bannedRights: new Api.ChatBannedRights({
          untilDate: 0, // permanent
          viewMessages: true,
          sendMessages: true,
          sendMedia: true,
          sendStickers: true,
          sendGifs: true,
          sendGames: true,
          sendInline: true,
          embedLinks: true,
        }),
      })
    );
  }

  /** Unban / unrestrict a user. */
  async unbanUser(
    channelId: number,
    accessHash: string | undefined,
    userId: number,
    userAccessHash: string | undefined
  ): Promise<void> {
    this.requireClient();
    const channel = new Api.InputChannel({ channelId: bigInt(channelId), accessHash: bigInt(accessHash || "0") });
    const participant = new Api.InputPeerUser({ userId: bigInt(userId), accessHash: bigInt(userAccessHash || "0") });
    await this.client!.invoke(
      new Api.channels.EditBanned({
        channel,
        participant,
        bannedRights: new Api.ChatBannedRights({ untilDate: 0 }),
      })
    );
  }

  /** Restrict a user (mute — can view but not send). */
  async restrictUser(
    channelId: number,
    accessHash: string | undefined,
    userId: number,
    userAccessHash: string | undefined,
    untilDate = 0
  ): Promise<void> {
    this.requireClient();
    const channel = new Api.InputChannel({ channelId: bigInt(channelId), accessHash: bigInt(accessHash || "0") });
    const participant = new Api.InputPeerUser({ userId: bigInt(userId), accessHash: bigInt(userAccessHash || "0") });
    await this.client!.invoke(
      new Api.channels.EditBanned({
        channel,
        participant,
        bannedRights: new Api.ChatBannedRights({
          untilDate,
          sendMessages: true,
          sendMedia: true,
          sendStickers: true,
          sendGifs: true,
          sendGames: true,
          sendInline: true,
          embedLinks: true,
        }),
      })
    );
  }

  /** Promote a user to admin in a channel/supergroup. Rights must be explicitly specified. */
  async promoteUser(
    channelId: number,
    accessHash: string | undefined,
    userId: number,
    userAccessHash: string | undefined,
    rights: {
      deleteMessages?: boolean;
      banUsers?: boolean;
      pinMessages?: boolean;
      inviteUsers?: boolean;
      changeInfo?: boolean;
    }
  ): Promise<void> {
    this.requireClient();
    const channel = new Api.InputChannel({ channelId: bigInt(channelId), accessHash: bigInt(accessHash || "0") });
    const user = new Api.InputUser({ userId: bigInt(userId), accessHash: bigInt(userAccessHash || "0") });
    await this.client!.invoke(
      new Api.channels.EditAdmin({
        channel,
        userId: user,
        adminRights: new Api.ChatAdminRights({
          deleteMessages: rights.deleteMessages ?? false,
          banUsers: rights.banUsers ?? false,
          pinMessages: rights.pinMessages ?? false,
          inviteUsers: rights.inviteUsers ?? false,
          changeInfo: rights.changeInfo ?? false,
        }),
        rank: "",
      })
    );
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

  // ── Self / Identity ───────────────────────────────────────

  /** Get the logged-in user's Telegram ID (cached after first call). */
  async getSelfId(): Promise<number> {
    if (this._selfId) return this._selfId;
    this.requireClient();
    const result = await this.client!.invoke(
      new Api.users.GetUsers({ id: [new Api.InputUserSelf()] })
    );
    const user = result[0];
    if (!(user instanceof Api.User)) throw new Error("Failed to get self user");
    this._selfId = Number(user.id);
    return this._selfId;
  }

  // ── Admin Groups ─────────────────────────────────────────

  /** Get all groups/supergroups where the current user is admin or creator. */
  async getAdminGroups(): Promise<TgAdminGroup[]> {
    this.requireClient();
    const allDialogs = await this.getDialogs(200);
    const adminGroups: TgAdminGroup[] = [];

    // getDialogs only returns basic info — we need to check admin rights
    // by iterating entities the client has cached
    for (const d of allDialogs) {
      if (d.type !== "group" && d.type !== "supergroup") continue;

      for (let attempt = 0; attempt < 2; attempt++) {
      try {
        if (d.type === "supergroup" && d.accessHash) {
          await this.rateLimit();
          const full = await this.client!.invoke(
            new Api.channels.GetParticipant({
              channel: new Api.InputChannel({
                channelId: bigInt(d.telegramId),
                accessHash: bigInt(d.accessHash),
              }),
              participant: new Api.InputPeerSelf(),
            })
          );
          const participant = full.participant;
          const isAdmin =
            participant instanceof Api.ChannelParticipantAdmin ||
            participant instanceof Api.ChannelParticipantCreator;
          if (!isAdmin) continue;

          // Fetch member count
          let memberCount = 0;
          try {
            await this.rateLimit();
            const channelFull = await this.client!.invoke(
              new Api.channels.GetFullChannel({
                channel: new Api.InputChannel({
                  channelId: bigInt(d.telegramId),
                  accessHash: bigInt(d.accessHash),
                }),
              })
            );
            if (channelFull.fullChat instanceof Api.ChannelFull) {
              memberCount = channelFull.fullChat.participantsCount ?? 0;
            }
          } catch {
            // Fallback to 0 if we can't fetch
          }

          adminGroups.push({
            telegramId: d.telegramId,
            accessHash: d.accessHash,
            title: d.title,
            type: "supergroup",
            memberCount,
            isCreator: participant instanceof Api.ChannelParticipantCreator,
            username: d.username,
          });
        } else if (d.type === "group") {
          // For legacy groups, fetch full chat to check admin status
          await this.rateLimit();
          const full = await this.client!.invoke(
            new Api.messages.GetFullChat({ chatId: bigInt(d.telegramId) })
          );
          const selfId = await this.getSelfId();
          const chatFull = full.fullChat;
          if (chatFull instanceof Api.ChatFull && chatFull.participants instanceof Api.ChatParticipants) {
            const me = chatFull.participants.participants.find((p) => {
              if (p instanceof Api.ChatParticipantAdmin) return Number(p.userId) === selfId;
              if (p instanceof Api.ChatParticipantCreator) return Number(p.userId) === selfId;
              return false;
            });
            if (!me) continue;

            adminGroups.push({
              telegramId: d.telegramId,
              title: d.title,
              type: "group",
              memberCount: chatFull.participants.participants.length,
              isCreator: me instanceof Api.ChatParticipantCreator,
            });
          }
        }
        break; // success — exit retry loop
      } catch (err) {
        const msg = err instanceof Error ? err.message : "";
        const floodMatch = msg.match(/FLOOD_WAIT_(\d+)/i);
        if (floodMatch && attempt === 0) {
          const wait = parseInt(floodMatch[1], 10);
          await new Promise((r) => setTimeout(r, wait * 1000));
          continue; // retry this group once after flood wait
        }
        break; // skip on non-flood errors or second attempt
      }
      }
    }

    return adminGroups;
  }

  // ── Group Participants ───────────────────────────────────

  /** Fetch participants of a group or supergroup. */
  async getGroupParticipants(
    groupType: "group" | "supergroup",
    groupId: number,
    accessHash?: string,
    limit = 200,
    offset = 0
  ): Promise<TgGroupParticipant[]> {
    this.requireClient();
    await this.rateLimit();

    if (groupType === "supergroup") {
      const result = await this.client!.invoke(
        new Api.channels.GetParticipants({
          channel: new Api.InputChannel({
            channelId: bigInt(groupId),
            accessHash: bigInt(accessHash || "0"),
          }),
          filter: new Api.ChannelParticipantsSearch({ q: "" }),
          offset,
          limit,
          hash: bigInt(0),
        })
      );

      if (!(result instanceof Api.channels.ChannelParticipants)) return [];

      const users = new Map<string, Api.User>();
      for (const u of result.users) {
        if (u instanceof Api.User) users.set(u.id.toString(), u);
      }

      return result.participants.flatMap((p) => {
        let odId: number;
        let role: TgGroupParticipant["role"] = "member";

        if (p instanceof Api.ChannelParticipantCreator) {
          odId = Number(p.userId);
          role = "creator";
        } else if (p instanceof Api.ChannelParticipantAdmin) {
          odId = Number(p.userId);
          role = "admin";
        } else if (p instanceof Api.ChannelParticipantBanned) {
          // peer can be PeerUser, PeerChannel, or PeerChat — only process users
          if (!(p.peer instanceof Api.PeerUser)) return [];
          odId = Number(p.peer.userId);
          role = "banned";
        } else if (p instanceof Api.ChannelParticipantSelf) {
          odId = Number(p.userId);
          role = "member";
        } else if (p instanceof Api.ChannelParticipantLeft) {
          // Left participants have .peer (Peer union), not .userId
          if (!(p.peer instanceof Api.PeerUser)) return [];
          odId = Number(p.peer.userId);
          role = "member";
        } else {
          odId = Number((p as Api.ChannelParticipant).userId);
          role = "member";
        }

        const u = users.get(odId.toString());
        return [{
          telegramUserId: odId,
          accessHash: u?.accessHash?.toString(),
          firstName: u?.firstName ?? "",
          lastName: u?.lastName ?? undefined,
          username: u?.username ?? undefined,
          role,
        }];
      });
    }

    // Legacy group — get full chat
    const full = await this.client!.invoke(
      new Api.messages.GetFullChat({ chatId: bigInt(groupId) })
    );

    const users = new Map<string, Api.User>();
    for (const u of full.users) {
      if (u instanceof Api.User) users.set(u.id.toString(), u);
    }

    const chatFull = full.fullChat;
    if (!(chatFull instanceof Api.ChatFull) || !(chatFull.participants instanceof Api.ChatParticipants)) {
      return [];
    }

    return chatFull.participants.participants.map((p) => {
      const userId = Number(p.userId);
      const u = users.get(p.userId.toString());
      let role: TgGroupParticipant["role"] = "member";
      if (p instanceof Api.ChatParticipantCreator) role = "creator";
      else if (p instanceof Api.ChatParticipantAdmin) role = "admin";

      return {
        telegramUserId: userId,
        accessHash: u?.accessHash?.toString(),
        firstName: u?.firstName ?? "",
        lastName: u?.lastName ?? undefined,
        username: u?.username ?? undefined,
        role,
      };
    });
  }

  // ── Group Member Management ──────────────────────────────

  /** Kick a user from a group (soft kick: ban then immediately unban). */
  async kickGroupMember(
    groupType: "group" | "supergroup",
    groupId: number,
    groupAccessHash: string | undefined,
    userId: number,
    userAccessHash: string | undefined
  ): Promise<void> {
    this.requireClient();
    await this.rateLimit();

    if (groupType === "supergroup") {
      // Ban with full restrictions
      await this.client!.invoke(
        new Api.channels.EditBanned({
          channel: new Api.InputChannel({
            channelId: bigInt(groupId),
            accessHash: bigInt(groupAccessHash || "0"),
          }),
          participant: new Api.InputPeerUser({
            userId: bigInt(userId),
            accessHash: bigInt(userAccessHash || "0"),
          }),
          bannedRights: new Api.ChatBannedRights({
            untilDate: 0,
            viewMessages: true,
            sendMessages: true,
            sendMedia: true,
            sendStickers: true,
            sendGifs: true,
            sendGames: true,
            sendInline: true,
            embedLinks: true,
          }),
        })
      );
      // Immediately unban (soft kick — user can rejoin via invite)
      // Retry unban up to 3 times — failure leaves user permanently banned
      let unbanSuccess = false;
      for (let attempt = 0; attempt < 3 && !unbanSuccess; attempt++) {
        try {
          await this.rateLimit();
          await this.client!.invoke(
            new Api.channels.EditBanned({
              channel: new Api.InputChannel({
                channelId: bigInt(groupId),
                accessHash: bigInt(groupAccessHash || "0"),
              }),
              participant: new Api.InputPeerUser({
                userId: bigInt(userId),
                accessHash: bigInt(userAccessHash || "0"),
              }),
              bannedRights: new Api.ChatBannedRights({
                untilDate: 0,
              }),
            })
          );
          unbanSuccess = true;
        } catch (unbanErr) {
          if (attempt === 2) {
            console.error(`[kickGroupMember] CRITICAL: Unban failed after 3 attempts for user ${userId} in group ${groupId}. User is permanently banned.`, unbanErr);
          }
          // Wait before retry
          await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        }
      }
    } else {
      // Legacy group
      await this.client!.invoke(
        new Api.messages.DeleteChatUser({
          chatId: bigInt(groupId),
          userId: new Api.InputUser({
            userId: bigInt(userId),
            accessHash: bigInt(userAccessHash || "0"),
          }),
        })
      );
    }
  }

  /** Add a user to a group. */
  async addGroupMember(
    groupType: "group" | "supergroup",
    groupId: number,
    groupAccessHash: string | undefined,
    userId: number,
    userAccessHash: string | undefined
  ): Promise<void> {
    this.requireClient();
    await this.rateLimit();

    if (groupType === "supergroup") {
      await this.client!.invoke(
        new Api.channels.InviteToChannel({
          channel: new Api.InputChannel({
            channelId: bigInt(groupId),
            accessHash: bigInt(groupAccessHash || "0"),
          }),
          users: [
            new Api.InputUser({
              userId: bigInt(userId),
              accessHash: bigInt(userAccessHash || "0"),
            }),
          ],
        })
      );
    } else {
      await this.client!.invoke(
        new Api.messages.AddChatUser({
          chatId: bigInt(groupId),
          userId: new Api.InputUser({
            userId: bigInt(userId),
            accessHash: bigInt(userAccessHash || "0"),
          }),
          fwdLimit: 0,
        })
      );
    }
  }

  // ── Message Search & Delete ──────────────────────────────

  /** Search for own messages in a specific chat. Returns up to 100 IDs per call. */
  async searchMyMessages(
    peerType: "user" | "chat" | "channel",
    peerId: number,
    accessHash?: string,
    offsetId = 0
  ): Promise<TgSearchResult> {
    this.requireClient();
    await this.rateLimit();
    const peer = this.buildPeer(peerType, peerId, accessHash);

    const result = await this.client!.invoke(
      new Api.messages.Search({
        peer,
        q: "",
        fromId: new Api.InputPeerSelf(),
        filter: new Api.InputMessagesFilterEmpty(),
        minDate: 0,
        maxDate: 0,
        offsetId,
        addOffset: 0,
        limit: 100,
        maxId: 0,
        minId: 0,
        hash: bigInt(0),
      })
    );

    if (result instanceof Api.messages.MessagesNotModified) {
      return { messageIds: [], hasMore: false, nextOffsetId: 0 };
    }

    const msgs = result as Api.messages.Messages | Api.messages.MessagesSlice | Api.messages.ChannelMessages;
    const ids = msgs.messages
      .filter((m): m is Api.Message => m instanceof Api.Message)
      .map((m) => m.id);

    const hasMore = ids.length === 100;
    const nextOffsetId = ids.length > 0 ? ids[ids.length - 1] : 0;

    return { messageIds: ids, hasMore, nextOffsetId };
  }

  /** Delete messages for nuke. Max 100 IDs per call. Returns count of deleted messages. */
  async nukeDeleteMessages(
    peerType: "user" | "chat" | "channel",
    peerId: number,
    accessHash: string | undefined,
    messageIds: number[]
  ): Promise<number> {
    this.requireClient();
    if (messageIds.length === 0) return 0;
    await this.rateLimit();

    if (peerType === "channel") {
      const result = await this.client!.invoke(
        new Api.channels.DeleteMessages({
          channel: new Api.InputChannel({
            channelId: bigInt(peerId),
            accessHash: bigInt(accessHash || "0"),
          }),
          id: messageIds,
        })
      );
      return result.ptsCount ?? 0;
    }

    const result = await this.client!.invoke(
      new Api.messages.DeleteMessages({
        id: messageIds,
        revoke: true,
      })
    );
    return result.ptsCount ?? 0;
  }

  // ── Common Chats ─────────────────────────────────────────

  /** Get groups in common with a specific user. */
  async getCommonChats(
    userId: number,
    userAccessHash: string | undefined
  ): Promise<TgCommonChat[]> {
    this.requireClient();
    await this.rateLimit();

    const result = await this.client!.invoke(
      new Api.messages.GetCommonChats({
        userId: new Api.InputUser({
          userId: bigInt(userId),
          accessHash: bigInt(userAccessHash || "0"),
        }),
        maxId: bigInt(0),
        limit: 100,
      })
    );

    const chats = result as Api.messages.Chats | Api.messages.ChatsSlice;
    return chats.chats
      .filter((c): c is Api.Chat | Api.Channel => c instanceof Api.Chat || c instanceof Api.Channel)
      .map((c) => {
        if (c instanceof Api.Channel) {
          return {
            id: Number(c.id),
            type: (c.megagroup ? "supergroup" : "channel") as TgCommonChat["type"],
            title: c.title,
            accessHash: c.accessHash?.toString(),
          };
        }
        return {
          id: Number(c.id),
          type: "group" as const,
          title: c.title,
        };
      });
  }

  // ── User Resolution ──────────────────────────────────────

  /** Resolve a user ID to access hash. Tries entity cache first, then API. */
  async resolveUser(userId: number): Promise<{ accessHash: string; firstName: string }> {
    this.requireClient();
    await this.rateLimit();

    const result = await this.client!.invoke(
      new Api.users.GetUsers({
        id: [new Api.InputUser({ userId: bigInt(userId), accessHash: bigInt(0) })],
      })
    );

    const user = result[0];
    if (!(user instanceof Api.User) || !user.accessHash) {
      throw new Error("Could not resolve user");
    }

    return {
      accessHash: user.accessHash.toString(),
      firstName: user.firstName ?? "",
    };
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

  // ── Pinning ──────────────────────────────────────────────

  /** Pin a message in a chat. */
  async pinMessage(
    peerType: "user" | "chat" | "channel",
    id: number,
    accessHash: string | undefined,
    msgId: number,
    silent = false
  ): Promise<void> {
    this.requireClient();
    const peer = this.buildPeer(peerType, id, accessHash);
    await this.client!.invoke(
      new Api.messages.UpdatePinnedMessage({ peer, id: msgId, silent })
    );
  }

  /** Unpin a message. */
  async unpinMessage(
    peerType: "user" | "chat" | "channel",
    id: number,
    accessHash: string | undefined,
    msgId: number
  ): Promise<void> {
    this.requireClient();
    const peer = this.buildPeer(peerType, id, accessHash);
    await this.client!.invoke(
      new Api.messages.UpdatePinnedMessage({ peer, id: msgId, unpin: true })
    );
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
    if (file.size > 50 * 1024 * 1024) {
      throw new Error("File exceeds 50 MB limit");
    }
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
  ): Promise<{ messages: TgMessage[]; hasMore: boolean; totalCount: number }> {
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

    if (result instanceof Api.messages.MessagesNotModified) return { messages: [], hasMore: false, totalCount: 0 };

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

    return { messages: parsed, hasMore, totalCount };
  }

  /** Get messages centered around a specific message ID (for jump-to). */
  async getMessagesAround(
    peerType: "user" | "chat" | "channel",
    id: number,
    accessHash: string | undefined,
    aroundId: number,
    limit = 50
  ): Promise<{ messages: TgMessage[]; hasMore: boolean; totalCount: number }> {
    this.requireClient();
    const peer = this.buildPeer(peerType, id, accessHash);
    const halfLimit = Math.floor(limit / 2);

    const result = await this.client!.invoke(
      new Api.messages.GetHistory({
        peer,
        offsetId: aroundId,
        offsetDate: 0,
        addOffset: -halfLimit,
        limit,
        maxId: 0,
        minId: 0,
        hash: bigInt(0),
      })
    );

    if (result instanceof Api.messages.MessagesNotModified) return { messages: [], hasMore: false, totalCount: 0 };

    const msgs = result as Api.messages.Messages | Api.messages.MessagesSlice | Api.messages.ChannelMessages;
    const parsed = this.parseMessagesFromResult(msgs);

    for (const u of msgs.users) {
      if (u instanceof Api.User && !u.deleted) {
        this.userCache.set(u.id.toString(), {
          firstName: u.firstName ?? "",
          lastName: u.lastName ?? undefined,
        });
      }
    }

    const totalCount = "count" in msgs ? (msgs as Api.messages.MessagesSlice).count : parsed.length;
    return { messages: parsed, hasMore: parsed.length === limit, totalCount };
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

  /** Create or update a Telegram folder. */
  async updateDialogFilter(params: {
    id: number;
    title: string;
    peers: Array<{ type: "user" | "chat" | "channel"; id: number; accessHash?: string }>;
  }): Promise<boolean> {
    this.requireClient();

    const includePeers = params.peers.map((p) => this.buildPeer(p.type, p.id, p.accessHash));

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

  // ── User/Chat Profiles ───────────────────────────────────

  /** Get full user profile (bio, photo, status, last seen). */
  async getUserProfile(userId: number, accessHash?: string): Promise<TgUserProfile> {
    this.requireClient();
    const inputUser = new Api.InputUser({
      userId: bigInt(userId),
      accessHash: bigInt(accessHash || "0"),
    });

    const result = await this.client!.invoke(
      new Api.users.GetFullUser({ id: inputUser })
    );

    const fullUser = result.fullUser;
    const user = result.users.find(
      (u): u is Api.User => u instanceof Api.User && Number(u.id) === userId
    );

    // Extract status
    let status = "offline";
    let lastSeen = 0;
    if (user?.status) {
      if (user.status instanceof Api.UserStatusOnline) {
        status = "online";
      } else if (user.status instanceof Api.UserStatusRecently) {
        status = "recently";
      } else if (user.status instanceof Api.UserStatusOffline) {
        status = "offline";
        lastSeen = user.status.wasOnline;
      } else if (user.status instanceof Api.UserStatusLastWeek) {
        status = "within_week";
      } else if (user.status instanceof Api.UserStatusLastMonth) {
        status = "within_month";
      }
    }

    // Download profile photo if available
    let photoUrl: string | null = null;
    if (user?.photo && user.photo instanceof Api.UserProfilePhoto) {
      try {
        const photoBuffer = await this.client!.downloadProfilePhoto(user);
        if (photoBuffer && typeof photoBuffer !== "string") {
          const buf = photoBuffer as Buffer;
          const copy = new ArrayBuffer(buf.byteLength);
          new Uint8Array(copy).set(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength));
          photoUrl = URL.createObjectURL(new Blob([copy], { type: "image/jpeg" }));
        }
      } catch {
        // Profile photo download failed — non-critical
      }
    }

    return {
      id: userId,
      firstName: user?.firstName ?? "",
      lastName: user?.lastName ?? undefined,
      username: user?.username ?? undefined,
      phoneLast4: user?.phone ? user.phone.slice(-4) : undefined,
      bio: fullUser.about ?? undefined,
      status,
      lastSeen,
      photoUrl,
      isBot: user?.bot ?? false,
      isVerified: user?.verified ?? false,
      commonChatsCount: fullUser.commonChatsCount ?? 0,
    };
  }

  /** Get full chat/channel profile. */
  async getChatProfile(
    peerType: "chat" | "channel",
    id: number,
    accessHash?: string
  ): Promise<TgChatProfile> {
    this.requireClient();

    if (peerType === "chat") {
      const result = await this.client!.invoke(
        new Api.messages.GetFullChat({ chatId: bigInt(id) })
      );
      const chat = result.chats.find(
        (c): c is Api.Chat => c instanceof Api.Chat && Number(c.id) === id
      );
      const fullChat = result.fullChat as Api.ChatFull;

      let photoUrl: string | null = null;
      if (chat?.photo && chat.photo instanceof Api.ChatPhoto) {
        try {
          const photoBuffer = await this.client!.downloadProfilePhoto(chat);
          if (photoBuffer && typeof photoBuffer !== "string") {
            const buf = photoBuffer as Buffer;
            const copy = new ArrayBuffer(buf.byteLength);
            new Uint8Array(copy).set(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength));
            photoUrl = URL.createObjectURL(new Blob([copy], { type: "image/jpeg" }));
          }
        } catch {
          // Photo download failed
        }
      }

      return {
        id,
        title: chat?.title ?? "",
        about: fullChat.about ?? undefined,
        membersCount: chat?.participantsCount ?? 0,
        photoUrl,
        isChannel: false,
        isMegagroup: false,
      };
    }

    // Channel / supergroup
    const channel = new Api.InputChannel({
      channelId: bigInt(id),
      accessHash: bigInt(accessHash || "0"),
    });
    const result = await this.client!.invoke(
      new Api.channels.GetFullChannel({ channel })
    );
    const ch = result.chats.find(
      (c): c is Api.Channel => c instanceof Api.Channel && Number(c.id) === id
    );
    const fullChannel = result.fullChat as Api.ChannelFull;

    let photoUrl: string | null = null;
    if (ch?.photo && ch.photo instanceof Api.ChatPhoto) {
      try {
        const photoBuffer = await this.client!.downloadProfilePhoto(ch);
        if (photoBuffer && typeof photoBuffer !== "string") {
          const buf = photoBuffer as Buffer;
          const copy = new ArrayBuffer(buf.byteLength);
          new Uint8Array(copy).set(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength));
          photoUrl = URL.createObjectURL(new Blob([copy], { type: "image/jpeg" }));
        }
      } catch {
        // Photo download failed
      }
    }

    return {
      id,
      title: ch?.title ?? "",
      username: ch?.username ?? undefined,
      about: fullChannel.about ?? undefined,
      membersCount: fullChannel.participantsCount ?? 0,
      photoUrl,
      isChannel: !ch?.megagroup,
      isMegagroup: ch?.megagroup ?? false,
    };
  }

  // ── Helpers ───────────────────────────────────────────────

  /** Rate limiter: 40ms minimum between API calls (~25/s). */
  private async rateLimit(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this._lastApiCall;
    if (elapsed < 40) {
      await new Promise((resolve) => setTimeout(resolve, 40 - elapsed));
    }
    this._lastApiCall = Date.now();
  }

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
      let mediaSubType: string | undefined;
      let mediaDuration: number | undefined;
      if (m.media) {
        if (m.media instanceof Api.MessageMediaPhoto) {
          mediaType = "photo";
        } else if (m.media instanceof Api.MessageMediaDocument) {
          mediaType = "document";
          const doc = m.media.document;
          if (doc instanceof Api.Document) {
            for (const attr of doc.attributes) {
              if (attr instanceof Api.DocumentAttributeAudio) {
                mediaSubType = attr.voice ? "voice" : "audio";
                mediaDuration = attr.duration;
              } else if (attr instanceof Api.DocumentAttributeVideo) {
                if (attr.roundMessage) mediaSubType = "video_note";
                mediaDuration = attr.duration;
              }
            }
          }
        } else {
          mediaType = "other";
        }
      }

      // Parse reactions
      let reactions: TgMessageReaction[] | undefined;
      if (m.reactions?.results) {
        reactions = m.reactions.results
          .map((r) => {
            const emoji = r.reaction instanceof Api.ReactionEmoji ? r.reaction.emoticon : null;
            return emoji ? { emoji, count: r.count } : null;
          })
          .filter((r): r is TgMessageReaction => r !== null);
        if (reactions.length === 0) reactions = undefined;
      }

      out.push({
        id: m.id,
        text: m.message || "",
        date: m.date,
        senderId,
        senderName,
        replyToId: m.replyTo instanceof Api.MessageReplyHeader ? m.replyTo.replyToMsgId : undefined,
        mediaType,
        mediaSubType,
        mediaDuration,
        editDate: m.editDate ?? undefined,
        reactions,
        isPinned: m.pinned ?? undefined,
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
      default:
        throw new Error(`Invalid peer type: ${type}`);
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
