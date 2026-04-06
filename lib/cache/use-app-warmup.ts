/**
 * App warmup hook — preloads frequently-used data on app startup.
 *
 * On desktop: reads from SQLite cache for instant hydration, then
 * fetches fresh data from the network in the background.
 *
 * On web: fetches rarely-changing data (pipeline stages, team) to
 * prime the browser cache / service worker so subsequent navigations
 * are instant.
 *
 * This runs once in the app shell — before the user navigates to
 * any specific page.
 */

"use client";

import * as React from "react";
import { isDesktop } from "@/lib/platform";
import { getCacheStore } from "@/lib/cache";

/** Endpoints that rarely change — safe to preload aggressively. */
const WARMUP_ENDPOINTS = [
  "/api/pipeline",   // stages — changes maybe once a month
  "/api/team",       // team members — changes rarely
];

/** Preload on desktop: populate SQLite cache with latest server data. */
async function warmDesktopCache(): Promise<void> {
  const store = await getCacheStore();

  // Fetch all warmup endpoints in parallel
  const results = await Promise.allSettled(
    WARMUP_ENDPOINTS.map((url) =>
      fetch(url)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data) return store.setCached(url, data);
        })
    )
  );

  // Also warm deals + contacts into SQLite
  const [dealsRes, contactsRes] = await Promise.allSettled([
    fetch("/api/deals").then((r) => (r.ok ? r.json() : null)),
    fetch("/api/contacts?limit=100&offset=0").then((r) => (r.ok ? r.json() : null)),
  ]);

  if (dealsRes.status === "fulfilled" && dealsRes.value?.deals) {
    await store.storeDeals(dealsRes.value.deals).catch(() => {});
  }
  if (contactsRes.status === "fulfilled" && contactsRes.value?.contacts) {
    await store.storeContacts(contactsRes.value.contacts).catch(() => {});
  }
}

/** Preload on web: just hit the endpoints to prime the SW cache. */
async function warmWebCache(): Promise<void> {
  await Promise.allSettled(
    WARMUP_ENDPOINTS.map((url) => fetch(url).catch(() => {}))
  );
}

/**
 * Hook that runs once on app startup to preload data.
 * Call this in the app shell (AppShellInner or equivalent).
 */
export function useAppWarmup(): void {
  const ran = React.useRef(false);

  React.useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    // Non-blocking — don't delay app render
    if (isDesktop) {
      warmDesktopCache().catch(() => {});
    } else {
      warmWebCache().catch(() => {});
    }
  }, []);
}
