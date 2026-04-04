"use client";

const DB_NAME = "supracrm-tma";
const DB_VERSION = 1;
const STORES = ["deals", "stats", "groups"] as const;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const store of STORES) {
        if (!db.objectStoreNames.contains(store)) {
          db.createObjectStore(store);
        }
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function cacheSet(store: typeof STORES[number], key: string, value: unknown): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).put({ value, cachedAt: Date.now() }, key);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Silently fail — offline cache is best-effort
  }
}

export async function cacheGet<T>(store: typeof STORES[number], key: string, maxAgeMs = 300000): Promise<T | null> {
  try {
    const db = await openDB();
    const tx = db.transaction(store, "readonly");
    const result = await new Promise<{ value: T; cachedAt: number } | undefined>((resolve, reject) => {
      const req = tx.objectStore(store).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    if (!result) return null;
    if (Date.now() - result.cachedAt > maxAgeMs) return null; // Stale
    return result.value;
  } catch {
    return null;
  }
}

/** Clear all cached data — call on logout to prevent data leaks on shared devices. */
export async function cacheClearAll(): Promise<void> {
  try {
    const db = await openDB();
    for (const store of STORES) {
      const tx = db.transaction(store, "readwrite");
      tx.objectStore(store).clear();
      await new Promise<void>((resolve) => { tx.oncomplete = () => resolve(); });
    }
  } catch {
    // Best-effort cleanup
  }
}
