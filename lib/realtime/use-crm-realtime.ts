/**
 * Supabase Realtime subscriptions for CRM data.
 *
 * Subscribes to INSERT/UPDATE/DELETE on crm_deals and crm_contacts,
 * calling the provided callbacks when changes arrive. This reduces
 * reliance on polling — pages get near-instant updates.
 *
 * On desktop, also writes changes to the SQLite cache so the next
 * page load sees fresh data instantly.
 */

"use client";

import * as React from "react";
import { createClient } from "@/lib/supabase/client";
import { isDesktop } from "@/lib/platform";
import { getCacheStore } from "@/lib/cache";
import type { Deal, Contact } from "@/lib/types";

interface UseCrmRealtimeOptions {
  /** Called when any deal is inserted, updated, or deleted. */
  onDealChange?: (payload: { eventType: string; new: Partial<Deal>; old: { id: string } }) => void;
  /** Called when any contact is inserted, updated, or deleted. */
  onContactChange?: (payload: { eventType: string; new: Partial<Contact>; old: { id: string } }) => void;
  /** Whether subscriptions are active. */
  enabled?: boolean;
}

/**
 * Subscribe to real-time CRM data changes via Supabase Realtime.
 * Automatically syncs changes to desktop SQLite cache.
 */
export function useCrmRealtime({
  onDealChange,
  onContactChange,
  enabled = true,
}: UseCrmRealtimeOptions = {}) {
  const onDealChangeRef = React.useRef(onDealChange);
  const onContactChangeRef = React.useRef(onContactChange);
  onDealChangeRef.current = onDealChange;
  onContactChangeRef.current = onContactChange;

  React.useEffect(() => {
    if (!enabled) return;

    const supabase = createClient();
    if (!supabase) return;
    const channel = supabase.channel("crm-realtime");

    // Subscribe to deal changes
    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "crm_deals" },
      (payload) => {
        const eventType = payload.eventType;
        const newRecord = payload.new as Partial<Deal>;
        const oldRecord = payload.old as { id: string };

        onDealChangeRef.current?.({ eventType, new: newRecord, old: oldRecord });

        // Update desktop cache
        if (isDesktop && newRecord.id) {
          getCacheStore()
            .then((store) => {
              if (eventType === "DELETE") {
                // Can't delete individual items from current interface,
                // but the next full sync will clean it up
                return;
              }
              return store.storeDeal(newRecord as import("@/lib/cache").DealRecord);
            })
            .catch(() => {});
        }
      }
    );

    // Subscribe to contact changes
    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "crm_contacts" },
      (payload) => {
        const eventType = payload.eventType;
        const newRecord = payload.new as Partial<Contact>;
        const oldRecord = payload.old as { id: string };

        onContactChangeRef.current?.({ eventType, new: newRecord, old: oldRecord });

        // Update desktop cache
        if (isDesktop && newRecord.id) {
          getCacheStore()
            .then((store) => {
              if (eventType === "DELETE") return;
              return store.storeContact(newRecord as import("@/lib/cache").ContactRecord);
            })
            .catch(() => {});
        }
      }
    );

    channel.subscribe();

    return () => {
      supabase?.removeChannel(channel);
    };
  }, [enabled]);
}
