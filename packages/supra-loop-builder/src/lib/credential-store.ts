/**
 * Encrypted Credential Store
 *
 * Uses Web Crypto API (AES-GCM) to encrypt credentials before storing
 * in localStorage. Credentials are never stored in plaintext.
 *
 * The encryption key is derived from a user-provided passphrase using PBKDF2.
 * If no passphrase is set, falls back to a device-bound key derived from
 * a random salt stored alongside the credentials.
 */

import type { StoredCredential } from "../types";
import { syncStorage } from "./storage-context";

let STORAGE_PREFIX = "suprateam_loop";

export function setCredentialStoragePrefix(prefix: string) {
  STORAGE_PREFIX = prefix;
}

export function getCredentialStoragePrefix(): string {
  return STORAGE_PREFIX;
}

const CREDENTIALS_KEY = () => `${STORAGE_PREFIX}:credentials`;
const SALT_KEY = () => `${STORAGE_PREFIX}:credential-salt`;

// ── Crypto helpers ─────────────────────────────────────────

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

async function getOrCreateSalt(): Promise<Uint8Array> {
  const existing = syncStorage.getItem(SALT_KEY());
  if (existing) {
    try {
      return base64ToBytes(existing);
    } catch {
      // Corrupted salt — previously encrypted credentials will be unrecoverable
      _lastError = {
        type: "decryption_failed",
        message: "Credential encryption salt was corrupted. Previously saved credentials may be unrecoverable. A new salt has been generated.",
      };
      console.error("[@supra/builder] Corrupted credential salt detected — regenerating. Previously encrypted credentials will be unrecoverable.");
    }
  }
  const salt = crypto.getRandomValues(new Uint8Array(16));
  syncStorage.setItem(SALT_KEY(), bytesToBase64(salt));
  return salt;
}

async function deriveKey(passphrase?: string): Promise<CryptoKey> {
  const salt = await getOrCreateSalt();
  // Use passphrase if provided, otherwise use a fixed device identifier
  const rawKey = passphrase || `${STORAGE_PREFIX}-device-key`;
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(rawKey),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" } as Pbkdf2Params,
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function encrypt(
  plaintext: string,
  passphrase?: string
): Promise<{ encrypted: string; iv: string }> {
  const key = await deriveKey(passphrase);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoded
  );
  return {
    encrypted: bytesToBase64(new Uint8Array(ciphertext)),
    iv: bytesToBase64(iv),
  };
}

async function decrypt(
  encrypted: string,
  iv: string,
  passphrase?: string
): Promise<string> {
  const key = await deriveKey(passphrase);
  const ciphertext = base64ToBytes(encrypted);
  const ivBytes = base64ToBytes(iv);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: new Uint8Array(ivBytes) as BufferSource },
    key,
    new Uint8Array(ciphertext) as BufferSource
  );
  return new TextDecoder().decode(decrypted);
}

// ── Public API ─────────────────────────────────────────────

export type CredentialStoreError =
  | { type: "parse_error"; message: string }
  | { type: "quota_exceeded"; message: string }
  | { type: "write_error"; message: string }
  | { type: "decryption_failed"; message: string };

let _lastError: CredentialStoreError | null = null;

/** Get the last error from credential store operations, if any. */
export function getLastCredentialError(): CredentialStoreError | null {
  return _lastError;
}

/** Clear the last error. */
export function clearCredentialError(): void {
  _lastError = null;
}

function loadCredentials(): StoredCredential[] {
  try {
    const raw = syncStorage.getItem(CREDENTIALS_KEY());
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      _lastError = {
        type: "parse_error",
        message: "Credential store data is corrupted (not an array). Stored credentials may be lost.",
      };
      console.error("[@supra/builder] Credential store corrupted: expected array, got", typeof parsed);
      return [];
    }
    return parsed;
  } catch (e) {
    _lastError = {
      type: "parse_error",
      message: `Failed to parse credential store: ${e instanceof Error ? e.message : String(e)}. Stored credentials may be lost.`,
    };
    console.error("[@supra/builder] Failed to parse credential store:", e);
    return [];
  }
}

