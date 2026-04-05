"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTelegram } from "@/lib/client/telegram-context";
import type { TgFolder, TgDialog } from "@/lib/client/telegram-service";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  FolderSync,
  Loader2,
  ChevronDown,
  RefreshCw,
  Check,
  AlertCircle,
  Plus,
  WifiOff,
  Folder,
  Users,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────

interface PipelineStage {
  id: string;
  name: string;
  position: number;
  color: string | null;
}

interface FolderMapping {
  id?: string;
  tg_folder_id: number;
  folder_title: string;
  stage_id: string | null;
  board_type: string;
  auto_create: boolean;
}

interface SyncResult {
  created: number;
  skipped: number;
  deals: Array<{ id: string; deal_name: string }>;
}

// ── Component ─────────────────────────────────────────────────

export default function TelegramFoldersPage() {
  const router = useRouter();
  const tg = useTelegram();

  // Data state
  const [folders, setFolders] = React.useState<TgFolder[]>([]);
  const [stages, setStages] = React.useState<PipelineStage[]>([]);
  const [mappings, setMappings] = React.useState<Map<number, FolderMapping>>(new Map());
  const [existingDealChatIds, setExistingDealChatIds] = React.useState<Set<number>>(new Set());
  const [dialogs, setDialogs] = React.useState<TgDialog[]>([]);

  // UI state
  const [loadingFolders, setLoadingFolders] = React.useState(false);
  const [loadingStages, setLoadingStages] = React.useState(true);
  const [loadingMappings, setLoadingMappings] = React.useState(true);
  const [savingMappings, setSavingMappings] = React.useState(false);
  const [syncing, setSyncing] = React.useState(false);
  const [syncResult, setSyncResult] = React.useState<SyncResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [dirty, setDirty] = React.useState(false);

  const isConnected = tg.status === "connected";

  // ── Load pipeline stages ────────────────────────────────────

  React.useEffect(() => {
    async function loadStages() {
      try {
        const res = await fetch("/api/pipeline");
        const json = await res.json();
        setStages(json.stages ?? []);
      } catch (err) {
        console.error("[folders] failed to load stages:", err);
      } finally {
        setLoadingStages(false);
      }
    }
    loadStages();
  }, []);

  // ── Load saved mappings ─────────────────────────────────────

  React.useEffect(() => {
    async function loadMappings() {
      try {
        const res = await fetch("/api/telegram/folder-mappings");
        const json = await res.json();
        const map = new Map<number, FolderMapping>();
        for (const m of json.data ?? []) {
          map.set(m.tg_folder_id, {
            id: m.id,
            tg_folder_id: m.tg_folder_id,
            folder_title: m.folder_title,
            stage_id: m.stage_id,
            board_type: m.board_type ?? "BD",
            auto_create: m.auto_create ?? false,
          });
        }
        setMappings(map);
      } catch (err) {
        console.error("[folders] failed to load mappings:", err);
      } finally {
        setLoadingMappings(false);
      }
    }
    loadMappings();
  }, []);

  // ── Load existing deal chat IDs (for match counting) ───────

  React.useEffect(() => {
    async function loadDeals() {
      try {
        const res = await fetch("/api/deals?limit=500");
        const json = await res.json();
        const ids = new Set<number>();
        for (const d of json.deals ?? []) {
          if (d.telegram_chat_id) ids.add(Number(d.telegram_chat_id));
        }
        setExistingDealChatIds(ids);
      } catch (err) {
        console.error("[folders] failed to load deals:", err);
      }
    }
    loadDeals();
  }, []);

  // ── Fetch TG folders client-side ────────────────────────────

  const fetchFolders = React.useCallback(async () => {
    if (!isConnected) return;
    setLoadingFolders(true);
    setError(null);
    try {
      const tgFolders = await tg.service.getDialogFilters();
      setFolders(tgFolders);

      // Also fetch dialogs to resolve names for peer IDs
      const tgDialogs = await tg.service.getDialogs();
      setDialogs(tgDialogs);
    } catch (err) {
      console.error("[folders] failed to fetch TG folders:", err);
      setError("Failed to fetch Telegram folders. Try reconnecting.");
    } finally {
      setLoadingFolders(false);
    }
  }, [isConnected, tg.service]);

  React.useEffect(() => {
    if (isConnected) {
      fetchFolders();
    }
  }, [isConnected, fetchFolders]);

  // ── Mapping helpers ─────────────────────────────────────────

  function getMapping(folderId: number, folderTitle: string): FolderMapping {
    return mappings.get(folderId) ?? {
      tg_folder_id: folderId,
      folder_title: folderTitle,
      stage_id: null,
      board_type: "BD",
      auto_create: false,
    };
  }

  function updateMapping(folderId: number, folderTitle: string, updates: Partial<FolderMapping>) {
    setMappings((prev) => {
      const next = new Map(prev);
      const existing = getMapping(folderId, folderTitle);
      next.set(folderId, { ...existing, ...updates });
      return next;
    });
    setDirty(true);
  }

  // ── Save mappings to server ─────────────────────────────────

  async function saveMappings() {
    setSavingMappings(true);
    setError(null);
    try {
      const payload = Array.from(mappings.values()).map((m) => ({
        tg_folder_id: m.tg_folder_id,
        folder_title: m.folder_title,
        stage_id: m.stage_id,
        board_type: m.board_type,
        auto_create: m.auto_create,
      }));

      const res = await fetch("/api/telegram/folder-mappings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mappings: payload }),
      });

      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || "Failed to save");
      }

      setDirty(false);
    } catch (err) {
      console.error("[folders] save error:", err);
      setError(err instanceof Error ? err.message : "Failed to save mappings");
    } finally {
      setSavingMappings(false);
    }
  }

  // ── Sync: create deals for unmapped conversations ───────────

  async function runSync() {
    setSyncing(true);
    setSyncResult(null);
    setError(null);

    try {
      // Build dialog lookup by telegramId
      const dialogMap = new Map<number, TgDialog>();
      for (const d of dialogs) {
        dialogMap.set(d.telegramId, d);
      }

      // Collect deals to create from auto_create folders
      const dealsToCreate: Array<{
        telegram_chat_id: number;
        chat_title: string;
        stage_id: string;
        board_type: string;
      }> = [];

      for (const folder of folders) {
        const mapping = mappings.get(folder.id);
        if (!mapping?.stage_id || !mapping.auto_create) continue;

        for (const peerId of folder.includePeerIds) {
          // Skip if deal already exists
          if (existingDealChatIds.has(peerId)) continue;

          const dialog = dialogMap.get(peerId);
          const chatTitle = dialog?.title ?? `Chat ${peerId}`;

          dealsToCreate.push({
            telegram_chat_id: peerId,
            chat_title: chatTitle,
            stage_id: mapping.stage_id,
            board_type: mapping.board_type,
          });
        }
      }

      if (dealsToCreate.length === 0) {
        setSyncResult({ created: 0, skipped: 0, deals: [] });
        return;
      }

      const res = await fetch("/api/telegram/folder-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deals: dealsToCreate }),
      });

      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || "Sync failed");
      }

      const json = await res.json();
      setSyncResult(json.data);

      // Refresh existing deal IDs
      if (json.data?.deals?.length) {
        setExistingDealChatIds((prev) => {
          const next = new Set(prev);
          for (const d of json.data.deals) {
            if (d.telegram_chat_id) next.add(Number(d.telegram_chat_id));
          }
          return next;
        });
      }
    } catch (err) {
      console.error("[folders] sync error:", err);
      setError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  // ── Compute stats per folder ────────────────────────────────

  function getFolderStats(folder: TgFolder) {
    const totalPeers = folder.includePeerIds.length;
    const matched = folder.includePeerIds.filter((id) => existingDealChatIds.has(id)).length;
    const unmatched = totalPeers - matched;
    return { totalPeers, matched, unmatched };
  }

  // ── Render helpers ──────────────────────────────────────────

  const autoCreateCount = Array.from(mappings.values()).filter((m) => m.auto_create && m.stage_id).length;
  const totalNewDeals = folders.reduce((sum, f) => {
    const mapping = mappings.get(f.id);
    if (!mapping?.auto_create || !mapping.stage_id) return sum;
    return sum + f.includePeerIds.filter((id) => !existingDealChatIds.has(id)).length;
  }, 0);

  // ── Disconnected state ──────────────────────────────────────

  if (tg.status === "loading" || tg.status === "connecting" || tg.status === "reconnecting") {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[60vh] gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
        <p className="text-sm text-zinc-500">Connecting to Telegram...</p>
      </div>
    );
  }

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[60vh] gap-4">
        <WifiOff className="h-12 w-12 text-zinc-600" />
        <h2 className="text-lg font-medium text-zinc-300">Telegram Not Connected</h2>
        <p className="text-sm text-zinc-500 text-center max-w-md">
          Connect your Telegram account to sync folders with your CRM pipeline.
        </p>
        <Button
          onClick={() => router.push("/telegram")}
          className="bg-blue-600 hover:bg-blue-700 text-white"
        >
          Connect Telegram
        </Button>
      </div>
    );
  }

  // ── Main UI ─────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-6 p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.push("/telegram")}
          className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-semibold text-zinc-100">Folder Sync</h1>
          <p className="text-sm text-zinc-500 mt-0.5">
            Map Telegram folders to pipeline stages and auto-create deals
          </p>
        </div>
        <Button
          onClick={fetchFolders}
          variant="outline"
          size="sm"
          disabled={loadingFolders}
          className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
        >
          <RefreshCw className={cn("h-4 w-4 mr-1.5", loadingFolders && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-red-950/50 border border-red-900/50 text-red-300 text-sm">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
          <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-200">
            &times;
          </button>
        </div>
      )}

      {/* Sync result banner */}
      {syncResult && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-emerald-950/50 border border-emerald-900/50 text-emerald-300 text-sm">
          <Check className="h-4 w-4 shrink-0" />
          <span>
            Sync complete: <strong>{syncResult.created}</strong> deal{syncResult.created !== 1 ? "s" : ""} created
            {syncResult.skipped > 0 && <>, <strong>{syncResult.skipped}</strong> already existed</>}
          </span>
          <button onClick={() => setSyncResult(null)} className="ml-auto text-emerald-400 hover:text-emerald-200">
            &times;
          </button>
        </div>
      )}

      {/* Loading skeleton */}
      {(loadingFolders || loadingStages || loadingMappings) && folders.length === 0 && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse rounded-xl bg-zinc-900 border border-zinc-800 p-5">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-zinc-800" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-32 rounded bg-zinc-800" />
                  <div className="h-3 w-48 rounded bg-zinc-800" />
                </div>
                <div className="h-9 w-40 rounded bg-zinc-800" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loadingFolders && folders.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
          <Folder className="h-12 w-12 text-zinc-700" />
          <h3 className="text-zinc-300 font-medium">No Telegram Folders Found</h3>
          <p className="text-sm text-zinc-500 max-w-sm">
            Create folders in your Telegram client to organize conversations, then refresh here to map them.
          </p>
        </div>
      )}

      {/* Folder list */}
      {folders.length > 0 && (
        <div className="space-y-3">
          {folders.map((folder) => {
            const mapping = getMapping(folder.id, folder.title);
            const stats = getFolderStats(folder);
            const hasStage = !!mapping.stage_id;

            return (
              <div
                key={folder.id}
                className={cn(
                  "rounded-xl border p-5 transition-colors",
                  hasStage
                    ? "bg-zinc-900/80 border-zinc-700"
                    : "bg-zinc-900/40 border-zinc-800/60"
                )}
              >
                <div className="flex items-start gap-4">
                  {/* Folder icon + info */}
                  <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-zinc-800 shrink-0">
                    <Folder className="h-5 w-5 text-blue-400" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium text-zinc-200 truncate">{folder.title}</h3>
                      {folder.isChatlist && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-900/50 text-blue-300 uppercase tracking-wider">
                          Chatlist
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-zinc-500">
                      <span className="flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {stats.totalPeers} conversation{stats.totalPeers !== 1 ? "s" : ""}
                      </span>
                      {stats.matched > 0 && (
                        <span className="text-emerald-500">
                          {stats.matched} matched
                        </span>
                      )}
                      {stats.unmatched > 0 && (
                        <span className="text-amber-500">
                          {stats.unmatched} new
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Controls */}
                  <div className="flex items-center gap-3 shrink-0">
                    {/* Board type */}
                    <div className="relative">
                      <select
                        value={mapping.board_type}
                        onChange={(e) => updateMapping(folder.id, folder.title, { board_type: e.target.value })}
                        className="appearance-none bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 pr-7 text-xs text-zinc-300 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      >
                        <option value="BD">BD</option>
                        <option value="Marketing">Marketing</option>
                        <option value="Admin">Admin</option>
                      </select>
                      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-zinc-500 pointer-events-none" />
                    </div>

                    {/* Stage dropdown */}
                    <div className="relative">
                      <select
                        value={mapping.stage_id ?? ""}
                        onChange={(e) =>
                          updateMapping(folder.id, folder.title, {
                            stage_id: e.target.value || null,
                          })
                        }
                        className="appearance-none bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 pr-7 text-xs text-zinc-300 focus:outline-none focus:ring-1 focus:ring-blue-500 min-w-[160px]"
                      >
                        <option value="">No stage mapped</option>
                        {stages.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-zinc-500 pointer-events-none" />
                    </div>

                    {/* Auto-create toggle */}
                    <button
                      onClick={() =>
                        updateMapping(folder.id, folder.title, {
                          auto_create: !mapping.auto_create,
                        })
                      }
                      disabled={!mapping.stage_id}
                      className={cn(
                        "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-colors",
                        mapping.auto_create && mapping.stage_id
                          ? "bg-emerald-900/40 text-emerald-300 border border-emerald-800/50"
                          : "bg-zinc-800/50 text-zinc-500 border border-zinc-800",
                        !mapping.stage_id && "opacity-40 cursor-not-allowed"
                      )}
                      title={mapping.stage_id ? "Toggle auto-create deals" : "Select a stage first"}
                    >
                      {mapping.auto_create && mapping.stage_id ? (
                        <ToggleRight className="h-3.5 w-3.5" />
                      ) : (
                        <ToggleLeft className="h-3.5 w-3.5" />
                      )}
                      Auto
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Action bar */}
      {folders.length > 0 && (
        <div className="flex items-center justify-between pt-2 border-t border-zinc-800">
          <div className="text-xs text-zinc-500">
            {autoCreateCount > 0 ? (
              <span>
                <strong className="text-zinc-300">{autoCreateCount}</strong> folder{autoCreateCount !== 1 ? "s" : ""} with auto-create
                {totalNewDeals > 0 && (
                  <> &middot; <strong className="text-amber-400">{totalNewDeals}</strong> new deal{totalNewDeals !== 1 ? "s" : ""} to create</>
                )}
              </span>
            ) : (
              <span>Enable auto-create on mapped folders to sync deals</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              onClick={saveMappings}
              disabled={!dirty || savingMappings}
              variant="outline"
              size="sm"
              className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
            >
              {savingMappings ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              ) : (
                <Check className="h-4 w-4 mr-1.5" />
              )}
              Save Mappings
            </Button>

            <Button
              onClick={runSync}
              disabled={syncing || totalNewDeals === 0 || dirty}
              size="sm"
              className="bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
            >
              {syncing ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              ) : (
                <FolderSync className="h-4 w-4 mr-1.5" />
              )}
              Sync {totalNewDeals > 0 ? `(${totalNewDeals} new)` : ""}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
