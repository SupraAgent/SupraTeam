// Server-side in-memory cache for Railway's persistent process
// Unlike serverless, Railway keeps the Node.js process alive between requests,
// so this module-level state persists and serves as a fast L1 cache.

type CacheEntry<T> = {
  data: T;
  ts: number;
  ttl: number;
};

class MemoryCache {
  private store = new Map<string, CacheEntry<unknown>>();
  private maxSize = 500;

  get<T>(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() - entry.ts > entry.ttl) {
      this.store.delete(key);
      return null;
    }
    // Move to end so eviction removes the actual least-recently-used entry
    this.store.delete(key);
    this.store.set(key, entry);
    return entry.data as T;
  }

  set<T>(key: string, data: T, ttlMs: number): void {
    // LRU eviction if over max size
    if (this.store.size >= this.maxSize) {
      const oldest = this.store.keys().next().value;
      if (oldest) this.store.delete(oldest);
    }
    this.store.set(key, { data, ts: Date.now(), ttl: ttlMs });
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  /** Delete all keys matching a prefix */
  invalidatePrefix(prefix: string): void {
    // Collect keys first to avoid mutating Map during iteration
    const toDelete: string[] = [];
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) toDelete.push(key);
    }
    for (const key of toDelete) this.store.delete(key);
  }
}

// Singleton — survives across requests on Railway
export const serverCache = new MemoryCache();

// Cache TTLs
export const TTL = {
  THREAD_LIST: 15_000,   // 15s — thread lists change frequently
  THREAD_FULL: 60_000,   // 60s — individual threads change less often
  LABELS: 300_000,       // 5min — labels barely change
  DRIVER: 60_000,        // 60s — driver with decrypted tokens (short to limit exposure)
} as const;
