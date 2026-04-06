/**
 * Cache store adapter interface.
 *
 * Abstracts local data caching so the same app code works in both
 * browser (IndexedDB) and desktop (SQLite via Tauri).
 */

export interface ApiCacheEntry {
  url: string;
  data: unknown;
  timestamp: number;
  etag: string | null;
}

export interface CachedResult {
  data: unknown;
  timestamp: number;
  isStale: boolean;
}

export interface PendingAction {
  id?: number;
  type: string;
  url: string;
  method: string;
  body: unknown;
  createdAt: number;
}

export interface DealRecord {
  id: string;
  [key: string]: unknown;
}

export interface ContactRecord {
  id: string;
  [key: string]: unknown;
}

export interface MessageRecord {
  id: string;
  chatId: string;
  text: string;
  date: number;
  [key: string]: unknown;
}

export interface EmailThreadRecord {
  id: string;
  folder: string;
  subject: string;
  snippet: string;
  date: number;
  [key: string]: unknown;
}

export interface CacheStore {
  // ── API response cache ──────────────────────────────────
  getCached(url: string, maxAgeMs: number): Promise<CachedResult | null>;
  setCached(url: string, data: unknown, etag?: string | null): Promise<void>;

  // ── Pending offline actions ─────────────────────────────
  addPendingAction(action: Omit<PendingAction, "id" | "createdAt">): Promise<number>;
  getPendingActions(): Promise<PendingAction[]>;
  removePendingAction(id: number): Promise<void>;
  getPendingActionCount(): Promise<number>;

  // ── Deals ───────────────────────────────────────────────
  storeDeal(deal: DealRecord): Promise<void>;
  storeDeals(deals: DealRecord[]): Promise<void>;
  getDeal(id: string): Promise<DealRecord | null>;
  getAllDeals(): Promise<DealRecord[]>;

  // ── Contacts ────────────────────────────────────────────
  storeContact(contact: ContactRecord): Promise<void>;
  storeContacts(contacts: ContactRecord[]): Promise<void>;
  getAllContacts(): Promise<ContactRecord[]>;

  // ── Messages (desktop-enhanced) ─────────────────────────
  storeMessages(chatId: string, messages: MessageRecord[]): Promise<void>;
  getMessages(chatId: string, limit: number): Promise<MessageRecord[]>;

  // ── Email threads (desktop-enhanced) ────────────────────
  storeEmailThreads(folder: string, threads: EmailThreadRecord[]): Promise<void>;
  getEmailThreads(folder: string, limit: number): Promise<EmailThreadRecord[]>;

  // ── Maintenance ─────────────────────────────────────────
  clearAll(): Promise<void>;
}
