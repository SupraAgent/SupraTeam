/**
 * Cache adapter — auto-selects browser or Tauri backend at runtime.
 *
 * Usage:
 *   import { getCacheStore } from "@/lib/cache";
 *   const cache = await getCacheStore();
 *   const deals = await cache.getAllDeals();
 */

"use client";

import { isDesktop } from "../platform";
import type { CacheStore } from "./types";

export type {
  CacheStore,
  CachedResult,
  PendingAction,
  DealRecord,
  ContactRecord,
  MessageRecord,
  EmailThreadRecord,
} from "./types";

let _promise: Promise<CacheStore> | null = null;

/** Get the cache store for the current platform. Concurrent-safe singleton. */
export function getCacheStore(): Promise<CacheStore> {
  if (_promise) return _promise;

  _promise = (async () => {
    if (isDesktop) {
      const { tauriCacheStore } = await import("./tauri-cache");
      return tauriCacheStore;
    }
    const { browserCacheStore } = await import("./browser-cache");
    return browserCacheStore;
  })();

  return _promise;
}
