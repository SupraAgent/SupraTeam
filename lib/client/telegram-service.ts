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

    const msgs = result as Api.messages.Messages | Api.messages.MessagesSlice | Api.messages.ChannelMessages;
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
        replyToId: m.replyTo instanceof Api.MessageReplyHeader
          ? m.replyTo.replyToMsgId
          : undefined,
        mediaType,
      });
    }

    return out;
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
    const randomId = bigInt(
      Array.from(crypto.getRandomValues(new Uint8Array(8)))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join(""),
      16
    );

    await this.client!.invoke(
      new Api.messages.SendMessage({ peer, message, randomId })
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

  // ── Helpers ───────────────────────────────────────────────

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
