"use client";

import * as React from "react";
import {
  getCached,
  setCached,
  addPendingAction,
  getPendingActions,
  removePendingAction,
  getPendingActionCount,
} from "./tma-idb-store";

// --- Service Worker Registration ---

/** Register the TMA service worker. Only call in TMA context (Telegram WebApp). */
export function registerTMAServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  if (!("serviceWorker" in navigator)) return Promise.resolve(null);

  // Only register if running inside Telegram WebApp or on /tma routes
  const isTMA =
    !!(window as unknown as { Telegram?: { WebApp?: unknown } }).Telegram
      ?.WebApp || window.location.pathname.startsWith("/tma");

  if (!isTMA) return Promise.resolve(null);

  return navigator.serviceWorker
    .register("/tma-sw.js", { scope: "/tma" })
    .then((registration) => {
      // Listen for sync results from the SW
      navigator.serviceWorker.addEventListener("message", (event) => {
        if (event.data?.type === "SYNC_RESULTS") {
          handleSyncResults(event.data.results);
        }
      });

      return registration;
    })
    .catch((err) => {
      console.error("[TMA-SW] Registration failed:", err);
      return null;
    });
}

// --- Sync Result Handling ---

interface SyncResult {
  id: number;
  success: boolean;
  status: number;
}

async function handleSyncResults(results: SyncResult[]): Promise<void> {
  for (const result of results) {
    if (result.success) {
      await removePendingAction(result.id);
    }
  }
}

// --- useOfflineStatus Hook ---

interface OfflineStatus {
  isOnline: boolean;
  isOfflineReady: boolean;
  pendingActions: number;
}

export function useOfflineStatus(): OfflineStatus {
  const [isOnline, setIsOnline] = React.useState(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );
  const [isOfflineReady, setIsOfflineReady] = React.useState(false);
  const [pendingActions, setPendingActions] = React.useState(0);

  // Online/offline listeners
  React.useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Check if SW is registered (offline-ready)
  React.useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistration("/tma").then((reg) => {
        setIsOfflineReady(!!reg?.active);
      });
    }
  }, []);

  // Poll pending action count
  React.useEffect(() => {
    let mounted = true;

    const checkPending = async () => {
      try {
        const count = await getPendingActionCount();
        if (mounted) setPendingActions(count);
      } catch {
        // IndexedDB not available
      }
    };

    checkPending();
    const interval = setInterval(checkPending, 5_000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  return { isOnline, isOfflineReady, pendingActions };
}

// --- useOfflineCache Hook ---

interface OfflineCacheResult<T> {
  data: T | null;
  isStale: boolean;
  lastSyncedAt: number | null;
  refetch: () => Promise<void>;
}

interface UseOfflineCacheOptions {
  /** Max age in ms before cache is considered stale. Default: 5 min */
  maxAgeMs?: number;
}

export function useOfflineCache<T>(
  url: string | null,
  options: UseOfflineCacheOptions = {}
): OfflineCacheResult<T> {
  const { maxAgeMs = 5 * 60_000 } = options;
  const [data, setData] = React.useState<T | null>(null);
  const [isStale, setIsStale] = React.useState(false);
  const [lastSyncedAt, setLastSyncedAt] = React.useState<number | null>(null);

  const fetchWithCache = React.useCallback(async () => {
    if (!url) return;

    try {
      const response = await fetch(url);
      if (response.ok) {
        const json = await response.json();
        setData(json as T);
        setIsStale(false);
        setLastSyncedAt(Date.now());

        // Cache the response in IndexedDB
        const etag = response.headers.get("etag");
        await setCached(url, json, etag);
        return;
      }
    } catch {
      // Network failed — try cache
    }

    // Fall back to IndexedDB cache
    const cached = await getCached(url, maxAgeMs);
    if (cached) {
      setData(cached.data as T);
      setIsStale(cached.isStale);
      setLastSyncedAt(cached.timestamp);
    }
  }, [url, maxAgeMs]);

  React.useEffect(() => {
    fetchWithCache();
  }, [fetchWithCache]);

  return { data, isStale, lastSyncedAt, refetch: fetchWithCache };
}

// --- Offline Action Queue ---

interface OfflineAction {
  type: string;
  url: string;
  method: string;
  body: unknown;
}

/** Queue a mutation for offline sync. Returns the pending action ID. */
export async function queueOfflineAction(action: OfflineAction): Promise<number> {
  return addPendingAction(action);
}

/** Process all queued actions. Call when back online. */
export async function syncOfflineActions(): Promise<{
  synced: number;
  failed: number;
}> {
  const actions = await getPendingActions();
  let synced = 0;
  let failed = 0;

  // Try to sync via the service worker first (it can handle retries)
  if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: "SYNC_PENDING",
      actions: actions.map((a) => ({
        id: a.id,
        url: a.url,
        method: a.method,
        body: a.body,
      })),
    });
    return { synced: actions.length, failed: 0 };
  }

  // Fallback: sync directly if SW is not available
  for (const action of actions) {
    try {
      const response = await fetch(action.url, {
        method: action.method,
        headers: { "Content-Type": "application/json" },
        body: action.body ? JSON.stringify(action.body) : undefined,
      });

      if (response.ok) {
        await removePendingAction(action.id as number);
        synced++;
      } else {
        failed++;
      }
    } catch {
      failed++;
    }
  }

  return { synced, failed };
}
