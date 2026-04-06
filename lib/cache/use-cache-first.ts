/**
 * Cache-first data loading hook.
 *
 * Pattern: load from local cache instantly → render → fetch from network
 * in background → update state + cache. On web, the cache is IndexedDB
 * (limited). On desktop, it's SQLite (fast, durable, unlimited).
 *
 * This gives desktop users instant page loads while keeping the web
 * experience identical (network-first with optional stale data).
 */

"use client";

import * as React from "react";
import { isDesktop } from "../platform";
import type { CacheStore } from "./types";

interface UseCacheFirstOptions<T> {
  /** Unique cache key for this data set (e.g. "pipeline-deals"). */
  cacheKey: string;
  /** Network fetch function — returns fresh data from the server. */
  fetchFn: () => Promise<T>;
  /** Read cached data from the store. Return null if nothing cached. */
  readCache: (store: CacheStore) => Promise<T | null>;
  /** Write fresh data to the cache store. */
  writeCache: (store: CacheStore, data: T) => Promise<void>;
  /** Whether to enable caching (default: true on desktop, false on web). */
  enabled?: boolean;
}

interface UseCacheFirstResult<T> {
  data: T | null;
  /** True during initial load (no cached data yet, network pending). */
  loading: boolean;
  /** True when showing cached data while network fetch is in progress. */
  isStale: boolean;
  /** Trigger a fresh network fetch. */
  refresh: () => Promise<void>;
}

export function useCacheFirst<T>({
  cacheKey,
  fetchFn,
  readCache,
  writeCache,
  enabled,
}: UseCacheFirstOptions<T>): UseCacheFirstResult<T> {
  const shouldCache = enabled ?? isDesktop;

  const [data, setData] = React.useState<T | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [isStale, setIsStale] = React.useState(false);

  // Prevent stale closure issues
  const fetchFnRef = React.useRef(fetchFn);
  const readCacheRef = React.useRef(readCache);
  const writeCacheRef = React.useRef(writeCache);
  fetchFnRef.current = fetchFn;
  readCacheRef.current = readCache;
  writeCacheRef.current = writeCache;

  const mountedRef = React.useRef(true);
  React.useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const loadData = React.useCallback(async () => {
    if (!mountedRef.current) return;

    // Step 1: Try loading from cache (desktop gets instant data)
    if (shouldCache) {
      try {
        const { getCacheStore } = await import("./index");
        const store = await getCacheStore();
        const cached = await readCacheRef.current(store);
        if (cached !== null && mountedRef.current) {
          setData(cached);
          setLoading(false);
          setIsStale(true); // Mark as stale — network fetch will refresh
        }
      } catch {
        // Cache read failed — fall through to network
      }
    }

    // Step 2: Fetch fresh data from network
    try {
      const fresh = await fetchFnRef.current();
      if (!mountedRef.current) return;

      setData(fresh);
      setLoading(false);
      setIsStale(false);

      // Step 3: Write to cache for next time
      if (shouldCache) {
        try {
          const { getCacheStore } = await import("./index");
          const store = await getCacheStore();
          await writeCacheRef.current(store, fresh);
        } catch {
          // Cache write failed — not critical
        }
      }
    } catch {
      // Network failed — if we had cached data, keep showing it
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [shouldCache, cacheKey]);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  const refresh = React.useCallback(async () => {
    setIsStale(true);
    await loadData();
  }, [loadData]);

  return { data, loading, isStale, refresh };
}
