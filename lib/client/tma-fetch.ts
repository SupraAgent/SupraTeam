"use client";

import { getCached, setCached, addPendingAction } from "./tma-idb-store";

// Default TTLs by route pattern
const ROUTE_TTLS: Array<{ pattern: RegExp; maxAgeMs: number }> = [
  { pattern: /\/api\/deals/, maxAgeMs: 5 * 60_000 },
  { pattern: /\/api\/contacts/, maxAgeMs: 10 * 60_000 },
  { pattern: /\/api\/pipeline/, maxAgeMs: 60 * 60_000 },
  { pattern: /\/api\/groups/, maxAgeMs: 10 * 60_000 },
  { pattern: /\/api\/stats/, maxAgeMs: 5 * 60_000 },
];

function getTTL(url: string): number {
  for (const route of ROUTE_TTLS) {
    if (route.pattern.test(url)) return route.maxAgeMs;
  }
  return 5 * 60_000; // Default: 5 min
}

interface TmaFetchOptions extends RequestInit {
  /** Override the cache TTL for this request */
  maxAgeMs?: number;
  /** Action type label for queued mutations (e.g. "deal_stage_move") */
  actionType?: string;
}

interface TmaFetchResult<T = unknown> {
  data: T;
  ok: boolean;
  status: number;
  fromCache: boolean;
  lastSyncedAt: number | null;
  queued: boolean;
}

/**
 * Offline-aware fetch wrapper for TMA pages.
 * - GET: fetch with IndexedDB fallback
 * - POST/PUT/DELETE: queue in IndexedDB when offline, return optimistic response
 */
export async function tmaFetch<T = unknown>(
  url: string,
  options: TmaFetchOptions = {}
): Promise<TmaFetchResult<T>> {
  const { maxAgeMs, actionType, ...fetchOptions } = options;
  const method = (fetchOptions.method ?? "GET").toUpperCase();
  const ttl = maxAgeMs ?? getTTL(url);

  // --- Mutations (POST/PUT/PATCH/DELETE) ---
  if (method !== "GET") {
    return handleMutation<T>(url, method, fetchOptions, actionType);
  }

  // --- Reads (GET) ---
  return handleGet<T>(url, fetchOptions, ttl);
}

async function handleGet<T>(
  url: string,
  fetchOptions: RequestInit,
  ttl: number
): Promise<TmaFetchResult<T>> {
  try {
    const response = await fetch(url, fetchOptions);

    if (response.ok) {
      const data = (await response.json()) as T;
      const etag = response.headers.get("etag");

      // Cache in IndexedDB (fire-and-forget)
      setCached(url, data, etag).catch(() => {
        // Silently fail — caching is best-effort
      });

      return {
        data,
        ok: true,
        status: response.status,
        fromCache: false,
        lastSyncedAt: Date.now(),
        queued: false,
      };
    }

    // Non-OK response — try cache as fallback
    return fallbackToCache<T>(url, ttl, response.status);
  } catch {
    // Network error — try cache
    return fallbackToCache<T>(url, ttl, 0);
  }
}

async function fallbackToCache<T>(
  url: string,
  ttl: number,
  originalStatus: number
): Promise<TmaFetchResult<T>> {
  const cached = await getCached(url, ttl);

  if (cached) {
    return {
      data: cached.data as T,
      ok: true,
      status: 200,
      fromCache: true,
      lastSyncedAt: cached.timestamp,
      queued: false,
    };
  }

  return {
    data: null as T,
    ok: false,
    status: originalStatus || 503,
    fromCache: false,
    lastSyncedAt: null,
    queued: false,
  };
}

async function handleMutation<T>(
  url: string,
  method: string,
  fetchOptions: RequestInit,
  actionType?: string
): Promise<TmaFetchResult<T>> {
  try {
    const response = await fetch(url, { ...fetchOptions, method });

    if (response.ok) {
      const data = (await response.json()) as T;
      return {
        data,
        ok: true,
        status: response.status,
        fromCache: false,
        lastSyncedAt: Date.now(),
        queued: false,
      };
    }

    return {
      data: null as T,
      ok: false,
      status: response.status,
      fromCache: false,
      lastSyncedAt: null,
      queued: false,
    };
  } catch {
    // Offline — queue the mutation
    let body: unknown = null;
    if (fetchOptions.body) {
      try {
        body =
          typeof fetchOptions.body === "string"
            ? JSON.parse(fetchOptions.body)
            : fetchOptions.body;
      } catch {
        body = fetchOptions.body;
      }
    }

    await addPendingAction({
      type: actionType ?? `${method}_${url}`,
      url,
      method,
      body,
    });

    // Return an optimistic response so the UI can update immediately
    return {
      data: (body ?? {}) as T,
      ok: true,
      status: 202,
      fromCache: false,
      lastSyncedAt: null,
      queued: true,
    };
  }
}
