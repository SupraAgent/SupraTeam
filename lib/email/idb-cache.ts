// IndexedDB cache for offline email access
// Stores threads and messages for instant load + offline reading

// Scope DB name by user ID to prevent cross-user data leaks on shared browsers
function getDbName(): string {
  if (!_idbUserId) {
    throw new Error("IDB userId not set — call setIdbUserId() before accessing email cache");
  }
  return `supracrm_email_${_idbUserId}`;
}

let _idbUserId: string | null = null;

/** Set the current user ID for IDB scoping — call on login */
export function setIdbUserId(userId: string) {
  _idbUserId = userId;
}

const DB_VERSION = 1;
const STORE_THREADS = "threads";
const STORE_MESSAGES = "messages";
const MAX_CACHED_THREADS = 500;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB not available"));
      return;
    }
    const request = indexedDB.open(getDbName(), DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_THREADS)) {
        const store = db.createObjectStore(STORE_THREADS, { keyPath: "id" });
        store.createIndex("lastMessageAt", "lastMessageAt", { unique: false });
        store.createIndex("labelIds", "labelIds", { unique: false, multiEntry: true });
      }
      if (!db.objectStoreNames.contains(STORE_MESSAGES)) {
        const store = db.createObjectStore(STORE_MESSAGES, { keyPath: "id" });
        store.createIndex("threadId", "threadId", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Cache thread list items for offline access */
export async function cacheThreads(threads: ThreadCacheItem[]): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_THREADS, "readwrite");
    const store = tx.objectStore(STORE_THREADS);

    for (const thread of threads) {
      store.put({ ...thread, _cachedAt: Date.now() });
    }

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    // Evict old entries beyond limit
    await evictOldThreads();
  } catch {
    // Silently fail — IDB is best-effort
  }
}

/** Get cached thread list (for offline or instant first paint) */
export async function getCachedThreads(labelId?: string): Promise<ThreadCacheItem[]> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_THREADS, "readonly");
    const store = tx.objectStore(STORE_THREADS);

    return new Promise((resolve) => {
      const request = store.getAll();
      request.onsuccess = () => {
        let threads = request.result as ThreadCacheItem[];
        if (labelId) {
          threads = threads.filter((t) => t.labelIds?.includes(labelId));
        }
        // Sort by lastMessageAt descending
        threads.sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime());
        resolve(threads);
      };
      request.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
}

/** Cache full thread (messages) for offline reading */
export async function cacheFullThread(threadId: string, messages: MessageCacheItem[]): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_MESSAGES, "readwrite");
    const store = tx.objectStore(STORE_MESSAGES);

    for (const msg of messages) {
      store.put({ ...msg, threadId, _cachedAt: Date.now() });
    }

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Silently fail
  }
}

/** Get cached messages for a thread */
export async function getCachedMessages(threadId: string): Promise<MessageCacheItem[]> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_MESSAGES, "readonly");
    const store = tx.objectStore(STORE_MESSAGES);
    const index = store.index("threadId");

    return new Promise((resolve) => {
      const request = index.getAll(threadId);
      request.onsuccess = () => {
        const messages = request.result as MessageCacheItem[];
        messages.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        resolve(messages);
      };
      request.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
}

/** Evict oldest cached threads beyond the limit */
async function evictOldThreads(): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_THREADS, "readwrite");
    const store = tx.objectStore(STORE_THREADS);
    const index = store.index("lastMessageAt");

    const countReq = store.count();
    await new Promise<void>((resolve) => {
      countReq.onsuccess = () => {
        const count = countReq.result;
        if (count <= MAX_CACHED_THREADS) {
          resolve();
          return;
        }
        // Delete oldest entries
        const toDelete = count - MAX_CACHED_THREADS;
        let deleted = 0;
        const cursorReq = index.openCursor();
        cursorReq.onsuccess = () => {
          const cursor = cursorReq.result;
          if (cursor && deleted < toDelete) {
            cursor.delete();
            deleted++;
            cursor.continue();
          } else {
            resolve();
          }
        };
        cursorReq.onerror = () => resolve();
      };
      countReq.onerror = () => resolve();
    });
  } catch {
    // Silently fail
  }
}

/** Clear all cached email data */
export async function clearEmailCache(): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction([STORE_THREADS, STORE_MESSAGES], "readwrite");
    tx.objectStore(STORE_THREADS).clear();
    tx.objectStore(STORE_MESSAGES).clear();
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Silently fail
  }
}

// Lightweight types for cache (avoid importing full types to keep this module lean)
type ThreadCacheItem = {
  id: string;
  subject: string;
  snippet: string;
  from: { name: string; email: string }[];
  to: { name: string; email: string }[];
  labelIds: string[];
  isUnread: boolean;
  isStarred: boolean;
  lastMessageAt: string;
  messageCount: number;
  _cachedAt?: number;
};

type MessageCacheItem = {
  id: string;
  threadId?: string;
  from: { name: string; email: string };
  to: { name: string; email: string }[];
  cc: { name: string; email: string }[];
  subject: string;
  body: string;
  bodyText: string;
  date: string;
  isUnread: boolean;
  _cachedAt?: number;
};
