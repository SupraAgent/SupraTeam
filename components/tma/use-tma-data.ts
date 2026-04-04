"use client";

import * as React from "react";
import { cacheGet, cacheSet } from "./offline-cache";

type Store = "deals" | "stats" | "groups";

export function useTMAData<T>(
  url: string,
  store: Store,
  cacheKey: string,
  transform?: (data: unknown) => T
): { data: T | null; loading: boolean; refresh: () => Promise<void>; fromCache: boolean } {
  const [data, setData] = React.useState<T | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [fromCache, setFromCache] = React.useState(false);

  const fetch_ = React.useCallback(async () => {
    // Try cache first
    const cached = await cacheGet<T>(store, cacheKey);
    if (cached) {
      setData(cached);
      setFromCache(true);
      setLoading(false);
    }

    // Fetch fresh data
    try {
      const res = await fetch(url);
      if (res.ok) {
        const raw = await res.json();
        const value = transform ? transform(raw) : raw as T;
        setData(value);
        setFromCache(false);
        await cacheSet(store, cacheKey, value);
      }
    } catch {
      // Network error — use cached data if available
      if (!cached) {
        const stale = await cacheGet<T>(store, cacheKey, Infinity);
        if (stale) {
          setData(stale);
          setFromCache(true);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [url, store, cacheKey, transform]);

  React.useEffect(() => {
    fetch_();
  }, [fetch_]);

  return { data, loading, refresh: fetch_, fromCache };
}
