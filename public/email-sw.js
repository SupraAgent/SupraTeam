// Email Service Worker — offline-first caching for email API responses.
// Strategy: network-first with cache fallback for reads, network-only for writes.
// Keeps thread lists and individual threads available on flaky connections.

const CACHE_NAME = "supracrm-email-v1";

// Cache email API GET requests only — never cache mutations
const CACHEABLE_PATTERNS = [
  /\/api\/email\/threads/,
  /\/api\/email\/groups/,
  /\/api\/email\/labels/,
  /\/api\/email\/connections/,
];

// Max cache entries to prevent unbounded storage growth
const MAX_CACHE_ENTRIES = 200;

// Cache TTLs (ms) — stale cache is better than blank screen on flaky connections
const CACHE_TTLS = {
  "/api/email/threads": 60_000,      // 1 min for thread lists
  "/api/email/groups": 300_000,      // 5 min for groups
  "/api/email/labels": 600_000,      // 10 min for labels
  "/api/email/connections": 600_000, // 10 min for connections
};

function getCacheTTL(url) {
  for (const [pattern, ttl] of Object.entries(CACHE_TTLS)) {
    if (url.includes(pattern)) return ttl;
  }
  return 60_000; // Default 1 min
}

function isCacheable(request) {
  if (request.method !== "GET") return false;
  const url = new URL(request.url);
  return CACHEABLE_PATTERNS.some((p) => p.test(url.pathname));
}

// Install — skip waiting to activate immediately
self.addEventListener("install", () => {
  self.skipWaiting();
});

// Activate — claim all clients and clean old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then((names) =>
        Promise.all(
          names
            .filter((name) => name.startsWith("supracrm-email-") && name !== CACHE_NAME)
            .map((name) => caches.delete(name))
        )
      ),
    ])
  );
});

// Fetch — network-first with cache fallback for GET email API requests
self.addEventListener("fetch", (event) => {
  if (!isCacheable(event.request)) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);

      try {
        // Network-first: try the network
        const networkResponse = await fetch(event.request);

        // Only cache successful responses
        if (networkResponse.ok) {
          // Clone response before consuming (stream can only be read once)
          const responseToCache = networkResponse.clone();

          // Store with timestamp header for TTL checking
          const headers = new Headers(responseToCache.headers);
          headers.set("x-sw-cached-at", Date.now().toString());
          const cachedResponse = new Response(await responseToCache.blob(), {
            status: responseToCache.status,
            statusText: responseToCache.statusText,
            headers,
          });

          // Fire-and-forget cache update — don't block response
          cache.put(event.request, cachedResponse).then(() => evictOldEntries(cache));
        }

        return networkResponse;
      } catch {
        // Network failed — serve from cache if available
        const cached = await cache.match(event.request);
        if (cached) {
          // Check TTL — prefer stale over nothing, but log it
          const cachedAt = parseInt(cached.headers.get("x-sw-cached-at") || "0", 10);
          const ttl = getCacheTTL(event.request.url);
          const isStale = Date.now() - cachedAt > ttl;

          // Add header so the UI can show a "cached data" indicator if needed
          const headers = new Headers(cached.headers);
          headers.set("x-sw-from-cache", "true");
          if (isStale) headers.set("x-sw-stale", "true");

          return new Response(cached.body, {
            status: cached.status,
            statusText: cached.statusText,
            headers,
          });
        }

        // No cache, no network — return offline error
        return new Response(
          JSON.stringify({ error: "You are offline and no cached data is available." }),
          { status: 503, headers: { "Content-Type": "application/json" } }
        );
      }
    })()
  );
});

// Listen for cache invalidation messages from the main thread
self.addEventListener("message", (event) => {
  if (event.data?.type === "INVALIDATE_CACHE") {
    const pattern = event.data.pattern;
    caches.open(CACHE_NAME).then(async (cache) => {
      const keys = await cache.keys();
      for (const key of keys) {
        if (key.url.includes(pattern)) {
          await cache.delete(key);
        }
      }
    });
  }

  if (event.data?.type === "CLEAR_ALL") {
    caches.delete(CACHE_NAME);
  }
});

// Evict oldest entries when cache exceeds max size
async function evictOldEntries(cache) {
  const keys = await cache.keys();
  if (keys.length <= MAX_CACHE_ENTRIES) return;

  // Sort by cached-at timestamp and remove oldest entries
  const entries = await Promise.all(
    keys.map(async (key) => {
      const response = await cache.match(key);
      const cachedAt = parseInt(response?.headers.get("x-sw-cached-at") || "0", 10);
      return { key, cachedAt };
    })
  );
  entries.sort((a, b) => a.cachedAt - b.cachedAt);

  const toEvict = entries.slice(0, entries.length - MAX_CACHE_ENTRIES);
  for (const { key } of toEvict) {
    await cache.delete(key);
  }
}
