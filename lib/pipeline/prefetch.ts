/**
 * Pipeline prefetch hooks — mirrors email module's prefetch patterns.
 *
 * - useDealCache(): module-level deal detail cache with TTL + LRU eviction
 * - usePrefetchDeal(): prefetch deal detail on hover (notes, activity, etc.)
 * - useBatchPrefetchDeals(): prefetch first N deals on list load
 * - useDealDetailFromCache(): read cached deal detail for instant panel open
 */

"use client";

import * as React from "react";
import type { Deal } from "@/lib/types";

// ── Module-level cache (same pattern as email/hooks.ts) ──────

interface DealDetail {
  deal: Deal;
  notes: unknown[];
  activities: unknown[];
  linkedChats: unknown[];
  linkedEmails: unknown[];
}

const dealDetailCache = new Map<string, { data: DealDetail; ts: number }>();
const CACHE_TTL = 60_000; // 60s stale window — deals change more often than email
const PREFETCH_BATCH = 5;
const CACHE_MAX = 200;

function evictIfNeeded() {
  if (dealDetailCache.size <= CACHE_MAX) return;
  const toDelete = dealDetailCache.size - CACHE_MAX;
  let i = 0;
  for (const key of dealDetailCache.keys()) {
    if (i++ >= toDelete) break;
    dealDetailCache.delete(key);
  }
}

/** Check if a deal is cached and fresh. */
export function getCachedDealDetail(dealId: string): DealDetail | null {
  const entry = dealDetailCache.get(dealId);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL) return null;
  return entry.data;
}

/** Prefetch a single deal's detail data (notes, activity, linked chats/emails). */
async function prefetchDeal(dealId: string): Promise<void> {
  // Skip if already cached and fresh
  if (getCachedDealDetail(dealId)) return;

  try {
    const [dealRes, notesRes, activityRes, chatsRes, emailsRes] = await Promise.all([
      fetch(`/api/deals/${dealId}`).then((r) => (r.ok ? r.json() : null)),
      fetch(`/api/deals/${dealId}/notes`).then((r) => (r.ok ? r.json() : null)),
      fetch(`/api/deals/${dealId}/activity`).then((r) => (r.ok ? r.json() : null)),
      fetch(`/api/deals/${dealId}/linked-chats`).then((r) => (r.ok ? r.json() : null)),
      fetch(`/api/deals/${dealId}/email-threads`).then((r) => (r.ok ? r.json() : null)),
    ]);

    if (dealRes) {
      dealDetailCache.set(dealId, {
        data: {
          deal: dealRes,
          notes: notesRes?.notes ?? [],
          activities: activityRes?.activities ?? [],
          linkedChats: chatsRes?.data ?? [],
          linkedEmails: emailsRes?.data ?? [],
        },
        ts: Date.now(),
      });
      evictIfNeeded();
    }
  } catch {
    // Prefetch failure is non-critical
  }
}

/**
 * Returns a callback to prefetch deal detail on hover.
 * Call this in the Kanban board component.
 */
export function usePrefetchDeal() {
  return React.useCallback((dealId: string) => {
    if (dealId.startsWith("sample-")) return;
    prefetchDeal(dealId);
  }, []);
}

/**
 * Prefetch first N deals' detail data on list load.
 * Fires once per unique deal list (tracked by ID hash).
 */
export function useBatchPrefetchDeals(deals: Deal[]) {
  const prefetchedRef = React.useRef(new Set<string>());

  const depKey = deals
    .slice(0, PREFETCH_BATCH)
    .map((d) => d.id)
    .join(",");

  React.useEffect(() => {
    if (deals.length === 0) return;

    const toPrefetch = deals
      .filter((d) => !d.id.startsWith("sample-"))
      .slice(0, PREFETCH_BATCH)
      .filter((d) => {
        if (prefetchedRef.current.has(d.id)) return false;
        return !getCachedDealDetail(d.id);
      });

    toPrefetch.forEach((d) => {
      prefetchedRef.current.add(d.id);
      prefetchDeal(d.id);
    });
  }, [depKey]); // eslint-disable-line react-hooks/exhaustive-deps
}
