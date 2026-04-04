"use client";

import * as React from "react";
import {
  TelegramBrowserService,
  type TgFolder,
  type TgDialog,
} from "./telegram-service";

// ── Types ─────────────────────────────────────────────────────

interface SyncedFolder {
  id: string;
  user_id: string;
  telegram_folder_id: number;
  folder_name: string;
  folder_emoji: string | null;
  include_peers: number[];
  exclude_peers: number[];
  is_synced: boolean;
  sync_interval_minutes: number;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
  chat_count: number;
  unread_total: number;
}

interface FolderChat {
  id: string;
  folder_id: string;
  chat_id: number;
  chat_title: string | null;
  chat_type: string | null;
  unread_count: number;
  last_message_at: string | null;
  is_pinned: boolean;
  created_at: string;
  linked_deals: { id: string; deal_name: string; board_type: string }[];
}

interface ChatSyncPayload {
  chat_id: number;
  chat_title: string;
  chat_type: string;
  unread_count: number;
  last_message_at: string | null;
  is_pinned: boolean;
}

interface FolderSyncPayload {
  telegram_folder_id: number;
  folder_name: string;
  folder_emoji?: string;
  include_peers: number[];
  exclude_peers: number[];
  chats: ChatSyncPayload[];
}

// ── Exported types ────────────────────────────────────────────

export type { SyncedFolder, FolderChat, ChatSyncPayload, FolderSyncPayload };

// ── Sync helpers ──────────────────────────────────────────────

/**
 * Map a TG folder + dialog list into a payload ready for the server API.
 * GramJS DialogFilter only gives us peer IDs; we resolve titles from dialogs.
 */
export function buildFolderSyncPayload(
  folder: TgFolder,
  dialogs: TgDialog[],
): FolderSyncPayload {
  const dialogMap = new Map<number, TgDialog>();
  for (const d of dialogs) {
    dialogMap.set(d.telegramId, d);
  }

  const chats: ChatSyncPayload[] = folder.includePeerIds
    .map((peerId) => {
      const dialog = dialogMap.get(peerId);
      return {
        chat_id: peerId,
        chat_title: dialog?.title ?? `Chat ${peerId}`,
        chat_type: dialog?.type ?? "unknown",
        unread_count: dialog?.unreadCount ?? 0,
        last_message_at: dialog?.lastMessage?.date
          ? new Date(dialog.lastMessage.date * 1000).toISOString()
          : null,
        is_pinned: false,
      };
    });

  return {
    telegram_folder_id: folder.id,
    folder_name: folder.title,
    include_peers: folder.includePeerIds,
    exclude_peers: [],
    chats,
  };
}

/** Push a single folder's data to the server. */
export async function syncFolderToServer(payload: FolderSyncPayload): Promise<SyncedFolder> {
  const res = await fetch("/api/telegram/folders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(err.error ?? "Failed to sync folder");
  }

  const json = await res.json();
  return json.data;
}

/** Fetch chats for a specific folder from the server. */
export async function fetchFolderChats(folderId: string): Promise<FolderChat[]> {
  const res = await fetch(`/api/telegram/folders/${folderId}/chats`);
  if (!res.ok) return [];
  const json = await res.json();
  return json.data ?? [];
}

/** Update chat metadata for a folder via bulk POST. */
export async function pushChatUpdates(
  folderId: string,
  chats: ChatSyncPayload[],
): Promise<void> {
  const res = await fetch(`/api/telegram/folders/${folderId}/chats`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chats }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(err.error ?? "Failed to push chat updates");
  }
}

// ── Hook ──────────────────────────────────────────────────────

