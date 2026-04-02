"use client";

import * as React from "react";
import { cn, timeAgo } from "@/lib/utils";
import { toast } from "sonner";
import { ChevronDown, Folder, Plus, X, Archive, Pencil, Info, Loader2 } from "lucide-react";

// ── Types ────────────────────────────────────────────────────

export interface EmailGroupThread {
  id: string;
  thread_id: string;
  subject: string | null;
  snippet: string | null;
  from_email: string | null;
  from_name: string | null;
  last_message_at: string | null;
  auto_added: boolean;
  added_at: string;
}

export interface EmailGroupContact {
  id: string;
  email: string;
  name: string | null;
}

export interface EmailGroup {
  id: string;
  name: string;
  color: string;
  position: number;
  is_collapsed: boolean;
  gmail_label_id: string | null;
  created_at: string;
  updated_at: string;
  /** null = never loaded (Gmail groups), [] = loaded but empty */
  crm_email_group_threads: EmailGroupThread[] | null;
  crm_email_group_contacts: EmailGroupContact[];
}

// ── Drag data type ───────────────────────────────────────────

export const EMAIL_THREAD_DRAG_TYPE = "application/x-email-thread";

export interface DragThreadData {
  threadId: string;
  subject: string;
  snippet: string;
  fromEmail: string;
  fromName: string;
  lastMessageAt: string;
  primaryContacts: { email: string; name?: string }[];
}

// ── Preset colors ───────────────────────────────────────────

const GROUP_COLORS = [
  "#3b82f6", "#ef4444", "#22c55e", "#f59e0b", "#8b5cf6",
  "#ec4899", "#06b6d4", "#f97316",
];

// ── Hook: useEmailGroups ─────────────────────────────────────

