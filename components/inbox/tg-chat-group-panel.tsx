"use client";

import * as React from "react";
import { cn, timeAgo } from "@/lib/utils";
import { toast } from "sonner";
import {
  ChevronDown,
  Folder,
  Plus,
  X,
  Pencil,
  Loader2,
  MessageCircle,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────

export interface TgChatGroupMember {
  id: string;
  group_id: string;
  telegram_chat_id: number;
  chat_title: string | null;
  added_at: string;
}

export interface TgChatGroup {
  id: string;
  name: string;
  color: string;
  icon: string | null;
  position: number;
  is_collapsed: boolean;
  created_at: string;
  updated_at: string;
  crm_tg_chat_group_members: TgChatGroupMember[];
  crm_tg_chat_group_contacts: { id: string; contact_id: string }[];
}

// ── Drag data type ───────────────────────────────────────────

export const TG_CHAT_DRAG_TYPE = "application/x-tg-chat";

export interface DragChatData {
  chatId: number;
  chatTitle: string;
}

function parseDragChatData(raw: string): DragChatData | null {
  try {
    const data = JSON.parse(raw) as unknown;
    if (
      typeof data === "object" && data !== null &&
      "chatId" in data && typeof (data as Record<string, unknown>).chatId === "number" &&
      "chatTitle" in data && typeof (data as Record<string, unknown>).chatTitle === "string"
    ) {
      return data as DragChatData;
    }
  } catch {
    // invalid JSON
  }
  return null;
}

// ── Preset colors ───────────────────────────────────────────

const GROUP_COLORS = [
  "#3b82f6", "#ef4444", "#22c55e", "#f59e0b", "#8b5cf6",
  "#ec4899", "#06b6d4", "#f97316",
];

// ── Hook: useTgChatGroups ───────────────────────────────────

export function useTgChatGroups() {
  const [groups, setGroups] = React.useState<TgChatGroup[]>([]);
  const [loading, setLoading] = React.useState(true);

  const fetchGroups = React.useCallback(async () => {
    try {
      const res = await globalThis.fetch("/api/telegram/groups");
      if (!res.ok) {
        toast.error("Failed to load chat groups");
        return;
      }
      const json = await res.json();
      if (json.data) setGroups(json.data);
    } catch {
      toast.error("Failed to load chat groups");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  const createGroup = React.useCallback(async (name: string, color: string) => {
    const res = await globalThis.fetch("/api/telegram/groups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, color }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Failed to create group");
    const created = json.data as TgChatGroup;
    setGroups((prev) => [...prev, created]);
    return created;
  }, []);

  const deleteGroup = React.useCallback(async (groupId: string) => {
    // Capture for rollback before removing
    const snapshot = groups;
    setGroups((prev) => prev.filter((g) => g.id !== groupId));
    try {
      const res = await globalThis.fetch(`/api/telegram/groups?id=${groupId}`, { method: "DELETE" });
      if (!res.ok) {
        const json = await res.json();
        toast.error(json.error || "Failed to delete group");
        setGroups(snapshot);
      }
    } catch {
      toast.error("Failed to delete group");
      setGroups(snapshot);
    }
  }, [groups]);

  const renameGroup = React.useCallback(async (groupId: string, name: string) => {
    setGroups((prev) => prev.map((g) => (g.id === groupId ? { ...g, name } : g)));
    const res = await globalThis.fetch("/api/telegram/groups", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: groupId, name }),
    });
    if (!res.ok) {
      const json = await res.json();
      toast.error(json.error || "Failed to rename");
      fetchGroups();
    }
  }, [fetchGroups]);

  const toggleCollapse = React.useCallback(async (groupId: string) => {
    // Derive next value inside updater to avoid stale closure
    let next = false;
    setGroups((prev) =>
      prev.map((g) => {
        if (g.id !== groupId) return g;
        next = !g.is_collapsed;
        return { ...g, is_collapsed: next };
      })
    );
    try {
      const res = await globalThis.fetch("/api/telegram/groups", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: groupId, is_collapsed: next }),
      });
      if (!res.ok) {
        // Revert on failure
        setGroups((prev) =>
          prev.map((g) => (g.id === groupId ? { ...g, is_collapsed: !next } : g))
        );
      }
    } catch {
      setGroups((prev) =>
        prev.map((g) => (g.id === groupId ? { ...g, is_collapsed: !next } : g))
      );
    }
  }, []);

  const addChatToGroup = React.useCallback(async (groupId: string, chatId: number, chatTitle: string) => {
    const tempId = crypto.randomUUID();
    const tempMember: TgChatGroupMember = {
      id: tempId,
      group_id: groupId,
      telegram_chat_id: chatId,
      chat_title: chatTitle,
      added_at: new Date().toISOString(),
    };

    setGroups((prev) =>
      prev.map((g) =>
        g.id === groupId
          ? { ...g, crm_tg_chat_group_members: [...g.crm_tg_chat_group_members, tempMember] }
          : g
      )
    );

    try {
      const res = await globalThis.fetch("/api/telegram/groups/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          group_id: groupId,
          chat_ids: [chatId],
          chat_titles: { [chatId]: chatTitle },
        }),
      });

      if (!res.ok) {
        const json = await res.json();
        toast.error(json.error || "Failed to add to group");
        setGroups((prev) =>
          prev.map((g) =>
            g.id === groupId
              ? { ...g, crm_tg_chat_group_members: g.crm_tg_chat_group_members.filter((m) => m.id !== tempId) }
              : g
          )
        );
        return;
      }

      const json = await res.json();
      const realMember = json.data?.[0];
      // Replace temp with real data, or keep temp if API returned empty (upsert matched existing)
      if (realMember) {
        setGroups((prev) =>
          prev.map((g) =>
            g.id === groupId
              ? {
                  ...g,
                  crm_tg_chat_group_members: g.crm_tg_chat_group_members.map((m) =>
                    m.id === tempId ? realMember : m
                  ),
                }
              : g
          )
        );
      } else {
        // API returned empty — member already existed server-side. Remove our temp duplicate.
        setGroups((prev) =>
          prev.map((g) =>
            g.id === groupId
              ? { ...g, crm_tg_chat_group_members: g.crm_tg_chat_group_members.filter((m) => m.id !== tempId) }
              : g
          )
        );
      }
    } catch {
      toast.error("Failed to add to group");
      setGroups((prev) =>
        prev.map((g) =>
          g.id === groupId
            ? { ...g, crm_tg_chat_group_members: g.crm_tg_chat_group_members.filter((m) => m.id !== tempId) }
            : g
        )
      );
    }
  }, []);

  const removeChatFromGroup = React.useCallback(async (groupId: string, chatId: number) => {
    setGroups((prev) =>
      prev.map((g) =>
        g.id === groupId
          ? { ...g, crm_tg_chat_group_members: g.crm_tg_chat_group_members.filter((m) => m.telegram_chat_id !== chatId) }
          : g
      )
    );

    const res = await globalThis.fetch(
      `/api/telegram/groups/members?group_id=${groupId}&chat_id=${chatId}`,
      { method: "DELETE" }
    );
    if (!res.ok) {
      toast.error("Failed to remove from group");
      fetchGroups();
    }
  }, [fetchGroups]);

  return {
    groups,
    loading,
    createGroup,
    deleteGroup,
    renameGroup,
    toggleCollapse,
    addChatToGroup,
    removeChatFromGroup,
    refetch: fetchGroups,
  };
}

