// TMA Service Worker — offline-capable caching for Telegram Mini App.
// Strategies:
//   - Cache-first for static assets (JS, CSS, images, fonts)
//   - Network-first with cache fallback for API responses (per-route TTLs)
//   - Background sync for queued POST/PUT/DELETE mutations

const CACHE_VERSION = "supracrm-tma-v1";
const STATIC_CACHE = "supracrm-tma-static-v1";

// --- Static asset matching ---

const STATIC_EXTENSIONS = /\.(js|css|png|jpg|jpeg|svg|gif|webp|woff|woff2|ttf|eot|ico)(\?.*)?$/;

function isStaticAsset(url) {
  return STATIC_EXTENSIONS.test(url.pathname);
}

// --- API route matching & TTLs ---

const API_CACHE_CONFIG = [
  { pattern: /\/api\/deals/, ttlMs: 5 * 60_000 },
  { pattern: /\/api\/contacts/, ttlMs: 10 * 60_000 },
  { pattern: /\/api\/pipeline/, ttlMs: 60 * 60_000 },
  { pattern: /\/api\/groups/, ttlMs: 10 * 60_000 },
  { pattern: /\/api\/stats/, ttlMs: 5 * 60_000 },
];

function getApiCacheConfig(pathname) {
  for (const config of API_CACHE_CONFIG) {
    if (config.pattern.test(pathname)) return config;
  }
  return null;
}

// Max cache entries per cache bucket
const MAX_CACHE_ENTRIES = 150;

// --- Install ---

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

// --- Activate — clean old caches ---

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then((names) =>
        Promise.all(
          names
            .filter(
              (name) =>
                name.startsWith("supracrm-tma-") &&
                name !== CACHE_VERSION &&
                name !== STATIC_CACHE
            )
            .map((name) => caches.delete(name))
        )
      ),
    ])
  );
});

// --- Fetch handler ---

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Only handle same-origin requests
  if (url.origin !== self.location.origin) return;

  // Skip non-GET requests — mutations are handled by the client-side queue
  if (event.request.method !== "GET") return;

  // Static assets: cache-first
  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(event.request, STATIC_CACHE));
    return;
  }

  // API routes: network-first with cache fallback
  const apiConfig = getApiCacheConfig(url.pathname);
  if (apiConfig) {
    event.respondWith(networkFirstWithFallback(event.request, apiConfig.ttlMs));
    return;
  }
});

// --- Cache-first strategy (static assets) ---

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  if (cached) return cached;

  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone()).then(() => evictOldEntries(cache));
    }
    return networkResponse;
  } catch {
    return new Response("Offline", { status: 503 });
  }
}

// --- Network-first with cache fallback (API routes) ---

async function networkFirstWithFallback(request, ttlMs) {
  const cache = await caches.open(CACHE_VERSION);

  try {
    const networkResponse = await fetch(request);

    if (networkResponse.ok) {
      const headers = new Headers(networkResponse.headers);
      headers.set("x-sw-cached-at", Date.now().toString());

      const responseToCache = new Response(await networkResponse.clone().blob(), {
        status: networkResponse.status,
        statusText: networkResponse.statusText,
        headers,
      });

      cache.put(request, responseToCache).then(() => evictOldEntries(cache));
    }

    return networkResponse;
  } catch {
    // Network failed — serve from cache
    const cached = await cache.match(request);
    if (cached) {
      const cachedAt = parseInt(cached.headers.get("x-sw-cached-at") || "0", 10);
      const isStale = Date.now() - cachedAt > ttlMs;

      const headers = new Headers(cached.headers);
      headers.set("x-sw-from-cache", "true");
      if (isStale) headers.set("x-sw-stale", "true");

      return new Response(cached.body, {
        status: cached.status,
        statusText: cached.statusText,
        headers,
      });
    }

    return new Response(
      JSON.stringify({ error: "You are offline and no cached data is available." }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  }
}

// --- Cache eviction ---

async function evictOldEntries(cache) {
  const keys = await cache.keys();
  if (keys.length <= MAX_CACHE_ENTRIES) return;

  const entries = await Promise.all(
    keys.map(async (key) => {
      const response = await cache.match(key);
      const cachedAt = parseInt(
        response?.headers.get("x-sw-cached-at") || "0",
        10
      );
      return { key, cachedAt };
    })
  );
  entries.sort((a, b) => a.cachedAt - b.cachedAt);

  const toEvict = entries.slice(0, entries.length - MAX_CACHE_ENTRIES);
  for (const { key } of toEvict) {
    await cache.delete(key);
  }
}

// --- Message handling ---

self.addEventListener("message", (event) => {
  if (event.data?.type === "INVALIDATE_CACHE") {
    const pattern = event.data.pattern;
    caches.open(CACHE_VERSION).then(async (cache) => {
      const keys = await cache.keys();
      for (const key of keys) {
        if (key.url.includes(pattern)) {
          await cache.delete(key);
        }
      }
    });
  }

  if (event.data?.type === "CLEAR_ALL") {
    caches.delete(CACHE_VERSION);
    caches.delete(STATIC_CACHE);
  }

  // Background sync: retry pending actions sent from the client
  if (event.data?.type === "SYNC_PENDING") {
    const actions = event.data.actions || [];
    event.waitUntil(processPendingActions(actions, event.source));
  }
});

// --- Background sync for pending mutations ---

async function processPendingActions(actions, clientSource) {
  const results = [];

  for (const action of actions) {
    try {
      const response = await fetch(action.url, {
        method: action.method,
        headers: { "Content-Type": "application/json" },
        body: action.body ? JSON.stringify(action.body) : undefined,
      });

      results.push({
        id: action.id,
        success: response.ok,
        status: response.status,
      });
    } catch {
      results.push({
        id: action.id,
        success: false,
        status: 0,
      });
    }
  }

  // Notify the client of sync results
  const allClients = await self.clients.matchAll();
  for (const client of allClients) {
    client.postMessage({ type: "SYNC_RESULTS", results });
  }
}
