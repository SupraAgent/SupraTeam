"use client";

import * as React from "react";
import { cn, timeAgo } from "@/lib/utils";
import { toast } from "sonner";
import { ChevronDown, Folder, Plus, X, Archive } from "lucide-react";

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
  crm_email_group_threads: EmailGroupThread[];
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
  /** All primary senders (from field) in the thread */
  primaryContacts: { email: string; name?: string }[];
}

// ── Hook: useEmailGroups ─────────────────────────────────────

export function useEmailGroups(connectionId: string | undefined) {
  const [groups, setGroups] = React.useState<EmailGroup[]>([]);
  const [loading, setLoading] = React.useState(true);

  const fetchGroups = React.useCallback(async () => {
    if (!connectionId) { setLoading(false); return; }
    try {
      const res = await globalThis.fetch(`/api/email/groups?connection_id=${connectionId}`);
      const json = await res.json();
      if (json.data) {
        const groupList: EmailGroup[] = json.data;
        setGroups(groupList);

        // Lazy-load threads for expanded Gmail-backed groups
        const gmailExpanded = groupList.filter((g) => g.gmail_label_id && !g.is_collapsed);
        if (gmailExpanded.length > 0) {
          const results = await Promise.allSettled(
            gmailExpanded.map(async (g) => {
              const tRes = await globalThis.fetch(`/api/email/groups/threads?group_id=${g.id}`);
              const tJson = await tRes.json();
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
              return g;
            })
          );
        }
      } else if (json.error) {
        toast.error(`Failed to load groups: ${json.error}`);
      }
    } catch (err) {
      toast.error("Failed to load email groups");
      console.error("fetchGroups error:", err);
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
    setGroups((prev) => [...prev, json.data]);
    return json.data as EmailGroup;
  }, [connectionId]);

  const deleteGroup = React.useCallback(async (id: string) => {
    // Snapshot before optimistic remove (read outside updater to avoid Strict Mode double-invoke bug)
    const snapshot = groups;
    const removed = snapshot.find((g) => g.id === id);
    setGroups((prev) => prev.filter((g) => g.id !== id));

    try {
      const res = await globalThis.fetch(`/api/email/groups?id=${id}`, { method: "DELETE" });
      const json = await res.json();
      if (json.error) {
        toast.error(json.error);
        if (removed) setGroups((prev) => [...prev, removed].sort((a, b) => a.position - b.position));
      }
    } catch {
      toast.error("Failed to delete group");
      if (removed) setGroups((prev) => [...prev, removed].sort((a, b) => a.position - b.position));
    }
  }, [groups]);

  const toggleCollapse = React.useCallback(async (id: string) => {
    // Read current value from snapshot to avoid Strict Mode double-invoke bug
    const current = groups.find((g) => g.id === id);
    if (!current) return;
    const newCollapsed = !current.is_collapsed;
    setGroups((prev) =>
      prev.map((g) => (g.id === id ? { ...g, is_collapsed: newCollapsed } : g))
    );

    // Lazy-load threads when expanding a Gmail-backed group
    if (!newCollapsed && current.gmail_label_id && current.crm_email_group_threads.length === 0) {
      try {
        const tRes = await globalThis.fetch(`/api/email/groups/threads?group_id=${id}`);
        const tJson = await tRes.json();
        if (tJson.data) {
          setGroups((prev) =>
            prev.map((g) => (g.id === id ? { ...g, crm_email_group_threads: tJson.data } : g))
          );
        }
      } catch {
        // Non-critical — group still expands, just empty
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
  }, [groups]);

  const renameGroup = React.useCallback(async (id: string, name: string) => {
    if (!name.trim()) return;
    const oldName = groups.find((g) => g.id === id)?.name ?? "";
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
  }, [groups]);

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

    setGroups((prev) =>
      prev.map((g) =>
        g.id === groupId
          ? { ...g, crm_email_group_threads: [newThread, ...g.crm_email_group_threads] }
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
              ? { ...g, crm_email_group_threads: g.crm_email_group_threads.filter((t) => t.id !== tempId) }
              : g
          )
        );
      } else if (json.data) {
        setGroups((prev) =>
          prev.map((g) =>
            g.id === groupId
              ? {
                  ...g,
                  crm_email_group_threads: g.crm_email_group_threads.map((t) =>
                    t.id === tempId ? { ...t, id: json.data.id } : t
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
            ? { ...g, crm_email_group_threads: g.crm_email_group_threads.filter((t) => t.id !== tempId) }
            : g
        )
      );
    }
  }, []);

  const removeThreadFromGroup = React.useCallback(async (groupId: string, threadId: string) => {
    // Snapshot removed thread outside updater to avoid Strict Mode double-invoke bug
    const group = groups.find((g) => g.id === groupId);
    const removed = group?.crm_email_group_threads.find((t) => t.thread_id === threadId);
    setGroups((prev) =>
      prev.map((g) =>
        g.id === groupId
          ? { ...g, crm_email_group_threads: g.crm_email_group_threads.filter((t) => t.thread_id !== threadId) }
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
                ? { ...g, crm_email_group_threads: [...g.crm_email_group_threads, removed] }
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
              ? { ...g, crm_email_group_threads: [...g.crm_email_group_threads, removed] }
              : g
          )
        );
      }
    }
  }, [groups]);

  return { groups, loading, createGroup, deleteGroup, toggleCollapse, renameGroup, addThreadToGroup, removeThreadFromGroup, refresh: fetchGroups };
}