export function useEmailGroups(connectionId: string | undefined) {
  const [groups, setGroups] = React.useState<EmailGroup[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [loadingThreads, setLoadingThreads] = React.useState<Set<string>>(new Set());
  // Ref tracks latest groups to avoid stale closures in callbacks
  const groupsRef = React.useRef(groups);
  groupsRef.current = groups;

  const fetchGroups = React.useCallback(async () => {
    if (!connectionId) { setLoading(false); return; }
    try {
      const res = await globalThis.fetch(`/api/email/groups?connection_id=${connectionId}`);
      const json = await res.json();
      if (json.data) {
        const groupList: EmailGroup[] = json.data.map((g: EmailGroup) => ({
          ...g,
          // Gmail groups: null = never loaded, IMAP groups keep their threads
          crm_email_group_threads: g.gmail_label_id ? null : (g.crm_email_group_threads ?? []),
        }));
        setGroups(groupList);

        // Lazy-load threads for expanded Gmail-backed groups
        const gmailExpanded = groupList.filter((g) => g.gmail_label_id && !g.is_collapsed);
        if (gmailExpanded.length > 0) {
          const loadingIds = new Set(gmailExpanded.map((g) => g.id));
          setLoadingThreads(loadingIds);

          const results = await Promise.allSettled(
            gmailExpanded.map(async (g) => {
              const tRes = await globalThis.fetch(`/api/email/groups/threads?group_id=${g.id}`);
              const tJson = await tRes.json();
              if (tJson.error) throw new Error(tJson.error);
              return { groupId: g.id, threads: (tJson.data ?? []) as EmailGroupThread[] };
            })
          );
          setGroups((prev) =>
            prev.map((g) => {
              const match = results.find(
                (r) => r.status === "fulfilled" && r.value.groupId === g.id
              );
              if (match && match.status === "fulfilled") {
                return { ...g, crm_email_group_threads: match.value.threads };
              }
              // Mark failed fetches as empty array so user sees error state
              const failed = results.find(
                (r) => r.status === "rejected"
              );
              if (failed && loadingIds.has(g.id)) {
                return { ...g, crm_email_group_threads: [] };
              }
              return g;
            })
          );
          setLoadingThreads(new Set());
        }
      } else if (json.error) {
        toast.error(`Failed to load groups: ${json.error}`);
      }
    } catch {
      toast.error("Failed to load email groups");
    } finally {
      setLoading(false);
    }
  }, [connectionId]);

  React.useEffect(() => { setGroups([]); setLoading(true); fetchGroups(); }, [fetchGroups]);

  const createGroup = React.useCallback(async (name: string, color?: string) => {
    if (!connectionId) return null;
    const res = await globalThis.fetch("/api/email/groups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, color, connection_id: connectionId }),
    });
    const json = await res.json();
    if (json.error) {
      toast.error(json.error);
      return null;
    }
    const newGroup = { ...json.data, crm_email_group_threads: json.data.gmail_label_id ? null : (json.data.crm_email_group_threads ?? []) };
    setGroups((prev) => [...prev, newGroup]);
    toast.success(`Group "${name}" created`);
    return newGroup as EmailGroup;
  }, [connectionId]);

  const deleteGroup = React.useCallback(async (id: string) => {
    const snapshot = groupsRef.current;
    const removed = snapshot.find((g) => g.id === id);
    setGroups((prev) => prev.filter((g) => g.id !== id));

    try {
      const res = await globalThis.fetch(`/api/email/groups?id=${id}`, { method: "DELETE" });
      const json = await res.json();
      if (json.error) {
        toast.error(json.error);
        if (removed) setGroups((prev) => [...prev, removed].sort((a, b) => a.position - b.position));
      } else {
        toast.success("Group deleted");
      }
    } catch {
      toast.error("Failed to delete group");
      if (removed) setGroups((prev) => [...prev, removed].sort((a, b) => a.position - b.position));
    }
  }, []);

  const toggleCollapse = React.useCallback(async (id: string) => {
    const current = groupsRef.current.find((g) => g.id === id);
    if (!current) return;
    const newCollapsed = !current.is_collapsed;
    setGroups((prev) =>
      prev.map((g) => (g.id === id ? { ...g, is_collapsed: newCollapsed } : g))
    );

    // Lazy-load threads when expanding a Gmail-backed group that was never loaded
    if (!newCollapsed && current.gmail_label_id && current.crm_email_group_threads === null) {
      setLoadingThreads((prev) => new Set([...prev, id]));
      try {
        const tRes = await globalThis.fetch(`/api/email/groups/threads?group_id=${id}`);
        const tJson = await tRes.json();
        if (tJson.error) throw new Error(tJson.error);
        setGroups((prev) =>
          prev.map((g) => (g.id === id ? { ...g, crm_email_group_threads: tJson.data ?? [] } : g))
        );
      } catch {
        toast.error("Failed to load threads — click to retry");
        setGroups((prev) =>
          prev.map((g) => (g.id === id ? { ...g, crm_email_group_threads: null } : g))
        );
      } finally {
        setLoadingThreads((prev) => { const next = new Set(prev); next.delete(id); return next; });
      }
    }

    try {
      const res = await globalThis.fetch("/api/email/groups", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, is_collapsed: newCollapsed }),
      });
      const json = await res.json();
      if (json.error) {
        setGroups((prev) =>
          prev.map((g) => (g.id === id ? { ...g, is_collapsed: !newCollapsed } : g))
        );
      }
    } catch {
      setGroups((prev) =>
        prev.map((g) => (g.id === id ? { ...g, is_collapsed: !newCollapsed } : g))
      );
    }
  }, []);

  const renameGroup = React.useCallback(async (id: string, name: string) => {
    if (!name.trim()) return;
    const oldName = groupsRef.current.find((g) => g.id === id)?.name ?? "";
    setGroups((prev) =>
      prev.map((g) => (g.id === id ? { ...g, name: name.trim() } : g))
    );

    try {
      const res = await globalThis.fetch("/api/email/groups", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, name: name.trim() }),
      });
      const json = await res.json();
      if (json.error) {
        toast.error(json.error);
        setGroups((prev) => prev.map((g) => (g.id === id ? { ...g, name: oldName } : g)));
      }
    } catch {
      toast.error("Failed to rename group");
      setGroups((prev) => prev.map((g) => (g.id === id ? { ...g, name: oldName } : g)));
    }
  }, []);

  const addThreadToGroup = React.useCallback(async (groupId: string, data: DragThreadData) => {
    const tempId = crypto.randomUUID();
    const newThread: EmailGroupThread = {
      id: tempId,
      thread_id: data.threadId,
      subject: data.subject,
      snippet: data.snippet,
      from_email: data.fromEmail,
      from_name: data.fromName,
      last_message_at: data.lastMessageAt,
      auto_added: false,
      added_at: new Date().toISOString(),
    };

    // Auto-expand group if collapsed, and ensure threads array exists
    setGroups((prev) =>
      prev.map((g) =>
        g.id === groupId
          ? { ...g, is_collapsed: false, crm_email_group_threads: [newThread, ...(g.crm_email_group_threads ?? [])] }
          : g
      )
    );

    try {
      const res = await globalThis.fetch("/api/email/groups/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          group_id: groupId,
          thread_id: data.threadId,
          subject: data.subject,
          snippet: data.snippet,
          from_email: data.fromEmail,
          from_name: data.fromName,
          last_message_at: data.lastMessageAt,
          primary_contacts: data.primaryContacts,
        }),
      });

      const json = await res.json();
      if (json.error) {
        toast.error(json.error);
        setGroups((prev) =>
          prev.map((g) =>
            g.id === groupId
              ? { ...g, crm_email_group_threads: (g.crm_email_group_threads ?? []).filter((t) => t.id !== tempId) }
              : g
          )
        );
      } else if (json.data) {
        // Match by thread_id (not id) because Gmail returns synthetic IDs like "gmail-..."
        // that won't match the temp UUID we assigned optimistically
        setGroups((prev) =>
          prev.map((g) =>
            g.id === groupId
              ? {
                  ...g,
                  crm_email_group_threads: (g.crm_email_group_threads ?? []).map((t) =>
                    t.thread_id === data.threadId && t.id === tempId ? { ...t, id: json.data.id } : t
                  ),
                }
              : g
          )
        );
      }
    } catch {
      toast.error("Failed to add thread to group");
      setGroups((prev) =>
        prev.map((g) =>
          g.id === groupId
            ? { ...g, crm_email_group_threads: (g.crm_email_group_threads ?? []).filter((t) => t.id !== tempId) }
            : g
        )
      );
    }
  }, []);

  const removeThreadFromGroup = React.useCallback(async (groupId: string, threadId: string) => {
    const group = groupsRef.current.find((g) => g.id === groupId);
    const removed = (group?.crm_email_group_threads ?? []).find((t) => t.thread_id === threadId);
    setGroups((prev) =>
      prev.map((g) =>
        g.id === groupId
          ? { ...g, crm_email_group_threads: (g.crm_email_group_threads ?? []).filter((t) => t.thread_id !== threadId) }
          : g
      )
    );

    try {
      const res = await globalThis.fetch(
        `/api/email/groups/threads?group_id=${groupId}&thread_id=${threadId}`,
        { method: "DELETE" }
      );
      const json = await res.json();
      if (json.error) {
        toast.error(json.error);
        if (removed) {
          setGroups((prev) =>
            prev.map((g) =>
              g.id === groupId
                ? { ...g, crm_email_group_threads: [...(g.crm_email_group_threads ?? []), removed] }
                : g
            )
          );
        }
      }
    } catch {
      toast.error("Failed to remove thread");
      if (removed) {
        setGroups((prev) =>
          prev.map((g) =>
            g.id === groupId
              ? { ...g, crm_email_group_threads: [...(g.crm_email_group_threads ?? []), removed] }
              : g
          )
        );
      }
    }
  }, []);

  return { groups, loading, loadingThreads, createGroup, deleteGroup, toggleCollapse, renameGroup, addThreadToGroup, removeThreadFromGroup, refresh: fetchGroups };
}

