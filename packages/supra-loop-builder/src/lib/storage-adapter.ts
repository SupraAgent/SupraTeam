// ── Storage Adapter Interface & Implementations ─────────────────────

/**
 * Typed error for storage quota exceeded scenarios.
 */
export class StorageQuotaError extends Error {
  constructor(message: string = "Storage quota exceeded") {
    super(message);
    this.name = "StorageQuotaError";
  }
}

/**
 * Generic async key-value storage interface.
 * All adapters must implement this contract.
 */
export interface StorageAdapter {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
  keys(): Promise<string[]>;
  clear(): Promise<void>;
}

// ── LocalStorageAdapter ─────────────────────────────────────────────

/**
 * Wraps the browser's `localStorage` with an async interface.
 * Falls back to an in-memory Map when running server-side (SSR).
 */
export class LocalStorageAdapter implements StorageAdapter {
  private readonly _fallback: Map<string, string> | null;

  constructor() {
    this._fallback =
      typeof window === "undefined" || typeof window.localStorage === "undefined"
        ? new Map<string, string>()
        : null;
  }

  private get _isSSR(): boolean {
    return this._fallback !== null;
  }

  async getItem(key: string): Promise<string | null> {
    if (this._isSSR) {
      return this._fallback!.get(key) ?? null;
    }
    return window.localStorage.getItem(key);
  }

  async setItem(key: string, value: string): Promise<void> {
    if (this._isSSR) {
      this._fallback!.set(key, value);
      return;
    }
    try {
      window.localStorage.setItem(key, value);
    } catch (err: unknown) {
      if (
        err instanceof DOMException &&
        (err.name === "QuotaExceededError" ||
          err.code === DOMException.QUOTA_EXCEEDED_ERR)
      ) {
        throw new StorageQuotaError(
          `localStorage quota exceeded when setting key "${key}"`
        );
      }
      throw err;
    }
  }

  async removeItem(key: string): Promise<void> {
    if (this._isSSR) {
      this._fallback!.delete(key);
      return;
    }
    window.localStorage.removeItem(key);
  }

  async keys(): Promise<string[]> {
    if (this._isSSR) {
      return Array.from(this._fallback!.keys());
    }
    const result: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key !== null) {
        result.push(key);
      }
    }
    return result;
  }

  async clear(): Promise<void> {
    if (this._isSSR) {
      this._fallback!.clear();
      return;
    }
    window.localStorage.clear();
  }
}

// ── IndexedDBAdapter ────────────────────────────────────────────────

const IDB_NAME = "athena-storage";
const IDB_STORE = "kv";

/**
 * IndexedDB-backed adapter for larger storage needs.
 * Lazily opens the database on first use and caches the connection.
 * Falls back to an in-memory Map during SSR.
 */
export class IndexedDBAdapter implements StorageAdapter {
  private _db: IDBDatabase | null = null;
  private _dbPromise: Promise<IDBDatabase> | null = null;
  private readonly _fallback: Map<string, string> | null;

  constructor() {
    this._fallback =
      typeof window === "undefined" || typeof indexedDB === "undefined"
        ? new Map<string, string>()
        : null;
  }

  private get _isSSR(): boolean {
    return this._fallback !== null;
  }

  /**
   * Opens (or returns the cached) IndexedDB connection.
   */
  private _open(): Promise<IDBDatabase> {
    if (this._db) return Promise.resolve(this._db);
    if (this._dbPromise) return this._dbPromise;

    this._dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(IDB_NAME, 1);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE);
        }
      };

      request.onsuccess = () => {
        this._db = request.result;
        this._dbPromise = null;
        // Reset cached connection if the browser closes it (e.g. quota pressure)
        this._db.onclose = () => {
          this._db = null;
        };
        resolve(this._db);
      };

      request.onerror = () => {
        this._dbPromise = null;
        reject(request.error);
      };
    });

    return this._dbPromise;
  }

  /**
   * Helper to run a single IDBRequest inside a transaction and return the result.
   */
  private async _tx<T>(
    mode: IDBTransactionMode,
    fn: (store: IDBObjectStore) => IDBRequest<T>
  ): Promise<T> {
    const db = await this._open();
    return new Promise<T>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, mode);
      const store = tx.objectStore(IDB_STORE);
      const request = fn(store);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getItem(key: string): Promise<string | null> {
    if (this._isSSR) {
      return this._fallback!.get(key) ?? null;
    }
    const value = await this._tx("readonly", (store) => store.get(key));
    return (value as string) ?? null;
  }

  async setItem(key: string, value: string): Promise<void> {
    if (this._isSSR) {
      this._fallback!.set(key, value);
      return;
    }
    await this._tx("readwrite", (store) => store.put(value, key));
  }

  async removeItem(key: string): Promise<void> {
    if (this._isSSR) {
      this._fallback!.delete(key);
      return;
    }
    await this._tx("readwrite", (store) => store.delete(key));
  }

  async keys(): Promise<string[]> {
    if (this._isSSR) {
      return Array.from(this._fallback!.keys());
    }
    const result = await this._tx("readonly", (store) => store.getAllKeys());
    return (result as IDBValidKey[]).map((k) => String(k));
  }

  async clear(): Promise<void> {
    if (this._isSSR) {
      this._fallback!.clear();
      return;
    }
    await this._tx("readwrite", (store) => store.clear());
  }
}
