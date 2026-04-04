"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { cn, timeAgo } from "@/lib/utils";
import { Folder, ChevronRight, MessageSquare, Users, Plus, Pencil, Trash2, X, Check } from "lucide-react";
import { BottomTabBar } from "@/components/tma/bottom-tab-bar";
import { PullToRefresh } from "@/components/tma/pull-to-refresh";
import { useTelegramWebApp } from "@/components/tma/use-telegram";
import { hapticImpact } from "@/components/tma/haptic";

interface FolderChat {
  chat_id: number;
  chat_title: string;
  chat_type: string;
  unread_count: number;
  last_message_at: string | null;
  is_pinned: boolean;
}

interface TgFolder {
  id: string;
  folder_name: string;
  folder_emoji: string | null;
  telegram_folder_id: number;
  is_synced: boolean;
  last_synced_at: string | null;
  chat_count: number;
  chats?: FolderChat[];
}

export default function TMAFoldersPage() {
  const router = useRouter();
  const [folders, setFolders] = React.useState<TgFolder[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [expandedId, setExpandedId] = React.useState<string | null>(null);
  const [showCreate, setShowCreate] = React.useState(false);
  const [newName, setNewName] = React.useState("");
  const [newEmoji, setNewEmoji] = React.useState("📁");
  const [creating, setCreating] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editName, setEditName] = React.useState("");
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const { webApp } = useTelegramWebApp();

  React.useEffect(() => {
    fetchFolders();
  }, []);

  async function fetchFolders() {
    try {
      const res = await fetch("/api/telegram/folders");
      if (res.ok) {
        const json = await res.json();
        setFolders(json.data ?? []);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  async function expandFolder(folder: TgFolder) {
    hapticImpact("light");
    if (expandedId === folder.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(folder.id);

    if (!folder.chats) {
      try {
        const res = await fetch(`/api/telegram/folders/${folder.id}/chats`);
        if (res.ok) {
          const json = await res.json();
          setFolders((prev) =>
            prev.map((f) => f.id === folder.id ? { ...f, chats: json.data ?? [] } : f)
          );
        }
      } catch {
        // ignore
      }
    }
  }

  async function createFolder() {
    if (!newName.trim() || creating) return;
    setCreating(true);
    hapticImpact("medium");
    try {
      const res = await fetch("/api/telegram/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folder_name: newName.trim(), folder_emoji: newEmoji }),
      });
      if (res.ok) {
        setNewName("");
        setNewEmoji("📁");
        setShowCreate(false);
        await fetchFolders();
      }
    } finally {
      setCreating(false);
    }
  }

  async function renameFolder(folderId: string) {
    if (!editName.trim()) return;
    hapticImpact("light");
    try {
      const res = await fetch(`/api/telegram/folders/${folderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folder_name: editName.trim() }),
      });
      if (res.ok) {
        setEditingId(null);
        setFolders((prev) =>
          prev.map((f) => f.id === folderId ? { ...f, folder_name: editName.trim() } : f)
        );
      }
    } catch {
      // ignore
    }
  }

  async function deleteFolder(folderId: string) {
    hapticImpact("heavy");
    setDeletingId(folderId);
    try {
      const res = await fetch(`/api/telegram/folders/${folderId}`, { method: "DELETE" });
      if (res.ok) {
        setFolders((prev) => prev.filter((f) => f.id !== folderId));
      }
    } finally {
      setDeletingId(null);
    }
  }

  const totalUnread = folders.reduce((sum, f) =>
    sum + (f.chats?.reduce((s, c) => s + c.unread_count, 0) ?? 0), 0
  );

  return (
    <div className="flex flex-col min-h-screen bg-black text-white">
      <PullToRefresh onRefresh={fetchFolders}>
        <div className="px-4 pt-4 pb-2">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-semibold">Telegram Folders</h1>
              <p className="text-xs text-white/50 mt-0.5">
                {folders.length} synced folder{folders.length !== 1 ? "s" : ""}
                {totalUnread > 0 && ` · ${totalUnread} unread`}
              </p>
            </div>
            <button
              onClick={() => { setShowCreate(!showCreate); hapticImpact("light"); }}
              className="h-8 w-8 rounded-full bg-blue-500/20 flex items-center justify-center active:scale-95"
            >
              {showCreate ? <X className="h-4 w-4 text-blue-400" /> : <Plus className="h-4 w-4 text-blue-400" />}
            </button>
          </div>

          {showCreate && (
            <div className="mt-2 rounded-xl bg-white/[0.06] p-3 space-y-2">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setNewEmoji(newEmoji === "📁" ? "📂" : newEmoji === "📂" ? "⭐" : newEmoji === "⭐" ? "🔥" : "📁")}
                  className="h-8 w-8 rounded-lg bg-white/[0.08] flex items-center justify-center text-base active:scale-95"
                >
                  {newEmoji}
                </button>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Folder name..."
                  className="flex-1 bg-white/[0.06] rounded-lg px-3 py-1.5 text-sm text-white placeholder:text-white/30 outline-none"
                />
              </div>
              <button
                onClick={createFolder}
                disabled={creating || !newName.trim()}
                className="w-full rounded-lg bg-blue-500 py-2 text-sm font-medium active:scale-[0.98] disabled:opacity-50"
              >
                {creating ? "Creating..." : "Create Folder"}
              </button>
            </div>
          )}
        </div>

        <div className="px-4 pb-24 space-y-2">
          {loading ? (
            <div className="py-8 text-center text-sm text-white/40">Loading folders...</div>
          ) : folders.length === 0 ? (
            <div className="py-12 text-center">
              <Folder className="h-8 w-8 text-white/20 mx-auto mb-2" />
              <p className="text-sm text-white/40">No synced folders</p>
              <p className="text-xs text-white/25 mt-1">Sync your Telegram folders from the desktop app</p>
            </div>
          ) : (
            folders.map((folder) => {
              const isExpanded = expandedId === folder.id;
              const folderUnread = folder.chats?.reduce((s, c) => s + c.unread_count, 0) ?? 0;

              return (
                <div key={folder.id} className="rounded-xl bg-white/[0.06] overflow-hidden">
                  <button
                    onClick={() => expandFolder(folder)}
                    className="w-full flex items-center gap-3 p-3 active:bg-white/[0.08]"
                  >
                    <div className="h-9 w-9 rounded-lg bg-blue-500/20 flex items-center justify-center shrink-0">
                      <span className="text-base">{folder.folder_emoji ?? "📁"}</span>
                    </div>
                    <div className="flex-1 min-w-0 text-left">
                      <p className="text-sm font-medium truncate">{folder.folder_name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-white/40">{folder.chat_count} chats</span>
                        {folder.last_synced_at && (
                          <span className="text-[10px] text-white/30">
                            synced {timeAgo(folder.last_synced_at)}
                          </span>
                        )}
                      </div>
                    </div>
                    {folderUnread > 0 && (
                      <span className="px-1.5 py-0.5 rounded-full bg-blue-500 text-[10px] font-medium">
                        {folderUnread}
                      </span>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingId(folder.id);
                        setEditName(folder.folder_name);
                        hapticImpact("light");
                      }}
                      className="h-6 w-6 rounded flex items-center justify-center active:bg-white/[0.1]"
                    >
                      <Pencil className="h-3 w-3 text-white/30" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteFolder(folder.id);
                      }}
                      disabled={deletingId === folder.id}
                      className="h-6 w-6 rounded flex items-center justify-center active:bg-white/[0.1]"
                    >
                      <Trash2 className="h-3 w-3 text-red-400/50" />
                    </button>
                    <ChevronRight className={cn(
                      "h-4 w-4 text-white/30 transition-transform",
                      isExpanded && "rotate-90"
                    )} />
                  </button>

                  {editingId === folder.id && (
                    <div className="flex items-center gap-2 px-3 py-2 border-t border-white/5">
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        autoFocus
                        className="flex-1 bg-white/[0.06] rounded-lg px-2 py-1 text-xs text-white outline-none"
                        onKeyDown={(e) => { if (e.key === "Enter") renameFolder(folder.id); }}
                      />
                      <button onClick={() => renameFolder(folder.id)} className="h-6 w-6 rounded bg-blue-500/20 flex items-center justify-center">
                        <Check className="h-3 w-3 text-blue-400" />
                      </button>
                      <button onClick={() => setEditingId(null)} className="h-6 w-6 rounded bg-white/[0.06] flex items-center justify-center">
                        <X className="h-3 w-3 text-white/40" />
                      </button>
                    </div>
                  )}

                  {isExpanded && folder.chats && (
                    <div className="border-t border-white/5">
                      {folder.chats.length === 0 ? (
                        <p className="text-xs text-white/30 p-3 text-center">No chats in this folder</p>
                      ) : (
                        folder.chats.map((chat) => (
                          <div
                            key={chat.chat_id}
                            className="flex items-center gap-3 px-3 py-2.5 border-b border-white/[0.03] last:border-b-0 active:bg-white/[0.04]"
                          >
                            <div className="h-7 w-7 rounded-full bg-white/[0.08] flex items-center justify-center shrink-0">
                              {chat.chat_type === "group" || chat.chat_type === "supergroup"
                                ? <Users className="h-3 w-3 text-white/40" />
                                : <MessageSquare className="h-3 w-3 text-white/40" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium truncate">{chat.chat_title}</p>
                              {chat.last_message_at && (
                                <p className="text-[10px] text-white/30 mt-0.5">{timeAgo(chat.last_message_at)}</p>
                              )}
                            </div>
                            {chat.unread_count > 0 && (
                              <span className="px-1.5 py-0.5 rounded-full bg-blue-500/80 text-[9px] font-medium">
                                {chat.unread_count}
                              </span>
                            )}
                            {chat.is_pinned && (
                              <span className="text-[9px] text-white/30">📌</span>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </PullToRefresh>

      <BottomTabBar active="more" />
    </div>
  );
}
