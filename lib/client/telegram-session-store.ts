/**
 * Client-side session persistence.
 *
 * Handles the encrypted round-trip:
 *   Browser → encrypt(session) → POST /api/telegram-session → Supabase
 *   Supabase → GET /api/telegram-session → decrypt(blob) → Browser
 */

"use client";

import { encryptSession, decryptSession, deleteEncryptionKey } from "./telegram-crypto";

interface SessionResponse {
  connected: boolean;
  sessionEncrypted?: string;
  phoneLast4?: string;
  telegramUserId?: number;
  connectedAt?: string;
  needsReauth?: boolean;
  reason?: string;
}

/** Load and decrypt the session from server storage. */
export async function loadSession(): Promise<{
  sessionString: string | null;
  phoneLast4?: string;
  telegramUserId?: number;
  connectedAt?: string;
  needsReauth?: boolean;
}> {
  const res = await fetch("/api/telegram-session");
  const data: SessionResponse = await res.json();

  if (!data.connected || !data.sessionEncrypted) {
    return {
      sessionString: null,
      needsReauth: data.needsReauth,
    };
  }

  try {
    const sessionString = await decryptSession(data.sessionEncrypted);
    return {
      sessionString,
      phoneLast4: data.phoneLast4,
      telegramUserId: data.telegramUserId,
      connectedAt: data.connectedAt,
    };
  } catch {
    // Key mismatch (different device or cleared IndexedDB)
    return { sessionString: null, needsReauth: true };
  }
}

/** Encrypt and save the session to server storage. */
export async function saveSession(
  sessionString: string,
  phoneLast4: string | undefined,
  telegramUserId: number
): Promise<void> {
  const encrypted = await encryptSession(sessionString);

  const res = await fetch("/api/telegram-session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionEncrypted: encrypted,
      phoneLast4,
      telegramUserId,
    }),
  });

  if (!res.ok) {
    throw new Error("Failed to save encrypted session");
  }
}

/** Clear the session from server and delete local encryption key. */
export async function clearSession(): Promise<void> {
  await fetch("/api/telegram-session", { method: "DELETE" });
  await deleteEncryptionKey();
}
