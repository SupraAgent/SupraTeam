/**
 * Tauri keystore — stores encryption keys in the OS keychain.
 *
 * macOS: Keychain Services (hardware-backed on Apple Silicon)
 * Windows: Credential Manager
 * Linux: Secret Service (GNOME Keyring / KWallet)
 *
 * Unlike browser IndexedDB, these keys:
 *   - Survive browser data clears
 *   - Are protected by OS-level access control
 *   - Can be hardware-backed (Secure Enclave on Mac)
 *
 * Uses window.__TAURI__.core.invoke() directly to avoid importing
 * @tauri-apps/api (which breaks Next.js bundling in web mode).
 */

"use client";

import type { KeyStore, KeyHandle } from "./types";
import { invoke } from "../platform/tauri-invoke";

const IV_LENGTH = 12;
const SERVICE_NAME = "supracrm";

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

/** Import raw key bytes into a non-extractable WebCrypto CryptoKey. */
async function importKey(raw: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    raw.buffer as ArrayBuffer,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export const tauriKeyStore: KeyStore = {
  async setKey(_id: string, _key: KeyHandle): Promise<void> {
    // On Tauri, keys are generated via generateKey() which creates them in Rust
    // and stores directly in the OS keychain. setKey() with an existing CryptoKey
    // is not supported because browser-generated keys are non-extractable.
    // Use generateKey() instead.
    throw new Error(
      "tauriKeyStore.setKey() is not supported. Use generateKey() to create and store keys."
    );
  },

  async getKey(id: string): Promise<KeyHandle | null> {
    const b64 = await invoke<string | null>("keystore_get", {
      service: SERVICE_NAME,
      key: id,
    });
    if (!b64) return null;
    const raw = fromBase64(b64);
    return importKey(raw);
  },

  async deleteKey(id: string): Promise<void> {
    await invoke("keystore_delete", { service: SERVICE_NAME, key: id });
  },

  async clearAll(): Promise<void> {
    // Collect all known key IDs to delete from keychain.
    // Key IDs follow the pattern "tg-session-key-{userId}".
    const allKeys = await invoke<string[]>("keystore_list_keys", {
      service: SERVICE_NAME,
    }).catch(() => [] as string[]);
    await invoke("keystore_clear", { service: SERVICE_NAME, keyIds: allKeys });
  },

  async generateKey(id: string): Promise<KeyHandle> {
    // Generate key material in Rust — key bytes never exist as a JS string
    // that can't be zeroed. Rust generates, stores in OS keychain, returns base64.
    const b64 = await invoke<string>("keystore_generate", {
      service: SERVICE_NAME,
      key: id,
    });
    const raw = fromBase64(b64);

    // Import into WebCrypto as non-extractable for use in encrypt/decrypt
    return importKey(raw);
  },

  async encrypt(
    keyId: string,
    plaintext: string,
    aad?: Uint8Array
  ): Promise<string> {
    const key = await this.getKey(keyId);
    if (!key) throw new Error(`No key found for ID: ${keyId}`);

    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
    const encoded = new TextEncoder().encode(plaintext);

    const params: AesGcmParams = { name: "AES-GCM", iv: iv.buffer as ArrayBuffer };
    if (aad) params.additionalData = aad as BufferSource;

    const ciphertext = await crypto.subtle.encrypt(params, key, encoded);
    return `${toBase64(iv)}.${toBase64(new Uint8Array(ciphertext))}`;
  },

  async decrypt(
    keyId: string,
    blob: string,
    aad?: Uint8Array
  ): Promise<string> {
    const key = await this.getKey(keyId);
    if (!key) throw new Error(`No key found for ID: ${keyId}`);

    const parts = blob.split(".");
    if (parts.length !== 2) throw new Error("Invalid encrypted blob format.");

    const [ivB64, ciphertextB64] = parts;
    const iv = fromBase64(ivB64);
    const ciphertext = fromBase64(ciphertextB64);

    const params: AesGcmParams = { name: "AES-GCM", iv: iv.buffer as ArrayBuffer };
    if (aad) params.additionalData = aad as BufferSource;

    const plaintext = await crypto.subtle.decrypt(
      params,
      key,
      ciphertext.buffer as ArrayBuffer
    );
    return new TextDecoder().decode(plaintext);
  },
};