// ── Panel Component ─────────────────────────────────────────

interface TgChatGroupPanelProps {
  groups: TgChatGroup[];
  loading: boolean;
  activeGroupId: string | null;
  onSelectGroup: (groupId: string | null) => void;
  onCreateGroup: (name: string, color: string) => Promise<TgChatGroup>;
  onDeleteGroup: (groupId: string) => void;
  onRenameGroup: (groupId: string, name: string) => void;
  onToggleCollapse: (groupId: string) => void;
  onDropChat: (groupId: string, data: DragChatData) => void;
  onRemoveChat: (groupId: string, chatId: number) => void;
  onSelectChat?: (chatId: number) => void;
}

export function TgChatGroupPanel({
  groups,
  loading,
  activeGroupId,
  onSelectGroup,
  onCreateGroup,
  onDeleteGroup,
  onRenameGroup,
  onToggleCollapse,
  onDropChat,
  onRemoveChat,
  onSelectChat,
}: TgChatGroupPanelProps) {
  const [showCreate, setShowCreate] = React.useState(false);
  const [newName, setNewName] = React.useState("");
  const [newColor, setNewColor] = React.useState(GROUP_COLORS[0]);
  const [creating, setCreating] = React.useState(false);

  const handleCreate = async () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    setCreating(true);
    try {
      await onCreateGroup(trimmed, newColor);
      setNewName("");
      setNewColor(GROUP_COLORS[0]);
      setShowCreate(false);
      toast.success(`Group "${trimmed}" created`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to create group");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-1">
      {/* Header */}
      <div className="flex items-center justify-between px-1 mb-1">
        <div className="flex items-center gap-1.5">
          <Folder className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Groups ({groups.length})
          </span>
        </div>
        <button
          onClick={() => setShowCreate((v) => !v)}
          className="h-5 w-5 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
          title="New group"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Active group indicator + clear */}
      {activeGroupId && (
        <button
          onClick={() => onSelectGroup(null)}
          className="w-full flex items-center gap-1.5 px-2 py-1 rounded-md bg-primary/10 text-primary text-[11px] font-medium hover:bg-primary/15 transition-colors"
        >
          <X className="h-3 w-3" />
          <span>Clear group filter</span>
        </button>
      )}

      {/* Create form */}
      {showCreate && (
        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2 space-y-2">
          <input
            className="w-full rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder="Group name..."
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); if (e.key === "Escape") setShowCreate(false); }}
            autoFocus
          />
          <div className="flex items-center gap-1">
            {GROUP_COLORS.map((c) => (
              <button
                key={c}
                className={cn(
                  "h-4 w-4 rounded-full transition-all",
                  newColor === c ? "ring-2 ring-white/40 scale-110" : "opacity-60 hover:opacity-100"
                )}
                style={{ backgroundColor: c }}
                onClick={() => setNewColor(c)}
              />
            ))}
            <div className="flex-1" />
            <button
              onClick={() => setShowCreate(false)}
              className="text-[10px] text-muted-foreground hover:text-foreground px-1"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={!newName.trim() || creating}
              className="text-[10px] text-primary hover:text-primary/80 font-medium px-1 disabled:opacity-50"
            >
              {creating ? <Loader2 className="h-3 w-3 animate-spin" /> : "Create"}
            </button>
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Empty state */}
      {!loading && groups.length === 0 && !showCreate && (
        <p className="text-[11px] text-muted-foreground/50 px-1 py-2">
          No groups yet. Create one and drag chats in.
        </p>
      )}

      {/* Groups list */}
      {groups.map((group) => (
        <GroupRow
          key={group.id}
          group={group}
          isActive={activeGroupId === group.id}
          onSelect={() => onSelectGroup(activeGroupId === group.id ? null : group.id)}
          onToggleCollapse={onToggleCollapse}
          onDelete={onDeleteGroup}
          onRename={onRenameGroup}
          onDropChat={onDropChat}
          onRemoveChat={onRemoveChat}
          onSelectChat={onSelectChat}
        />
      ))}
    </div>
  );
}

