"use client";

import * as React from "react";
import {
  RefreshCw,
  FolderSync,
  FolderPlus,
  MessageCircle,
  ChevronRight,
  ChevronDown,
  ToggleLeft,
  ToggleRight,
  Trash2,
  Clock,
  Loader2,
  Link as LinkIcon,
  Hash,
  Users,
  Radio,
  User,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn, timeAgo } from "@/lib/utils";
import { toast } from "sonner";
import { useTelegram } from "@/lib/client/telegram-context";
import {
  useTelegramFolders,
  fetchFolderChats,
  type SyncedFolder,
  type FolderChat,
} from "@/lib/client/telegram-folders";
import type { TgFolder } from "@/lib/client/telegram-service";

// ── Chat type config ──────────────────────────────────────────

const CHAT_TYPE_CONFIG: Record<string, { icon: React.ReactNode; label: string; color: string }> = {
  private: {
    icon: <User className="h-3 w-3" />,
    label: "Private",
    color: "text-blue-400 bg-blue-500/10 border-blue-500/20",
  },
  group: {
    icon: <Users className="h-3 w-3" />,
    label: "Group",
    color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  },
  supergroup: {
    icon: <Hash className="h-3 w-3" />,
    label: "Supergroup",
    color: "text-purple-400 bg-purple-500/10 border-purple-500/20",
  },
  channel: {
    icon: <Radio className="h-3 w-3" />,
    label: "Channel",
    color: "text-amber-400 bg-amber-500/10 border-amber-500/20",
  },
};

function ChatTypeBadge({ type }: { type: string | null }) {
  const config = CHAT_TYPE_CONFIG[type ?? ""] ?? {
    icon: <MessageCircle className="h-3 w-3" />,
    label: type ?? "Unknown",
    color: "text-muted-foreground bg-white/5 border-white/10",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium",
        config.color,
      )}
    >
      {config.icon}
      {config.label}
    </span>
  );
}

// ── Folder Card ───────────────────────────────────────────────