// ── EmailGroupPanel Component ────────────────────────────────

interface EmailGroupPanelProps {
  groups: EmailGroup[];
  loading: boolean;
  panelCollapsed: boolean;
  onTogglePanel: () => void;
  onToggleGroup: (id: string) => void;
  onCreateGroup: (name: string) => void;
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
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [archiveOver, setArchiveOver] = React.useState(false);

  React.useEffect(() => {
    if (creating) inputRef.current?.focus();
  }, [creating]);

  function handleCreateSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (newName.trim()) {
      onCreateGroup(newName.trim());
      setNewName("");
      setCreating(false);
    }
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
              } catch (err) {
                console.error("Failed to parse drag data:", err);
              }
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
            <form onSubmit={handleCreateSubmit} className="px-4 py-2 flex items-center gap-2">
              <input
                ref={inputRef}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Escape") { setCreating(false); setNewName(""); } }}
                placeholder="Group name..."
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
  onToggle,
  onDelete,
  onRename,
  onDrop,
  onRemoveThread,
  onSelectThread,
}: {
  group: EmailGroup;
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
  const threads = group.crm_email_group_threads;

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
      // Debounce: block rapid duplicate drops for 2s
      recentDropsRef.current.add(data.threadId);
      setTimeout(() => recentDropsRef.current.delete(data.threadId), 2000);
      onDrop(data);
      toast(`Added to "${group.name}"`);
    } catch (err) {
      console.error("Failed to parse drag data:", err);
    }
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
            className="flex-1 bg-white/5 border border-white/10 rounded px-1.5 py-0.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
          />
        ) : (
          <span
            className="text-xs font-medium text-foreground flex-1 truncate cursor-pointer"
            onDoubleClick={() => { setEditName(group.name); setEditing(true); }}
            title="Double-click to rename"
          >
            {group.name}
          </span>
        )}

        <span className="text-[10px] text-muted-foreground shrink-0">
          {threads.length}
        </span>

        {confirmDelete ? (
          <button
            onClick={handleDeleteClick}
            className="text-[10px] font-medium text-red-400 hover:text-red-300 transition shrink-0 animate-pulse"
          >
            Confirm?
          </button>
        ) : (
          <button
            onClick={handleDeleteClick}
            className="opacity-0 group-hover/row:opacity-100 text-muted-foreground hover:text-red-400 transition shrink-0"
            title="Delete group"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* Thread items */}
      {!group.is_collapsed && (
        <div className="pl-9 pr-4">
          {threads.length > 0 ? (
            threads.map((t) => (
              <GroupThreadItem
                key={t.id}
                thread={t}
                onSelect={() => onSelectThread(t.thread_id)}
                onRemove={() => onRemoveThread(t.thread_id)}
              />
            ))
          ) : (
            <p className="text-[10px] text-muted-foreground/50 py-1.5 italic">Drag emails here</p>
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
