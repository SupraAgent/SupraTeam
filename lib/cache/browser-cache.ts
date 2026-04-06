/**
 * Browser cache — wraps existing IndexedDB offline store.
 *
 * Delegates to lib/client/tma-idb-store.ts for API cache, pending actions,
 * deals, and contacts. Messages and email threads are no-ops in browser
 * (those features are desktop-enhanced only).
 */

"use client";

import {
  getCached as idbGetCached,
  setCached as idbSetCached,
  addPendingAction as idbAddPending,
  getPendingActions as idbGetPending,
  removePendingAction as idbRemovePending,
  getPendingActionCount as idbPendingCount,
  storeDeal as idbStoreDeal,
  storeDeals as idbStoreDeals,
  getDeal as idbGetDeal,
  getAllDeals as idbGetAllDeals,
  storeContact as idbStoreContact,
  storeContacts as idbStoreContacts,
  getAllContacts as idbGetAllContacts,
  clearOfflineData as idbClearAll,
} from "../client/tma-idb-store";
import type {
  CacheStore,
  CachedResult,
  PendingAction,
  DealRecord,
  ContactRecord,
  MessageRecord,
  EmailThreadRecord,
} from "./types";

export const browserCacheStore: CacheStore = {
  // ── API cache ───────────────────────────────────────────
  async getCached(url: string, maxAgeMs: number): Promise<CachedResult | null> {
    return idbGetCached(url, maxAgeMs);
  },

  async setCached(url: string, data: unknown, etag?: string | null): Promise<void> {
    await idbSetCached(url, data, etag);
  },

  // ── Pending actions ─────────────────────────────────────
  async addPendingAction(action: Omit<PendingAction, "id" | "createdAt">): Promise<number> {
    return idbAddPending(action);
  },

  async getPendingActions(): Promise<PendingAction[]> {
    return idbGetPending();
  },

  async removePendingAction(id: number): Promise<void> {
    await idbRemovePending(id);
  },

  async getPendingActionCount(): Promise<number> {
    return idbPendingCount();
  },

  // ── Deals ───────────────────────────────────────────────
  async storeDeal(deal: DealRecord): Promise<void> {
    await idbStoreDeal(deal);
  },

  async storeDeals(deals: DealRecord[]): Promise<void> {
    await idbStoreDeals(deals);
  },

  async getDeal(id: string): Promise<DealRecord | null> {
    return idbGetDeal(id);
  },

  async getAllDeals(): Promise<DealRecord[]> {
    return idbGetAllDeals();
  },

  // ── Contacts ────────────────────────────────────────────
  async storeContact(contact: ContactRecord): Promise<void> {
    await idbStoreContact(contact);
  },

  async storeContacts(contacts: ContactRecord[]): Promise<void> {
    await idbStoreContacts(contacts);
  },

  async getAllContacts(): Promise<ContactRecord[]> {
    return idbGetAllContacts();
  },

  // ── Messages (desktop-only, no-op in browser) ──────────
  async storeMessages(_chatId: string, _messages: MessageRecord[]): Promise<void> {
    // No-op: browser does not persist messages locally
  },

  async getMessages(_chatId: string, _limit: number): Promise<MessageRecord[]> {
    return [];
  },

  // ── Email threads (desktop-only, no-op in browser) ─────
  async storeEmailThreads(_folder: string, _threads: EmailThreadRecord[]): Promise<void> {
    // No-op: browser does not persist email threads locally
  },

  async getEmailThreads(_folder: string, _limit: number): Promise<EmailThreadRecord[]> {
    return [];
  },

  // ── Maintenance ─────────────────────────────────────────
  async clearAll(): Promise<void> {
    await idbClearAll();
  },
};
