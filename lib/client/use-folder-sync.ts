"use client";

import * as React from "react";
import { TelegramBrowserService, type TgDialog } from "./telegram-service";

interface FolderSync {
  id: string;
  slug: string;
  tg_filter_id: number;
  folder_name: string;
  sync_status: string;
  last_synced_at: string | null;
}

export function useFolderSync(tgConnected: boolean) {
  const [syncs, setSyncs] = React.useState<FolderSync[]>([]);
  const [loadingSlugs, setLoadingSlugs] = React.useState<Set<string>>(new Set());
  const activeSlugsRef = React.useRef<Set<string>>(new Set());

  const setSlugLoading = React.useCallback((slug: string, isLoading: boolean) => {
    if (isLoading) {
      activeSlugsRef.current.add(slug);
    } else {
      activeSlugsRef.current.delete(slug);
    }
    setLoadingSlugs(new Set(activeSlugsRef.current));
  }, []);

  // Load existing sync mappings
  const fetchSyncs = React.useCallback(async () => {
    try {
      const res = await fetch("/api/telegram-folders");
      if (res.ok) {
        const data = await res.json();
        setSyncs(data.syncs ?? []);
      }
    } catch {
      // Silent fail — non-critical
    }
  }, []);

  React.useEffect(() => {
    fetchSyncs();
  }, [fetchSyncs]);

  /** Check if a slug has folder sync enabled. */
  function isSynced(slug: string): boolean {
    return syncs.some((s) => s.slug === slug && s.sync_status === "active");
  }

  /** Get sync info for a slug. */
  function getSyncInfo(slug: string): FolderSync | undefined {
    return syncs.find((s) => s.slug === slug);
  }

  /** Resolve peers for a slug from dialog cache. */
  async function resolveSlugPeers(
    slug: string,
    service: TelegramBrowserService
  ): Promise<Array<{ type: "user" | "chat" | "channel"; id: number; accessHash?: string }>> {
    const groupsRes = await fetch(`/api/telegram-folders/groups?slug=${encodeURIComponent(slug)}`);
    if (!groupsRes.ok) throw new Error("Failed to fetch slug groups");
    const { groups } = await groupsRes.json();

    if (!groups.length) throw new Error("No groups found for this slug");

    const dialogs = await service.getDialogs(200);
    const dialogMap = new Map<number, TgDialog>();
    for (const d of dialogs) dialogMap.set(d.telegramId, d);

    const peers: Array<{ type: "user" | "chat" | "channel"; id: number; accessHash?: string }> = [];
    for (const g of groups) {
      const tgId = Number(g.telegram_group_id);
      if (!tgId || !isFinite(tgId)) continue;

      const dialog = dialogMap.get(tgId);
      const groupType = g.group_type ?? dialog?.type ?? "supergroup";

      peers.push({
        type: groupType === "group" ? "chat" : "channel",
        id: tgId,
        accessHash: dialog?.accessHash,
      });
    }

    if (!peers.length) throw new Error("Could not resolve any group peers");
    return peers;
  }

  /** Enable folder sync for a slug. Creates the TG folder and persists mapping. */
  async function enableSync(slug: string): Promise<void> {
    if (!tgConnected || activeSlugsRef.current.has(slug)) return;
    setSlugLoading(slug, true);

    try {
      const service = TelegramBrowserService.getInstance();

      // Find an available filter ID
      const existingFolders = await service.getDialogFilters();
      const usedIds = new Set(existingFolders.map((f) => f.id));
      const folderName = `CRM: ${slug}`;
      const existing = existingFolders.find((f) => f.title === folderName);
      let filterId = existing?.id ?? 0;

      if (!filterId) {
        for (let i = 2; i <= 255; i++) {
          if (!usedIds.has(i)) { filterId = i; break; }
        }
        if (!filterId) throw new Error("No available folder slots (max 254 folders)");
      }

      const peers = await resolveSlugPeers(slug, service);
      await service.updateDialogFilter({ id: filterId, title: folderName, peers });

      const saveRes = await fetch("/api/telegram-folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, tg_filter_id: filterId, folder_name: folderName }),
      });
      if (!saveRes.ok) throw new Error("Failed to save folder sync mapping");

      await fetchSyncs();
    } catch (err) {
      // Record error state in DB
      await fetch("/api/telegram-folders/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          error_message: err instanceof Error ? err.message : "Enable sync failed",
        }),
      }).catch(() => {});
      await fetchSyncs();
      throw err;
    } finally {
      setSlugLoading(slug, false);
    }
  }

  /** Re-sync an existing folder (update peers to match current slug groups). */
  async function resyncFolder(slug: string): Promise<void> {
    if (!tgConnected || activeSlugsRef.current.has(slug)) return;
    const syncInfo = syncs.find((s) => s.slug === slug);
    if (!syncInfo) return;

    setSlugLoading(slug, true);

    try {
      const service = TelegramBrowserService.getInstance();
      const peers = await resolveSlugPeers(slug, service);

      await service.updateDialogFilter({
        id: syncInfo.tg_filter_id,
        title: syncInfo.folder_name,
        peers,
      });

      await fetch("/api/telegram-folders/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug }),
      });

      await fetchSyncs();
    } catch (err) {
      await fetch("/api/telegram-folders/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          error_message: err instanceof Error ? err.message : "Sync failed",
        }),
      }).catch(() => {});
      await fetchSyncs();
      throw err;
    } finally {
      setSlugLoading(slug, false);
    }
  }

  /** Disable folder sync — delete the TG folder and remove mapping. */
  async function disableSync(slug: string): Promise<void> {
    if (!tgConnected || activeSlugsRef.current.has(slug)) return;
    const syncInfo = syncs.find((s) => s.slug === slug);
    if (!syncInfo) return;

    setSlugLoading(slug, true);

    try {
      const service = TelegramBrowserService.getInstance();
      await service.deleteDialogFilter(syncInfo.tg_filter_id);

      await fetch("/api/telegram-folders", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug }),
      });

      await fetchSyncs();
    } finally {
      setSlugLoading(slug, false);
    }
  }

  /** Check if a specific slug is currently loading. */
  function isSlugLoading(slug: string): boolean {
    return loadingSlugs.has(slug);
  }

  return { syncs, loadingSlugs, isSynced, getSyncInfo, isSlugLoading, enableSync, resyncFolder, disableSync, fetchSyncs };
}