// ── GroupRow ─────────────────────────────────────────────────

function GroupRow({
  group,
  isActive,
  onSelect,
  onToggleCollapse,
  onDelete,
  onRename,
  onDropChat,
  onRemoveChat,
  onSelectChat,
}: {
  group: TgChatGroup;
  isActive: boolean;
  onSelect: () => void;
  onToggleCollapse: (id: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onDropChat: (groupId: string, data: DragChatData) => void;
  onRemoveChat: (groupId: string, chatId: number) => void;
  onSelectChat?: (chatId: number) => void;
}) {
  const [isOver, setIsOver] = React.useState(false);
  const [editing, setEditing] = React.useState(false);
  const [editName, setEditName] = React.useState(group.name);
  const recentDropRef = React.useRef(false);
  const members = group.crm_tg_chat_group_members ?? [];

  // Sync editName if group.name changes externally
  React.useEffect(() => {
    if (!editing) setEditName(group.name);
  }, [group.name, editing]);

  const handleDragOver = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes(TG_CHAT_DRAG_TYPE)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setIsOver(true);
  };

  const handleDragLeave = () => setIsOver(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsOver(false);
    if (recentDropRef.current) return; // debounce rapid drops

    const raw = e.dataTransfer.getData(TG_CHAT_DRAG_TYPE);
    if (!raw) return;
    const data = parseDragChatData(raw);
    if (!data) return;

    if (members.some((m) => m.telegram_chat_id === data.chatId)) {
      toast("Chat is already in this group");
      return;
    }

    recentDropRef.current = true;
    setTimeout(() => { recentDropRef.current = false; }, 1000);

    onDropChat(group.id, data);
    toast.success(`Added to "${group.name}"`);
  };

  const commitRename = () => {
    const trimmed = editName.trim();
    if (trimmed && trimmed !== group.name) {
      onRename(group.id, trimmed);
    } else {
      setEditName(group.name);
    }
    setEditing(false);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    const confirmed = window.confirm(`Delete group "${group.name}" and remove all chats from it?`);
    if (confirmed) onDelete(group.id);
  };

  return (
    <div
      className={cn(
        "rounded-lg border transition-colors group",
        isOver
          ? "border-primary/50 bg-primary/5"
          : isActive
            ? "border-primary/30 bg-primary/[0.06]"
            : "border-white/[0.06] bg-white/[0.02]"
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Group header */}
      <div
        className="flex items-center gap-1.5 px-2 py-1.5 cursor-pointer select-none"
        onClick={onSelect}
      >
        <button
          onClick={(e) => { e.stopPropagation(); onToggleCollapse(group.id); }}
          className="shrink-0 text-muted-foreground hover:text-foreground"
        >
          <ChevronDown
            className={cn("h-3 w-3 transition-transform", group.is_collapsed && "-rotate-90")}
          />
        </button>
        <div
          className="h-2.5 w-2.5 rounded-full shrink-0"
          style={{ backgroundColor: group.color }}
        />

        {editing ? (
          <input
            className="flex-1 bg-transparent text-xs text-foreground outline-none border-b border-primary/40 px-0.5"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename();
              if (e.key === "Escape") { setEditName(group.name); setEditing(false); }
            }}
            autoFocus
          />
        ) : (
          <span
            className={cn(
              "flex-1 text-xs font-medium truncate",
              isActive ? "text-primary" : "text-foreground"
            )}
            onDoubleClick={(e) => { e.stopPropagation(); setEditing(true); setEditName(group.name); }}
          >
            {group.name}
          </span>
        )}

        <span className="text-[10px] text-muted-foreground/50 shrink-0 tabular-nums">
          {members.length}
        </span>

        <button
          onClick={(e) => { e.stopPropagation(); setEditing(true); setEditName(group.name); }}
          className="h-5 w-5 flex items-center justify-center rounded text-muted-foreground/40 hover:text-foreground hover:bg-white/5 opacity-0 group-hover:opacity-100 transition-all shrink-0"
          title="Rename"
        >
          <Pencil className="h-2.5 w-2.5" />
        </button>
        <button
          onClick={handleDelete}
          className="h-5 w-5 flex items-center justify-center rounded text-muted-foreground/40 hover:text-red-400 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-all shrink-0"
          title="Delete group"
        >
          <X className="h-2.5 w-2.5" />
        </button>
      </div>

      {/* Members */}
      {!group.is_collapsed && members.length > 0 && (
        <div className="border-t border-white/[0.04] divide-y divide-white/[0.03]">
          {members.map((m) => (
            <div
              key={m.id}
              className="flex items-center gap-2 px-2 py-1 hover:bg-white/[0.03] group/member cursor-pointer"
              onClick={() => onSelectChat?.(m.telegram_chat_id)}
            >
              <MessageCircle className="h-3 w-3 text-muted-foreground/40 shrink-0" />
              <span className="text-[11px] text-foreground/80 truncate flex-1">
                {m.chat_title || `Chat ${m.telegram_chat_id}`}
              </span>
              <span className="text-[9px] text-muted-foreground/30 shrink-0">
                {timeAgo(m.added_at)}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRemoveChat(group.id, m.telegram_chat_id);
                }}
                className="h-4 w-4 flex items-center justify-center rounded text-muted-foreground/30 hover:text-red-400 hover:bg-red-500/10 opacity-0 group-hover/member:opacity-100 transition-all shrink-0"
                title="Remove from group"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Empty drop hint */}
      {!group.is_collapsed && members.length === 0 && (
        <div className={cn(
          "border-t border-white/[0.04] px-2 py-2 text-center transition-colors",
          isOver ? "text-primary/60" : "text-muted-foreground/30"
        )}>
          <p className="text-[10px]">
            {isOver ? "Drop here to add" : "Drag chats here"}
          </p>
        </div>
      )}
    </div>
  );
}
