import type { StorageAdapter } from "./storage-adapter";
import { LocalStorageAdapter } from "./storage-adapter";

let _adapter: StorageAdapter | null = null;

/**
 * Set the global storage adapter used throughout the builder package.
 * Call this early (e.g. in your app entrypoint) to override the default.
 */
export function setStorageAdapter(adapter: StorageAdapter): void {
  _adapter = adapter;
}

/**
 * Get the current storage adapter (async interface).
 * Lazily defaults to `LocalStorageAdapter` if none has been set.
 */
export function getStorageAdapter(): StorageAdapter {
  if (!_adapter) {
    _adapter = new LocalStorageAdapter();
  }
  return _adapter;
}

// ── Sync compatibility layer ──────────────────────────────────────
//
// Many existing modules (use-workspaces, credential-store, flow-templates,
// builder-templates, user-nodes) use synchronous localStorage calls.
// Converting them all to async would break every component that calls them.
//
// This sync bridge provides localStorage-compatible access that routes
// through the adapter concept — when someone overrides the adapter to
// IndexedDB, they should also migrate the calling code to async.
// For now, the sync bridge ensures existing code works and new code
// can opt-in to the async adapter.

/**
 * Synchronous storage access for backward-compatible modules.
 * Uses localStorage directly (SSR-safe). When a non-localStorage adapter
 * is configured, callers should migrate to the async `getStorageAdapter()`.
 */
let _syncWarned = false;
function warnIfCustomAdapter(): void {
  if (!_syncWarned && _adapter && !(_adapter instanceof LocalStorageAdapter)) {
    _syncWarned = true;
    console.warn(
      "[@supra/builder] syncStorage is being used but a non-localStorage adapter is configured. " +
      "Sync operations bypass the custom adapter. Migrate callers to async getStorageAdapter()."
    );
  }
}

export const syncStorage = {
  getItem(key: string): string | null {
    warnIfCustomAdapter();
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(key);
  },
  setItem(key: string, value: string): void {
    warnIfCustomAdapter();
    if (typeof window === "undefined") return;
    window.localStorage.setItem(key, value);
  },
  removeItem(key: string): void {
    warnIfCustomAdapter();
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(key);
  },
};
