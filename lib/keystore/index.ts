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

let _promise: Promise<KeyStore> | null = null;

/** Get the keystore for the current platform. Concurrent-safe singleton. */
export function getKeyStore(): Promise<KeyStore> {
  if (_promise) return _promise;

  _promise = (async () => {
    if (isDesktop) {
      const { tauriKeyStore } = await import("./tauri-keystore");
      return tauriKeyStore;
    }
    const { browserKeyStore } = await import("./browser-keystore");
    return browserKeyStore;
  })();

  return _promise;
}
