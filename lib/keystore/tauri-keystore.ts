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

const IV_LENGTH = 12;
const SERVICE_NAME = "supracrm";

/** Call a Tauri command via the global __TAURI__ object. */
async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const tauri = window.__TAURI__;
  if (!tauri?.core?.invoke) {
    throw new Error("Tauri runtime not available");
  }
  return tauri.core.invoke(cmd, args) as Promise<T>;
}

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
  async setKey(id: string, key: KeyHandle): Promise<void> {
    const raw = await crypto.subtle.exportKey("raw", key);
    const b64 = toBase64(new Uint8Array(raw));
    await invoke("keystore_set", { service: SERVICE_NAME, key: id, value: b64 });
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
    await invoke("keystore_clear", { service: SERVICE_NAME });
  },

  async generateKey(id: string): Promise<KeyHandle> {
    // Generate 256-bit random key material
    const raw = crypto.getRandomValues(new Uint8Array(32));
    const b64 = toBase64(raw);

    // Store raw bytes in OS keychain
    await invoke("keystore_set", { service: SERVICE_NAME, key: id, value: b64 });

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
