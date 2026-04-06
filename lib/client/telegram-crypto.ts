/**
 * Zero-knowledge encryption for Telegram sessions.
 *
 * Generates a device-bound AES-256-GCM key stored via the keystore adapter:
 *   - Browser: IndexedDB (non-extractable CryptoKey)
 *   - Desktop: OS Keychain via Tauri (macOS Keychain, Windows Credential Manager)
 *
 * The server never sees this key — it only stores encrypted blobs it cannot decrypt.
 *
 * Flow:
 *   1. On first connect → generateEncryptionKey() → stored via keystore adapter
 *   2. After TG auth → encryptSession(sessionString) → base64 blob sent to server
 *   3. On page load → server returns blob → decryptSession(blob) → plaintext session
 *   4. On disconnect → deleteEncryptionKey() → key destroyed
 */

import { getKeyStore } from "../keystore";
import type { KeyHandle } from "../keystore";

const KEY_PREFIX = "tg-session-key";

/** Current user ID — must be set before any crypto operations. */
let currentUserId: string | null = null;

/** Set the user ID for scoping the encryption key. Must be called before encrypt/decrypt. */
export function setEncryptionUserId(userId: string): void {
  currentUserId = userId;
}

function keyId(): string {
  if (!currentUserId) throw new Error("Encryption user ID not set. Call setEncryptionUserId() first.");
  return `${KEY_PREFIX}-${currentUserId}`;
}

/**
 * AAD binds ciphertext to a specific user — prevents blob-swap attacks.
 *
 * TODO: Include telegramUserId in AAD (e.g. `tg-session:{userId}:{telegramUserId}`)
 * to prevent cross-TG-account blob swaps. Requires threading telegramUserId through
 * setEncryptionUserId/encryptSession/decryptSession and a migration path for
 * existing encrypted sessions (AAD change = decryption failure on old blobs).
 */
function aad(): Uint8Array {
  return new TextEncoder().encode(`tg-session:${currentUserId}`);
}

// ── Key Management ──────────────────────────────────────────────

/** Generate a new AES-256-GCM key and store via the platform keystore. */
export async function generateEncryptionKey(): Promise<KeyHandle> {
  const store = await getKeyStore();
  return store.generateKey(keyId());
}

/** Retrieve the stored encryption key, or null if none exists. */
export async function getEncryptionKey(): Promise<KeyHandle | null> {
  const store = await getKeyStore();
  return store.getKey(keyId());
}

/** Get existing key or generate a new one. */
export async function getOrCreateEncryptionKey(): Promise<KeyHandle> {
  const existing = await getEncryptionKey();
  if (existing) return existing;
  return generateEncryptionKey();
}

/** Check if an encryption key exists on this device. */
export async function hasEncryptionKey(): Promise<boolean> {
  const key = await getEncryptionKey();
  return key !== null;
}

/** Delete the encryption key (on disconnect/logout). Irreversible. */
export async function deleteEncryptionKey(): Promise<void> {
  const store = await getKeyStore();
  await store.deleteKey(keyId());
}

// ── Encrypt / Decrypt ───────────────────────────────────────────

/**
 * Encrypt a Telegram session string with the device-bound key.
 * Returns: "iv.ciphertext" as base64 (safe for JSON/DB storage).
 */
export async function encryptSession(plaintext: string): Promise<string> {
  await getOrCreateEncryptionKey(); // ensure key exists
  const store = await getKeyStore();
  return store.encrypt(keyId(), plaintext, aad());
}

/**
 * Decrypt a session blob with the device-bound key.
 * Input: "iv.ciphertext" as base64.
 * Returns: plaintext session string.
 * Throws if key is missing or decryption fails.
 */
export async function decryptSession(blob: string): Promise<string> {
  const store = await getKeyStore();
  const key = await store.getKey(keyId());
  if (!key) {
    throw new Error("No encryption key found. Re-authenticate with Telegram.");
  }
  return store.decrypt(keyId(), blob, aad());
}
