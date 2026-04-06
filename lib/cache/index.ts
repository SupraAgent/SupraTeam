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

let _instance: CacheStore | null = null;

/** Get the cache store for the current platform. Cached after first call. */
export async function getCacheStore(): Promise<CacheStore> {
  if (_instance) return _instance;

  if (isDesktop) {
    const { tauriCacheStore } = await import("./tauri-cache");
    _instance = tauriCacheStore;
  } else {
    const { browserCacheStore } = await import("./browser-cache");
    _instance = browserCacheStore;
  }

  return _instance;
}