/** Save credentials to localStorage. Returns true on success, false on failure. */
function saveCredentials(creds: StoredCredential[]): boolean {
  try {
    syncStorage.setItem(CREDENTIALS_KEY(), JSON.stringify(creds));
    return true;
  } catch (e) {
    if (e instanceof DOMException && e.name === "QuotaExceededError") {
      _lastError = {
        type: "quota_exceeded",
        message: "localStorage is full. Cannot save credentials. Free up space by deleting unused workspaces or templates.",
      };
    } else {
      _lastError = {
        type: "write_error",
        message: `Failed to save credentials: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
    console.error("[@supra/builder] Failed to save credentials:", e);
    return false;
  }
}

export function listCredentials(): Array<{
  id: string;
  name: string;
  provider: string;
  createdAt: string;
  updatedAt: string;
}> {
  return loadCredentials().map(({ id, name, provider, createdAt, updatedAt }) => ({
    id,
    name,
    provider,
    createdAt,
    updatedAt,
  }));
}

export async function addCredential(
  name: string,
  provider: string,
  value: string,
  passphrase?: string
): Promise<string | null> {
  const { encrypted, iv } = await encrypt(value, passphrase);
  const id = crypto.randomUUID?.() ?? `cred-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const cred: StoredCredential = {
    id,
    name,
    provider,
    encryptedValue: encrypted,
    iv,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const creds = loadCredentials();
  creds.push(cred);
  if (!saveCredentials(creds)) {
    return null;
  }
  return id;
}

export async function getCredentialValue(
  id: string,
  passphrase?: string
): Promise<{ value: string | null; error?: string }> {
  const creds = loadCredentials();
  const cred = creds.find((c) => c.id === id);
  if (!cred) return { value: null };
  try {
    const value = await decrypt(cred.encryptedValue, cred.iv, passphrase);
    return { value };
  } catch (e) {
    const error = passphrase
      ? "Decryption failed — wrong passphrase or corrupted data."
      : "Decryption failed — credential data may be corrupted.";
    _lastError = { type: "decryption_failed", message: error };
    console.error("[@supra/builder] Credential decryption failed for", id, e);
    return { value: null, error };
  }
}

export async function getCredentialByProvider(
  provider: string,
  passphrase?: string
): Promise<{ value: string | null; error?: string }> {
  const creds = loadCredentials();
  const cred = creds.find((c) => c.provider === provider);
  if (!cred) return { value: null };
  try {
    const value = await decrypt(cred.encryptedValue, cred.iv, passphrase);
    return { value };
  } catch (e) {
    const error = passphrase
      ? "Decryption failed — wrong passphrase or corrupted data."
      : "Decryption failed — credential data may be corrupted.";
    _lastError = { type: "decryption_failed", message: error };
    console.error("[@supra/builder] Credential decryption failed for provider", provider, e);
    return { value: null, error };
  }
}

export function deleteCredential(id: string): boolean {
  const creds = loadCredentials();
  const filtered = creds.filter((c) => c.id !== id);
  if (filtered.length === creds.length) return false;
  return saveCredentials(filtered);
}

export async function updateCredential(
  id: string,
  value: string,
  passphrase?: string
): Promise<boolean> {
  const creds = loadCredentials();
  const idx = creds.findIndex((c) => c.id === id);
  if (idx === -1) return false;
  const { encrypted, iv } = await encrypt(value, passphrase);
  creds[idx] = {
    ...creds[idx],
    encryptedValue: encrypted,
    iv,
    updatedAt: new Date().toISOString(),
  };
  return saveCredentials(creds);
}

/**
 * Migrate a plaintext API key from localStorage to the encrypted store.
 * Returns the credential ID if migration was performed, null if already migrated.
 */
export async function migrateApiKey(
  storageKeyPrefix: string,
  passphrase?: string
): Promise<string | null> {
  const legacyKey = `${storageKeyPrefix}_anthropic_key`;
  const plaintext = syncStorage.getItem(legacyKey);
  if (!plaintext) return null;

  // Check if already migrated
  const existing = loadCredentials().find((c) => c.provider === "anthropic");
  if (existing) return null;

  const id = await addCredential("Anthropic API Key", "anthropic", plaintext, passphrase);
  if (id) {
    // Remove the plaintext key only after successful migration
    syncStorage.removeItem(legacyKey);
  }
  return id;
}