function FolderCard({
  folder,
  onSync,
  onToggleSync,
  onRemove,
}: {
  folder: SyncedFolder;
  onSync: () => Promise<void>;
  onToggleSync: () => Promise<void>;
  onRemove: () => Promise<void>;
}) {
  const [expanded, setExpanded] = React.useState(false);
  const [chats, setChats] = React.useState<FolderChat[]>([]);
  const [chatsLoading, setChatsLoading] = React.useState(false);
  const [actionLoading, setActionLoading] = React.useState(false);

  async function handleExpand() {
    if (expanded) {
      setExpanded(false);
      return;
    }
    setExpanded(true);
    setChatsLoading(true);
    try {
      const data = await fetchFolderChats(folder.id);
      setChats(data);
    } catch {
      toast.error("Failed to load chats");
    } finally {
      setChatsLoading(false);
    }
  }

  async function handleAction(action: () => Promise<void>, label: string) {
    setActionLoading(true);
    try {
      await action();
      toast.success(label);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : label + " failed");
    } finally {
      setActionLoading(false);
    }
  }

  return (
    <div className="rounded-xl border border-white/10 bg-[#1a1a2e] overflow-hidden">
      {/* Folder header */}
      <button
        onClick={handleExpand}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition text-left"
      >
        <span className="text-lg shrink-0">
          {folder.folder_emoji || "\uD83D\uDCC1"}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground truncate">
              {folder.folder_name}
            </span>
            {folder.unread_total > 0 && (
              <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">
                {folder.unread_total > 99 ? "99+" : folder.unread_total}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5">
            <span>{folder.chat_count} chats</span>
            {folder.last_synced_at && (
              <>
                <span className="text-white/20">&middot;</span>
                <span>Synced {timeAgo(folder.last_synced_at)}</span>
              </>
            )}
          </div>
        </div>
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
        )}
      </button>

      {/* Actions bar */}
      <div className="flex items-center gap-1 px-3 py-2 border-t border-white/5 bg-white/[0.02]">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs gap-1.5"
          onClick={() => handleAction(onSync, "Folder synced")}
          disabled={actionLoading}
        >
          {actionLoading ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <RefreshCw className="h-3 w-3" />
          )}
          Sync Now
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs gap-1.5"
          onClick={() => handleAction(onToggleSync, folder.is_synced ? "Auto-sync disabled" : "Auto-sync enabled")}
          disabled={actionLoading}
        >
          {folder.is_synced ? (
            <ToggleRight className="h-3 w-3 text-emerald-400" />
          ) : (
            <ToggleLeft className="h-3 w-3 text-muted-foreground" />
          )}
          {folder.is_synced ? "Auto-Sync On" : "Auto-Sync Off"}
        </Button>
        <div className="flex-1" />
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs text-red-400 hover:text-red-300 gap-1.5"
          onClick={() => handleAction(onRemove, "Folder removed")}
          disabled={actionLoading}
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>

      {/* Expanded chats list */}
      {expanded && (
        <div className="border-t border-white/5">
          {chatsLoading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : chats.length === 0 ? (
            <div className="text-center py-6 text-xs text-muted-foreground">
              No chats synced yet. Click "Sync Now" to pull chats.
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {chats.map((chat) => (
                <div
                  key={chat.id}
                  className="flex items-center gap-3 px-4 py-2.5 hover:bg-white/[0.03] transition"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-foreground truncate">
                        {chat.chat_title ?? `Chat ${chat.chat_id}`}
                      </span>
                      {chat.is_pinned && (
                        <span className="text-[10px] text-amber-400">pinned</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <ChatTypeBadge type={chat.chat_type} />
                      {chat.last_message_at && (
                        <span className="text-[10px] text-muted-foreground">
                          {timeAgo(chat.last_message_at)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {chat.linked_deals.length > 0 && (
                      <span
                        className="inline-flex items-center gap-1 text-[10px] text-blue-400"
                        title={chat.linked_deals.map((d) => d.deal_name).join(", ")}
                      >
                        <LinkIcon className="h-3 w-3" />
                        {chat.linked_deals.length}
                      </span>
                    )}
                    {chat.unread_count > 0 && (
                      <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">
                        {chat.unread_count > 99 ? "99+" : chat.unread_count}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Add Folder Modal ──────────────────────────────────────────

function AddFolderModal({
  onClose,
  onAdd,
}: {
  onClose: () => void;
  onAdd: (folder: TgFolder) => Promise<void>;
}) {
  const [available, setAvailable] = React.useState<TgFolder[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [adding, setAdding] = React.useState<number | null>(null);
  const { fetchAvailableFolders } = useTelegramFolders();

  React.useEffect(() => {
    fetchAvailableFolders()
      .then(setAvailable)
      .catch(() => toast.error("Failed to fetch Telegram folders"))
      .finally(() => setLoading(false));
  }, [fetchAvailableFolders]);

  async function handleAdd(folder: TgFolder) {
    setAdding(folder.id);
    try {
      await onAdd(folder);
      setAvailable((prev) => prev.filter((f) => f.id !== folder.id));
      toast.success(`Folder "${folder.title}" synced`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add folder");
    } finally {
      setAdding(null);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-md mx-4 rounded-2xl border border-white/10 bg-[#1a1a2e] shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div className="flex items-center gap-2">
            <FolderPlus className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">Add Telegram Folder</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-muted-foreground hover:bg-white/10 hover:text-foreground transition"
          >
            &times;
          </button>
        </div>
        <div className="p-4 max-h-[60vh] overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : available.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">
              All Telegram folders are already synced, or no folders found.
            </p>
          ) : (
            <div className="space-y-2">
              {available.map((folder) => (
                <button
                  key={folder.id}
                  onClick={() => handleAdd(folder)}
                  disabled={adding !== null}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-lg border border-white/10 hover:bg-white/5 transition text-left disabled:opacity-50"
                >
                  <span className="text-lg">{"\uD83D\uDCC1"}</span>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-foreground truncate block">
                      {folder.title}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {folder.includePeerIds.length} chats
                    </span>
                  </div>
                  {adding === folder.id ? (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  ) : (
                    <FolderSync className="h-4 w-4 text-muted-foreground" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────

export default function TelegramFoldersPage() {
  const { status } = useTelegram();
  const {
    folders,
    loading,
    syncing,
    error,
    syncAllFolders,
    syncSingleFolder,
    updateFolder,
    removeFolder,
  } = useTelegramFolders();
  const [showAddModal, setShowAddModal] = React.useState(false);

  const tgConnected = status === "connected";

  async function handleSyncAll() {
    try {
      await syncAllFolders();
      toast.success("All folders synced");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sync failed");
    }
  }

  async function handleAddFolder(tgFolder: TgFolder) {
    const service = (await import("@/lib/client/telegram-service")).TelegramBrowserService.getInstance();
    const dialogs = await service.getDialogs(200);
    const { buildFolderSyncPayload, syncFolderToServer } = await import("@/lib/client/telegram-folders");
    const payload = buildFolderSyncPayload(tgFolder, dialogs);
    await syncFolderToServer(payload);
    // Refresh the folder list in the hook
    const res = await fetch("/api/telegram/folders");
    if (res.ok) {
      // Re-trigger by remounting — simple but effective
      window.location.reload();
    }
  }

  return (
    <div className="flex-1 px-4 sm:px-6 py-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <FolderSync className="h-5 w-5 text-primary" />
            Telegram Folders
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Sync your Telegram folders to organize conversations in the CRM.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs gap-1.5"
            onClick={handleSyncAll}
            disabled={!tgConnected || syncing}
          >
            {syncing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Sync All
          </Button>
          <Button
            size="sm"
            className="h-8 text-xs gap-1.5"
            onClick={() => setShowAddModal(true)}
            disabled={!tgConnected}
          >
            <FolderPlus className="h-3.5 w-3.5" />
            Add Folder
          </Button>
        </div>
      </div>

      {/* Connection warning */}
      {!tgConnected && !loading && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 mb-4 flex items-center gap-3">
          <AlertCircle className="h-4 w-4 text-amber-400 shrink-0" />
          <p className="text-xs text-amber-300">
            Connect your Telegram account to sync folders.
            <a href="/telegram" className="underline ml-1 hover:text-amber-200">Go to Telegram settings</a>
          </p>
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 mb-4 flex items-center gap-3">
          <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />
          <p className="text-xs text-red-300">{error}</p>
        </div>
      )}

      {/* Folder list */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : folders.length === 0 ? (
        <div className="text-center py-16">
          <FolderSync className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No folders synced yet.</p>
          <p className="text-xs text-muted-foreground mt-1">
            Click "Add Folder" to sync your Telegram folders.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {folders.map((folder) => (
            <FolderCard
              key={folder.id}
              folder={folder}
              onSync={() => syncSingleFolder(folder.telegram_folder_id)}
              onToggleSync={() =>
                updateFolder(folder.id, { is_synced: !folder.is_synced })
              }
              onRemove={() => removeFolder(folder.id)}
            />
          ))}
        </div>
      )}

      {/* Add Folder Modal */}
      {showAddModal && (
        <AddFolderModal
          onClose={() => setShowAddModal(false)}
          onAdd={handleAddFolder}
        />
      )}
    </div>
  );
}
