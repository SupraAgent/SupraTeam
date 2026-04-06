/**
 * Tauri cache — SQLite-backed local storage via Tauri plugin.
 *
 * Advantages over browser IndexedDB:
 *   - No storage quota or eviction
 *   - Full-text search (FTS5)
 *   - Survives browser data clears
 *   - Faster for large datasets
 *
 * Tables are created lazily on first access via the init() call.
 * All data is stored in the app's data directory (platform-specific).
 */

"use client";

import type {
  CacheStore,
  CachedResult,
  PendingAction,
  DealRecord,
  ContactRecord,
  MessageRecord,
  EmailThreadRecord,
} from "./types";
import { invoke } from "../platform/tauri-invoke";

let initialized = false;

/** Ensure SQLite tables exist. Idempotent. */
async function init(): Promise<void> {
  if (initialized) return;
  await invoke("cache_init");
  initialized = true;
}

export const tauriCacheStore: CacheStore = {
  // ── API cache ───────────────────────────────────────────
  async getCached(url: string, maxAgeMs: number): Promise<CachedResult | null> {
    await init();
    const entry = await invoke<{
      data: string;
      timestamp: number;
      etag: string | null;
    } | null>("cache_get_api", { url });

    if (!entry) return null;

    let parsed: unknown;
    try {
      parsed = JSON.parse(entry.data);
    } catch {
      // Corrupted cache entry — treat as miss
      return null;
    }

    const age = Date.now() - entry.timestamp;
    return {
      data: parsed,
      timestamp: entry.timestamp,
      isStale: age > maxAgeMs,
    };
  },

  async setCached(url: string, data: unknown, etag?: string | null): Promise<void> {
    await init();
    await invoke("cache_set_api", {
      url,
      data: JSON.stringify(data),
      timestamp: Date.now(),
      etag: etag ?? null,
    });
  },

  // ── Pending actions ─────────────────────────────────────
  async addPendingAction(action: Omit<PendingAction, "id" | "createdAt">): Promise<number> {
    await init();
    return invoke<number>("cache_add_pending_action", {
      actionType: action.type,
      url: action.url,
      method: action.method,
      body: JSON.stringify(action.body),
      createdAt: Date.now(),
    });
  },

  async getPendingActions(): Promise<PendingAction[]> {
    await init();
    const rows = await invoke<Array<{
      id: number;
      action_type: string;
      url: string;
      method: string;
      body: string;
      created_at: number;
    }>>("cache_get_pending_actions");

    return rows.map((r) => ({
      id: r.id,
      type: r.action_type,
      url: r.url,
      method: r.method,
      body: JSON.parse(r.body),
      createdAt: r.created_at,
    }));
  },

  async removePendingAction(id: number): Promise<void> {
    await init();
    await invoke("cache_remove_pending_action", { id });
  },

  async getPendingActionCount(): Promise<number> {
    await init();
    return invoke<number>("cache_get_pending_action_count");
  },

  // ── Deals ───────────────────────────────────────────────
  async storeDeal(deal: DealRecord): Promise<void> {
    await init();
    await invoke("cache_store_deal", { id: deal.id, data: JSON.stringify(deal) });
  },

  async storeDeals(deals: DealRecord[]): Promise<void> {
    await init();
    await invoke("cache_store_deals", {
      deals: deals.map((d) => ({ id: d.id, data: JSON.stringify(d) })),
    });
  },

  async getDeal(id: string): Promise<DealRecord | null> {
    await init();
    const data = await invoke<string | null>("cache_get_deal", { id });
    if (!data) return null;
    try {
      return JSON.parse(data) as DealRecord;
    } catch {
      return null;
    }
  },

  async getAllDeals(): Promise<DealRecord[]> {
    await init();
    const rows = await invoke<Array<{ data: string }>>("cache_get_all_deals");
    return rows.map((r) => JSON.parse(r.data) as DealRecord);
  },

  // ── Contacts ────────────────────────────────────────────
  async storeContact(contact: ContactRecord): Promise<void> {
    await init();
    await invoke("cache_store_contact", {
      id: contact.id,
      data: JSON.stringify(contact),
    });
  },

  async storeContacts(contacts: ContactRecord[]): Promise<void> {
    await init();
    await invoke("cache_store_contacts", {
      contacts: contacts.map((c) => ({ id: c.id, data: JSON.stringify(c) })),
    });
  },

  async getAllContacts(): Promise<ContactRecord[]> {
    await init();
    const rows = await invoke<Array<{ data: string }>>("cache_get_all_contacts");
    return rows.map((r) => JSON.parse(r.data) as ContactRecord);
  },

  // ── Messages (desktop-enhanced) ─────────────────────────
  async storeMessages(chatId: string, messages: MessageRecord[]): Promise<void> {
    await init();
    await invoke("cache_store_messages", {
      chatId,
      messages: messages.map((m) => ({
        id: m.id,
        chatId: m.chatId,
        text: m.text,
        date: m.date,
        data: JSON.stringify(m),
      })),
    });
  },

  async getMessages(chatId: string, limit: number): Promise<MessageRecord[]> {
    await init();
    const rows = await invoke<Array<{ data: string }>>("cache_get_messages", {
      chatId,
      limit,
    });
    return rows.map((r) => JSON.parse(r.data) as MessageRecord);
  },

  // ── Email threads (desktop-enhanced) ────────────────────
  async storeEmailThreads(
    folder: string,
    threads: EmailThreadRecord[]
  ): Promise<void> {
    await init();
    await invoke("cache_store_email_threads", {
      folder,
      threads: threads.map((t) => ({
        id: t.id,
        folder: t.folder,
        subject: t.subject,
        snippet: t.snippet,
        date: t.date,
        data: JSON.stringify(t),
      })),
    });
  },

  async getEmailThreads(
    folder: string,
    limit: number
  ): Promise<EmailThreadRecord[]> {
    await init();
    const rows = await invoke<Array<{ data: string }>>(
      "cache_get_email_threads",
      { folder, limit }
    );
    return rows.map((r) => JSON.parse(r.data) as EmailThreadRecord);
  },

  // ── Maintenance ─────────────────────────────────────────
  async clearAll(): Promise<void> {
    await init();
    await invoke("cache_clear_all");
    initialized = false;
  },
};