// ── EmailGroupPanel Component ────────────────────────────────

interface EmailGroupPanelProps {
  groups: EmailGroup[];
  loading: boolean;
  loadingThreads: Set<string>;
  panelCollapsed: boolean;
  onTogglePanel: () => void;
  onToggleGroup: (id: string) => void;
  onCreateGroup: (name: string, color?: string) => Promise<EmailGroup | null>;
  onDeleteGroup: (id: string) => void;
  onRenameGroup: (id: string, name: string) => void;
  onDropThread: (groupId: string, data: DragThreadData) => void;
  onRemoveThread: (groupId: string, threadId: string) => void;
  onSelectThread: (threadId: string) => void;
  onArchiveThread: (threadId: string) => void;
}

export function EmailGroupPanel({
  groups,
  loading,
  loadingThreads,
  panelCollapsed,
  onTogglePanel,
  onToggleGroup,
  onCreateGroup,
  onDeleteGroup,
  onRenameGroup,
  onDropThread,
  onRemoveThread,
  onSelectThread,
  onArchiveThread,
}: EmailGroupPanelProps) {
  const [creating, setCreating] = React.useState(false);
  const [newName, setNewName] = React.useState("");
  const [newColor, setNewColor] = React.useState(GROUP_COLORS[0]);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [archiveOver, setArchiveOver] = React.useState(false);

  React.useEffect(() => {
    if (creating) inputRef.current?.focus();
  }, [creating]);

  async function handleCreateSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    const result = await onCreateGroup(newName.trim(), newColor);
    if (result !== null) {
      // Success — close form
      setNewName("");
      setNewColor(GROUP_COLORS[Math.floor(Math.random() * GROUP_COLORS.length)]);
      setCreating(false);
    }
    // On failure (null), keep form open with input preserved
  }

  return (
    <div className="border-b border-white/10 shrink-0" style={{ backgroundColor: "hsl(var(--surface-1))" }}>
      {/* Panel header — always visible */}
      <div className="flex items-center justify-between px-4 py-2">
        <button
          onClick={onTogglePanel}
          className="flex items-center gap-2 text-xs font-medium text-foreground hover:text-foreground/80 transition"
        >
          <ChevronDown className={cn("h-3 w-3 transition-transform", panelCollapsed && "-rotate-90")} />
          <Folder className="h-3.5 w-3.5 text-primary" />
          <span>Groups</span>
          <span className="text-[10px] text-muted-foreground">({groups.length})</span>
        </button>

        <div className="flex items-center gap-1.5">
          {/* Gmail label info */}
          <div
            className="flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground/50 cursor-help"
            title="Groups sync as Gmail labels (SupraCRM/Name). Changes here are reflected in your Gmail."
          >
            <Info className="h-3 w-3" />
          </div>

          {/* Archive drop zone */}
          <div
            onDragOver={(e) => {
              if (e.dataTransfer.types.includes(EMAIL_THREAD_DRAG_TYPE)) {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                setArchiveOver(true);
              }
            }}
            onDragLeave={() => setArchiveOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setArchiveOver(false);
              const raw = e.dataTransfer.getData(EMAIL_THREAD_DRAG_TYPE);
              if (!raw) return;
              try {
                const data: DragThreadData = JSON.parse(raw);
                onArchiveThread(data.threadId);
              } catch { /* ignore parse errors */ }
            }}
            className={cn(
              "flex items-center justify-center w-7 h-7 rounded-md transition-all",
              archiveOver
                ? "bg-amber-500/20 text-amber-400 scale-110 ring-1 ring-amber-500/40"
                : "text-muted-foreground hover:text-foreground hover:bg-white/5"
            )}
            title="Drag thread here to archive"
          >
            <Archive className="h-3.5 w-3.5" />
          </div>

          {/* Create group button */}
          {!panelCollapsed && (
            <button
              onClick={() => setCreating(true)}
              className="flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-white/5 transition"
              title="New group"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Collapsible body */}
      {!panelCollapsed && (
        <div className="max-h-[320px] overflow-y-auto thin-scroll">
          {loading ? (
            <div className="px-4 py-3 text-xs text-muted-foreground">Loading groups...</div>
          ) : groups.length === 0 && !creating ? (
            <div className="px-4 py-3 text-xs text-muted-foreground">
              No groups yet.{" "}
              <button onClick={() => setCreating(true)} className="text-primary hover:underline">
                Create one
              </button>{" "}
              or drag threads here.
            </div>
          ) : (
            <>
              {groups.map((group) => (
                <GroupRow
                  key={group.id}
                  group={group}
                  isLoadingThreads={loadingThreads.has(group.id)}
                  onToggle={() => onToggleGroup(group.id)}
                  onDelete={() => onDeleteGroup(group.id)}
                  onRename={(name) => onRenameGroup(group.id, name)}
                  onDrop={(data) => onDropThread(group.id, data)}
                  onRemoveThread={(threadId) => onRemoveThread(group.id, threadId)}
                  onSelectThread={onSelectThread}
                />
              ))}
            </>
          )}

          {/* Inline create form */}
          {creating && (
            <form onSubmit={handleCreateSubmit} className="px-4 py-2 space-y-2">
              <div className="flex items-center gap-2">
                <input
                  ref={inputRef}
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Escape") { setCreating(false); setNewName(""); } }}
                  placeholder="Group name..."
                  maxLength={100}
                  className="flex-1 bg-white/5 border border-white/10 rounded-md px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                />
                <button
                  type="submit"
                  disabled={!newName.trim()}
                  className="text-[10px] font-medium text-primary hover:text-primary/80 disabled:opacity-40 transition"
                >
                  Add
                </button>
                <button
                  type="button"
                  onClick={() => { setCreating(false); setNewName(""); }}
                  className="text-[10px] text-muted-foreground hover:text-foreground transition"
                >
                  Cancel
                </button>
              </div>
              {/* Color presets */}
              <div className="flex items-center gap-1.5 pl-0.5">
                {GROUP_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setNewColor(c)}
                    className={cn(
                      "h-4 w-4 rounded-full transition-all",
                      newColor === c ? "ring-2 ring-white/60 scale-110" : "opacity-60 hover:opacity-100"
                    )}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

// ── GroupRow ──────────────────────────────────────────────────

function GroupRow({
  group,
  isLoadingThreads,
  onToggle,
  onDelete,
  onRename,
  onDrop,
  onRemoveThread,
  onSelectThread,
}: {
  group: EmailGroup;
  isLoadingThreads: boolean;
  onToggle: () => void;
  onDelete: () => void;
  onRename: (name: string) => void;
  onDrop: (data: DragThreadData) => void;
  onRemoveThread: (threadId: string) => void;
  onSelectThread: (threadId: string) => void;
}) {
  const [dragOver, setDragOver] = React.useState(false);
  const [editing, setEditing] = React.useState(false);
  const [editName, setEditName] = React.useState(group.name);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const editRef = React.useRef<HTMLInputElement>(null);
  const recentDropsRef = React.useRef(new Set<string>());
  const threads = group.crm_email_group_threads ?? [];

  React.useEffect(() => {
    if (editing) editRef.current?.focus();
  }, [editing]);

  // Auto-dismiss delete confirm after 3s
  React.useEffect(() => {
    if (!confirmDelete) return;
    const t = setTimeout(() => setConfirmDelete(false), 3000);
    return () => clearTimeout(t);
  }, [confirmDelete]);

  function handleDragOver(e: React.DragEvent) {
    if (e.dataTransfer.types.includes(EMAIL_THREAD_DRAG_TYPE)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setDragOver(true);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const raw = e.dataTransfer.getData(EMAIL_THREAD_DRAG_TYPE);
    if (!raw) return;
    try {
      const data: DragThreadData = JSON.parse(raw);
      if (threads.some((t) => t.thread_id === data.threadId) || recentDropsRef.current.has(data.threadId)) {
        toast("Thread already in this group");
        return;
      }
      recentDropsRef.current.add(data.threadId);
      setTimeout(() => recentDropsRef.current.delete(data.threadId), 2000);
      onDrop(data);
      toast(`Added to "${group.name}"`);
    } catch { /* ignore parse errors */ }
  }

  function handleRenameSubmit() {
    if (editName.trim() && editName.trim() !== group.name) {
      onRename(editName.trim());
    } else {
      setEditName(group.name);
    }
    setEditing(false);
  }

  function handleDeleteClick() {
    if (confirmDelete) {
      onDelete();
      setConfirmDelete(false);
    } else {
      setConfirmDelete(true);
    }
  }

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      className={cn(
        "transition-colors",
        dragOver && "ring-1 ring-inset ring-primary/40 bg-primary/5"
      )}
    >
      {/* Group header */}
      <div className="flex items-center gap-2 px-4 py-1.5 group/row">
        <button onClick={onToggle} className="shrink-0">
          <ChevronDown className={cn("h-2.5 w-2.5 text-muted-foreground transition-transform", group.is_collapsed && "-rotate-90")} />
        </button>
        <div
          className="h-2.5 w-2.5 rounded-sm shrink-0"
          style={{ backgroundColor: group.color }}
        />

        {editing ? (
          <input
            ref={editRef}
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={handleRenameSubmit}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleRenameSubmit();
              if (e.key === "Escape") { setEditName(group.name); setEditing(false); }
            }}
            maxLength={100}
            className="flex-1 bg-white/5 border border-white/10 rounded px-1.5 py-0.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
          />
        ) : (
          <span
            className="text-xs font-medium text-foreground flex-1 truncate cursor-pointer"
            onDoubleClick={() => { setEditName(group.name); setEditing(true); }}
            title={group.gmail_label_id ? `Gmail label: SupraCRM/${group.name}` : "Double-click to rename"}
          >
            {group.name}
          </span>
        )}

        <span className="text-[10px] text-muted-foreground shrink-0">
          {threads.length}
        </span>

        {/* Edit button — visible on hover */}
        <button
          onClick={() => { setEditName(group.name); setEditing(true); }}
          className="opacity-0 group-hover/row:opacity-100 text-muted-foreground hover:text-foreground transition shrink-0"
          title="Rename"
        >
          <Pencil className="h-2.5 w-2.5" />
        </button>

        {confirmDelete ? (
          <button
            onClick={handleDeleteClick}
            className="text-[10px] font-medium text-red-400 hover:text-red-300 transition shrink-0 animate-pulse"
            title={group.gmail_label_id ? "This will also delete the Gmail label and remove it from all threads" : "Delete this group"}
          >
            Delete?
          </button>
        ) : (
          <button
            onClick={handleDeleteClick}
            className="opacity-0 group-hover/row:opacity-100 text-muted-foreground hover:text-red-400 transition shrink-0"
            title={group.gmail_label_id ? "Delete group and Gmail label" : "Delete group"}
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* Thread items */}
      {!group.is_collapsed && (
        <div className="pl-9 pr-4">
          {isLoadingThreads ? (
            <div className="flex items-center gap-1.5 py-2">
              <Loader2 className="h-3 w-3 text-muted-foreground animate-spin" />
              <span className="text-[10px] text-muted-foreground">Loading threads...</span>
            </div>
          ) : group.crm_email_group_threads === null ? (
            <button
              onClick={onToggle}
              className="text-[10px] text-primary/60 hover:text-primary py-1.5 italic transition"
            >
              Click to load threads
            </button>
          ) : threads.length > 0 ? (
            threads.map((t) => (
              <GroupThreadItem
                key={t.id}
                thread={t}
                onSelect={() => onSelectThread(t.thread_id)}
                onRemove={() => onRemoveThread(t.thread_id)}
              />
            ))
          ) : (
            <div className="py-2 border border-dashed border-white/10 rounded-md text-center">
              <p className="text-[10px] text-muted-foreground/50 italic">Drag emails here</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── GroupThreadItem ──────────────────────────────────────────

function GroupThreadItem({
  thread,
  onSelect,
  onRemove,
}: {
  thread: EmailGroupThread;
  onSelect: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-2 py-1 group/thread">
      <button
        onClick={onSelect}
        className="flex-1 min-w-0 text-left hover:bg-white/[0.03] rounded px-1.5 py-0.5 transition"
      >
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-foreground/70 truncate flex-1">
            {thread.from_name || thread.from_email || "Unknown"} — {thread.subject || "(no subject)"}
          </span>
          {thread.last_message_at && (
            <span className="text-[9px] text-muted-foreground shrink-0">
              {timeAgo(thread.last_message_at)}
            </span>
          )}
        </div>
      </button>
      <button
        onClick={onRemove}
        className="opacity-0 group-hover/thread:opacity-100 text-muted-foreground hover:text-red-400 transition shrink-0"
        title="Remove from group"
      >
        <X className="h-2.5 w-2.5" />
      </button>
    </div>
  );
}
