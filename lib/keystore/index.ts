/**
 * Keystore adapter — auto-selects browser or Tauri backend at runtime.
 *
 * Usage:
 *   import { getKeyStore } from "@/lib/keystore";
 *   const keystore = await getKeyStore();
 *   await keystore.encrypt(keyId, plaintext, aad);
 */

"use client";

import { isDesktop } from "../platform";
import type { KeyStore } from "./types";

export type { KeyStore, KeyHandle } from "./types";

let _instance: KeyStore | null = null;

/** Get the keystore for the current platform. Cached after first call. */
export async function getKeyStore(): Promise<KeyStore> {
  if (_instance) return _instance;

  if (isDesktop) {
    const { tauriKeyStore } = await import("./tauri-keystore");
    _instance = tauriKeyStore;
  } else {
    const { browserKeyStore } = await import("./browser-keystore");
    _instance = browserKeyStore;
  }

  return _instance;
}
