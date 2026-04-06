/**
 * Browser keystore — stores non-extractable CryptoKeys in IndexedDB.
 *
 * This is the existing behavior extracted into the KeyStore interface.
 * IndexedDB is the only browser API that supports structured-clone of
 * non-extractable CryptoKey objects.
 */

"use client";

import {
  getKey as idbGet,
  setKey as idbSet,
  deleteKey as idbDelete,
  clearAll as idbClearAll,
} from "../client/indexed-db";
import type { KeyStore, KeyHandle } from "./types";

const IV_LENGTH = 12;

function isCryptoKey(v: unknown): v is CryptoKey {
  return v instanceof CryptoKey;
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

export const browserKeyStore: KeyStore = {
  async setKey(id: string, key: KeyHandle): Promise<void> {
    await idbSet(id, key);
  },

  async getKey(id: string): Promise<KeyHandle | null> {
    const key = await idbGet<CryptoKey>(id, isCryptoKey);
    return key ?? null;
  },

  async deleteKey(id: string): Promise<void> {
    await idbDelete(id);
  },

  async clearAll(): Promise<void> {
    await idbClearAll();
  },

  async generateKey(id: string): Promise<KeyHandle> {
    const key = await crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      false, // extractable: false — key can never leave this device
      ["encrypt", "decrypt"]
    );
    await idbSet(id, key);
    return key;
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
