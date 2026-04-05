/**
 * IndexedDB store for TMA offline support.
 * Uses raw IndexedDB API — no external dependencies.
 *
 * Database: "supraCRM_offline"
 * Object stores:
 *   - apiCache: keyed by URL, stores cached API responses with timestamps
 *   - pendingActions: auto-increment, stores queued mutations
 *   - deals: keyed by deal ID for quick offline access
 *   - contacts: keyed by contact ID
 */

const DB_NAME = "supraCRM_offline";
const DB_VERSION = 1;

interface ApiCacheEntry {
  url: string;
  data: unknown;
  timestamp: number;
  etag: string | null;
}

interface PendingAction {
  id?: number;
  type: string;
  url: string;
  method: string;
  body: unknown;
  createdAt: number;
}

interface DealRecord {
  id: string;
  [key: string]: unknown;
}

interface ContactRecord {
  id: string;
  [key: string]: unknown;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains("apiCache")) {
        db.createObjectStore("apiCache", { keyPath: "url" });
      }
      if (!db.objectStoreNames.contains("pendingActions")) {
        db.createObjectStore("pendingActions", {
          keyPath: "id",
          autoIncrement: true,
        });
      }
      if (!db.objectStoreNames.contains("deals")) {
        db.createObjectStore("deals", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("contacts")) {
        db.createObjectStore("contacts", { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Get a cached API response if it exists and is not expired. */
export async function getCached(
  url: string,
  maxAgeMs: number
): Promise<{ data: unknown; timestamp: number; isStale: boolean } | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("apiCache", "readonly");
    const store = tx.objectStore("apiCache");
    const request = store.get(url);

    request.onsuccess = () => {
      const entry = request.result as ApiCacheEntry | undefined;
      if (!entry) {
        resolve(null);
        return;
      }

      const age = Date.now() - entry.timestamp;
      resolve({
        data: entry.data,
        timestamp: entry.timestamp,
        isStale: age > maxAgeMs,
      });
    };

    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
}

/** Store an API response in the cache. */
export async function setCached(
  url: string,
  data: unknown,
  etag?: string | null
): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("apiCache", "readwrite");
    const store = tx.objectStore("apiCache");
    const entry: ApiCacheEntry = {
      url,
      data,
      timestamp: Date.now(),
      etag: etag ?? null,
    };
    store.put(entry);

    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}

/** Queue a mutation for later sync. Returns the auto-generated ID. */
export async function addPendingAction(
  action: Omit<PendingAction, "id" | "createdAt">
): Promise<number> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("pendingActions", "readwrite");
    const store = tx.objectStore("pendingActions");
    const entry: Omit<PendingAction, "id"> = {
      ...action,
      createdAt: Date.now(),
    };
    const request = store.add(entry);

    request.onsuccess = () => {
      resolve(request.result as number);
    };

    tx.oncomplete = () => db.close();
    tx.onerror = () => reject(tx.error);
  });
}

/** Get all queued pending actions. */
export async function getPendingActions(): Promise<PendingAction[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("pendingActions", "readonly");
    const store = tx.objectStore("pendingActions");
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result as PendingAction[]);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
}

/** Remove a pending action after successful sync. */
export async function removePendingAction(id: number): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("pendingActions", "readwrite");
    const store = tx.objectStore("pendingActions");
    store.delete(id);

    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}

/** Get the count of pending actions. */
export async function getPendingActionCount(): Promise<number> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("pendingActions", "readonly");
    const store = tx.objectStore("pendingActions");
    const request = store.count();

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
}

/** Store a deal for quick offline access. */
export async function storeDeal(deal: DealRecord): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("deals", "readwrite");
    const store = tx.objectStore("deals");
    store.put(deal);

    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}

/** Store multiple deals at once. */
export async function storeDeals(deals: DealRecord[]): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("deals", "readwrite");
    const store = tx.objectStore("deals");
    for (const deal of deals) {
      store.put(deal);
    }

    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}

/** Get a deal by ID from offline store. */
export async function getDeal(id: string): Promise<DealRecord | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("deals", "readonly");
    const store = tx.objectStore("deals");
    const request = store.get(id);

    request.onsuccess = () => resolve((request.result as DealRecord) ?? null);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
}

/** Get all deals from offline store. */
export async function getAllDeals(): Promise<DealRecord[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("deals", "readonly");
    const store = tx.objectStore("deals");
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result as DealRecord[]);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
}

/** Store a contact for offline access. */
export async function storeContact(contact: ContactRecord): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("contacts", "readwrite");
    const store = tx.objectStore("contacts");
    store.put(contact);

    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}

/** Store multiple contacts at once. */
export async function storeContacts(contacts: ContactRecord[]): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("contacts", "readwrite");
    const store = tx.objectStore("contacts");
    for (const contact of contacts) {
      store.put(contact);
    }

    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}

/** Get all contacts from offline store. */
export async function getAllContacts(): Promise<ContactRecord[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("contacts", "readonly");
    const store = tx.objectStore("contacts");
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result as ContactRecord[]);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
}

/** Clear all offline data. */
export async function clearOfflineData(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const storeNames = ["apiCache", "pendingActions", "deals", "contacts"];
    const tx = db.transaction(storeNames, "readwrite");

    for (const name of storeNames) {
      tx.objectStore(name).clear();
    }

    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}
