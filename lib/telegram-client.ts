/**
 * Telegram Client API (MTProto) via GramJS
 *
 * Each user gets their own authenticated session.
 * Sessions are encrypted at rest (AES-256-GCM) and isolated by RLS.
 * DMs are fetched live and never persisted. Group messages for CRM-linked groups are synced.
 */

import { TelegramClient, Api } from "telegram";
import { StringSession } from "telegram/sessions";
import { encryptToken, decryptToken } from "@/lib/crypto";
import { createHash, randomBytes } from "crypto";
import bigInt from "big-integer";

// Telegram API credentials (from my.telegram.org)
const API_ID = parseInt(process.env.TELEGRAM_API_ID || "0", 10);
const API_HASH = process.env.TELEGRAM_API_HASH || "";

if (!API_ID || !API_HASH) {
  console.warn("[tg-client] TELEGRAM_API_ID and TELEGRAM_API_HASH not set");
}

// In-memory client cache (keyed by user ID, auto-expires)
const clientCache = new Map<
  string,
  { client: TelegramClient; lastUsed: number }
>();
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

// Cleanup stale clients every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of clientCache) {
    if (now - entry.lastUsed > CACHE_TTL_MS) {
      entry.client.disconnect().catch(() => {});
      clientCache.delete(key);
    }
  }
}, 5 * 60 * 1000);

/** Hash a phone number for storage (never store plaintext) */
export function hashPhone(phone: string): string {
  return createHash("sha256").update(phone.trim()).digest("hex");
}

/** Extract last 4 digits of phone number */
export function phoneLast4(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.slice(-4);
}

/** Create a new TelegramClient for a user (not yet connected) */
export function createTgClient(sessionString: string = ""): TelegramClient {
  const session = new StringSession(sessionString);
  return new TelegramClient(session, API_ID, API_HASH, {
    connectionRetries: 3,
    useWSS: true,
  });
}

/** Get or create a connected client for a user from encrypted session */
export async function getConnectedClient(
  userId: string,
  encryptedSession: string
): Promise<TelegramClient> {
  const cached = clientCache.get(userId);
  if (cached) {
    cached.lastUsed = Date.now();
    if (cached.client.connected) {
      return cached.client;
    }
  }

  const sessionString = decryptToken(encryptedSession);
  const client = createTgClient(sessionString);
  await client.connect();

  clientCache.set(userId, { client, lastUsed: Date.now() });
  return client;
}

/** Save session string encrypted for a user */
export function encryptSession(client: TelegramClient): string {
  const sessionStr = (client.session as StringSession).save();
  return encryptToken(sessionStr);
}

/** Disconnect and remove cached client */
export async function disconnectClient(userId: string): Promise<void> {
  const cached = clientCache.get(userId);
  if (cached) {
    await cached.client.disconnect().catch(() => {});
    clientCache.delete(userId);
  }
}

/** Send phone code for login */
export async function sendPhoneCode(
  client: TelegramClient,
  phone: string
): Promise<{ phoneCodeHash: string }> {
  const result = await client.sendCode(
    { apiId: API_ID, apiHash: API_HASH },
    phone
  );
  return { phoneCodeHash: result.phoneCodeHash };
}

/** Sign in with phone code */
export async function signInWithCode(
  client: TelegramClient,
  phone: string,
  code: string,
  phoneCodeHash: string
): Promise<Api.User> {
  const result = await client.invoke(
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

/** Sign in with 2FA password */
export async function signInWith2FA(
  client: TelegramClient,
  password: string
): Promise<Api.User> {
  const result = await client.signInWithPassword(
    { apiId: API_ID, apiHash: API_HASH },
    {
      password: () => Promise.resolve(password),
      onError: async (err: Error) => {
        console.error("[tg-client] 2FA error:", err);
        return true; // stop retrying
      },
    }
  );
  if (result instanceof Api.User) return result;
  // signInWithPassword may return Auth wrapper or User directly
  const auth = result as { user?: Api.User };
  if (auth.user instanceof Api.User) return auth.user;
  throw new Error("Unexpected 2FA sign-in response");
}

/** Get user's Telegram contacts */
export async function getContacts(
  client: TelegramClient
): Promise<Api.contacts.Contacts | Api.contacts.ContactsNotModified> {
  return client.invoke(new Api.contacts.GetContacts({ hash: bigInt(0) }));
}

/** Get dialog list (conversations) */
export async function getDialogs(
  client: TelegramClient,
  limit: number = 50,
  offsetDate: number = 0
): Promise<Api.messages.TypeDialogs> {
  return client.invoke(
    new Api.messages.GetDialogs({
      offsetDate,
      offsetId: 0,
      offsetPeer: new Api.InputPeerEmpty(),
      limit,
      hash: bigInt(0),
      folderId: 0, // exclude archived chats (folder 1)
    })
  );
}

/** Get messages from a specific chat */
export async function getMessages(
  client: TelegramClient,
  peer: Api.TypeInputPeer,
  limit: number = 50,
  offsetId: number = 0
): Promise<Api.messages.TypeMessages> {
  return client.invoke(
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
}

/** Send a text message (optionally as a reply) */
export async function sendMessage(
  client: TelegramClient,
  peer: Api.TypeInputPeer,
  message: string,
  replyToMsgId?: number
): Promise<Api.TypeUpdates> {
  return client.invoke(
    new Api.messages.SendMessage({
      peer,
      message,
      randomId: bigInt(randomBytes(8).readBigInt64BE().toString().replace("-", "")),
      ...(replyToMsgId ? { replyTo: new Api.InputReplyToMessage({ replyToMsgId }) } : {}),
    })
  );
}

/** Build InputPeer from a Telegram user/chat ID */
export function buildPeer(
  type: "user" | "chat" | "channel",
  id: bigint | number | string,
  accessHash?: bigint | number | string
): Api.TypeInputPeer {
  const idBig = bigInt(String(id));
  const hashBig = bigInt(String(accessHash || 0));

  switch (type) {
    case "user":
      return new Api.InputPeerUser({ userId: idBig, accessHash: hashBig });
    case "chat":
      return new Api.InputPeerChat({ chatId: idBig });
    case "channel":
      return new Api.InputPeerChannel({
        channelId: idBig,
        accessHash: hashBig,
      });
    default:
      throw new Error(`Invalid peer type: ${type satisfies never}`);
  }
}

/** Export QR login URL */
export async function requestQRLogin(
  client: TelegramClient
): Promise<{ token: Buffer; expiresAt: number }> {
  const result = await client.invoke(
    new Api.auth.ExportLoginToken({
      apiId: API_ID,
      apiHash: API_HASH,
      exceptIds: [],
    })
  );

  if (result instanceof Api.auth.LoginToken) {
    return {
      token: Buffer.from(result.token),
      expiresAt: result.expires,
    };
  }

  throw new Error("Unexpected QR login response");
}

/** Build tg://login URL from QR token */
export function buildQRUrl(token: Buffer): string {
  return `tg://login?token=${token.toString("base64url")}`;
}