export function useTelegramFolders() {
  const [folders, setFolders] = React.useState<SyncedFolder[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [syncing, setSyncing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const syncIntervalRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  /** Fetch synced folders from server DB. */
  const fetchFolders = React.useCallback(async () => {
    try {
      const res = await fetch("/api/telegram/folders");
      if (!res.ok) throw new Error("Failed to fetch folders");
      const json = await res.json();
      setFolders(json.data ?? []);
      setError(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to fetch folders";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchFolders();
  }, [fetchFolders]);

  /**
   * Fetch all TG folders from Telegram via GramJS and push them to the server.
   * This is the main sync operation triggered by "Sync Now" or auto-sync.
   */
  const syncAllFolders = React.useCallback(async () => {
    setSyncing(true);
    setError(null);

    try {
      const service = TelegramBrowserService.getInstance();
      if (!service.connected) {
        throw new Error("Telegram not connected");
      }

      const [tgFolders, dialogs] = await Promise.all([
        service.getDialogFilters(),
        service.getDialogs(200),
      ]);

      for (const folder of tgFolders) {
        const payload = buildFolderSyncPayload(folder, dialogs);
        await syncFolderToServer(payload);
      }

      await fetchFolders();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Sync failed";
      setError(msg);
      throw err;
    } finally {
      setSyncing(false);
    }
  }, [fetchFolders]);

  /** Sync a single folder by its TG folder ID. */
  const syncSingleFolder = React.useCallback(async (telegramFolderId: number) => {
    setSyncing(true);
    setError(null);

    try {
      const service = TelegramBrowserService.getInstance();
      if (!service.connected) {
        throw new Error("Telegram not connected");
      }

      const tgFolders = await service.getDialogFilters();
      const folder = tgFolders.find((f) => f.id === telegramFolderId);
      if (!folder) throw new Error("Folder not found in Telegram");

      const dialogs = await service.getDialogs(200);
      const payload = buildFolderSyncPayload(folder, dialogs);
      await syncFolderToServer(payload);

      await fetchFolders();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Sync failed";
      setError(msg);
      throw err;
    } finally {
      setSyncing(false);
    }
  }, [fetchFolders]);

  /** Start periodic sync at a given interval (ms). */
  const startFolderSync = React.useCallback((intervalMs: number = 30 * 60 * 1000) => {
    // Clear existing interval
    if (syncIntervalRef.current) {
      clearInterval(syncIntervalRef.current);
    }

    syncIntervalRef.current = setInterval(() => {
      syncAllFolders().catch(() => {
        // Errors are captured in state, no need to rethrow from interval
      });
    }, intervalMs);
  }, [syncAllFolders]);

  /** Stop periodic sync. */
  const stopFolderSync = React.useCallback(() => {
    if (syncIntervalRef.current) {
      clearInterval(syncIntervalRef.current);
      syncIntervalRef.current = null;
    }
  }, []);

  // Cleanup on unmount
  React.useEffect(() => {
    return () => {
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
      }
    };
  }, []);

  /** Update folder settings (auto-sync, interval, etc.) */
  const updateFolder = React.useCallback(async (
    folderId: string,
    updates: { is_synced?: boolean; sync_interval_minutes?: number; folder_name?: string },
  ) => {
    const res = await fetch("/api/telegram/folders", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: folderId, ...updates }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Unknown error" }));
      throw new Error(err.error ?? "Failed to update folder");
    }

    await fetchFolders();
  }, [fetchFolders]);

  /** Remove a synced folder. */
  const removeFolder = React.useCallback(async (folderId: string) => {
    const res = await fetch("/api/telegram/folders", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: folderId }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Unknown error" }));
      throw new Error(err.error ?? "Failed to remove folder");
    }

    await fetchFolders();
  }, [fetchFolders]);

  /** Fetch available TG folders (not yet synced). */
  const fetchAvailableFolders = React.useCallback(async (): Promise<TgFolder[]> => {
    const service = TelegramBrowserService.getInstance();
    if (!service.connected) throw new Error("Telegram not connected");

    const tgFolders = await service.getDialogFilters();
    const syncedIds = new Set(folders.map((f) => f.telegram_folder_id));

    return tgFolders.filter((f) => !syncedIds.has(f.id));
  }, [folders]);

  return {
    folders,
    loading,
    syncing,
    error,
    fetchFolders,
    syncAllFolders,
    syncSingleFolder,
    startFolderSync,
    stopFolderSync,
    updateFolder,
    removeFolder,
    fetchAvailableFolders,
  };
}
