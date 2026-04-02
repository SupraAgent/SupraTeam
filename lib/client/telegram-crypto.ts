/**
 * Zero-knowledge encryption for Telegram sessions.
 *
 * Generates a device-bound AES-256-GCM key stored in IndexedDB (extractable: false).
 * The server never sees this key — it only stores encrypted blobs it cannot decrypt.
 *
 * Flow:
 *   1. On first connect → generateEncryptionKey() → stored in IndexedDB
 *   2. After TG auth → encryptSession(sessionString) → base64 blob sent to server
 *   3. On page load → server returns blob → decryptSession(blob) → plaintext session
 *   4. On disconnect → deleteEncryptionKey() → key destroyed
 */

import { getKey, setKey, deleteKey } from "./indexed-db";

const KEY_PREFIX = "tg-session-key";
const IV_LENGTH = 12;

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

/** AAD binds ciphertext to a specific user — prevents blob-swap attacks. */
function aad(): Uint8Array {
  return new TextEncoder().encode(`tg-session:${currentUserId}`);
}

/** Type guard: validates that a value from IndexedDB is a CryptoKey. */
function isCryptoKey(v: unknown): v is CryptoKey {
  return v instanceof CryptoKey;
}

// ── Key Management ──────────────────────────────────────────────

/** Generate a new AES-256-GCM key and store in IndexedDB. Non-extractable. */
export async function generateEncryptionKey(): Promise<CryptoKey> {
  const key = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    false, // extractable: false — key can never leave this device
    ["encrypt", "decrypt"]
  );
  await setKey(keyId(), key);
  return key;
}

/** Retrieve the stored encryption key, or null if none exists. */
export async function getEncryptionKey(): Promise<CryptoKey | null> {
  const key = await getKey<CryptoKey>(keyId(), isCryptoKey);
  return key ?? null;
}

/** Get existing key or generate a new one. */
export async function getOrCreateEncryptionKey(): Promise<CryptoKey> {
  const existing = await getEncryptionKey();
  if (existing) return existing;
  return generateEncryptionKey();
}

/** Check if an encryption key exists on this device. */
export async function hasEncryptionKey(): Promise<boolean> {
  const key = await getKey<CryptoKey>(keyId(), isCryptoKey);
  return key !== undefined;
}

/** Delete the encryption key (on disconnect/logout). Irreversible. */
export async function deleteEncryptionKey(): Promise<void> {
  await deleteKey(keyId());
}

// ── Encrypt / Decrypt ───────────────────────────────────────────

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function fromBase64(str: string): Uint8Array {
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Encrypt a Telegram session string with the device-bound key.
 * Returns: "iv.ciphertext" as base64 (safe for JSON/DB storage).
 */
export async function encryptSession(plaintext: string): Promise<string> {
  const key = await getOrCreateEncryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const encoded = new TextEncoder().encode(plaintext);

  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: aad() as BufferSource },
    key,
    encoded
  );

  return `${toBase64(iv)}.${toBase64(new Uint8Array(ciphertext))}`;
}

/**
 * Decrypt a session blob with the device-bound key.
 * Input: "iv.ciphertext" as base64.
 * Returns: plaintext session string.
 * Throws if key is missing or decryption fails.
 */
export async function decryptSession(blob: string): Promise<string> {
  const key = await getEncryptionKey();
  if (!key) {
    throw new Error("No encryption key found. Re-authenticate with Telegram.");
  }

  const parts = blob.split(".");
  if (parts.length !== 2) {
    throw new Error("Invalid encrypted session format.");
  }

  const [ivB64, ciphertextB64] = parts;
  const iv = fromBase64(ivB64);
  const ciphertext = fromBase64(ciphertextB64);

  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv as BufferSource, additionalData: aad() as BufferSource },
    key,
    ciphertext as BufferSource
  );

  return new TextDecoder().decode(plaintext);
}
