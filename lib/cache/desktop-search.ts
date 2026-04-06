/**
 * Desktop-only full-text search via SQLite FTS5.
 *
 * On web, these functions return empty results — search falls through
 * to the server-side API. On desktop, they query the local SQLite cache
 * for instant results without network roundtrip.
 */

"use client";

import { isDesktop } from "@/lib/platform";
import { invoke } from "@/lib/platform/tauri-invoke";

export interface LocalSearchResult {
  id: string;
  snippet: string;
  data: unknown;
}

/**
 * Search messages locally using FTS5. Returns empty on web.
 * Queries: message text across all cached conversations.
 */
export async function searchMessagesLocal(
  query: string,
  limit = 50
): Promise<LocalSearchResult[]> {
  if (!isDesktop || query.length < 2) return [];
  try {
    const rows = await invoke<Array<{ id: string; snippet: string; data: string }>>(
      "cache_search_messages",
      { query, limit }
    );
    return rows.map((r) => {
      let data: unknown;
      try { data = JSON.parse(r.data); } catch { data = null; }
      return { id: r.id, snippet: r.snippet, data };
    });
  } catch {
    return [];
  }
}

/**
 * Search contacts locally using FTS5. Returns empty on web.
 * Queries: name, company, email.
 */
export async function searchContactsLocal(
  query: string,
  limit = 50
): Promise<LocalSearchResult[]> {
  if (!isDesktop || query.length < 2) return [];
  try {
    const rows = await invoke<Array<{ id: string; snippet: string; data: string }>>(
      "cache_search_contacts",
      { query, limit }
    );
    return rows.map((r) => {
      let data: unknown;
      try { data = JSON.parse(r.data); } catch { data = null; }
      return { id: r.id, snippet: r.snippet, data };
    });
  } catch {
    return [];
  }
}

/**
 * Search deals locally using FTS5. Returns empty on web.
 * Queries: deal_name, contact_name, company.
 */
export async function searchDealsLocal(
  query: string,
  limit = 50
): Promise<LocalSearchResult[]> {
  if (!isDesktop || query.length < 2) return [];
  try {
    const rows = await invoke<Array<{ id: string; snippet: string; data: string }>>(
      "cache_search_deals",
      { query, limit }
    );
    return rows.map((r) => {
      let data: unknown;
      try { data = JSON.parse(r.data); } catch { data = null; }
      return { id: r.id, snippet: r.snippet, data };
    });
  } catch {
    return [];
  }
}
