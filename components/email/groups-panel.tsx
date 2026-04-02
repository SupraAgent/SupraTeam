"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { timeAgo } from "@/lib/utils";
import type { Label, ThreadListItem } from "@/lib/email/types";
import { useGroups } from "@/lib/email/use-groups";
import { ContactAvatar } from "./contact-avatar";
import {
  ChevronDown,
  ChevronRight,
  FolderOpen,
  Plus,
  X,
  ArrowUpDown,
  Calendar,
  Check,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

interface GroupsPanelProps {
  labels: Label[];
  connectionId?: string;
  onSelectLabel: (labelId: string) => void;
  onSelectThread?: (threadId: string) => void;
  onLabelsRefresh?: () => void;
}

export function GroupsPanel({ labels, connectionId, onSelectLabel, onSelectThread, onLabelsRefresh }: GroupsPanelProps) {
  const {
    visibleGroups,
    hiddenGroups,
    addGroup,
    removeGroup,
    collapsedGroups,
    toggleCollapsed,
    sortOrder,
    setSortOrder,
  } = useGroups(labels);

  const [addMenuOpen, setAddMenuOpen] = React.useState(false);
  const addBtnRef = React.useRef<HTMLButtonElement>(null);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-3 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-2">
          <FolderOpen className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">
            Groups
          </h2>
          <span className="text-xs text-muted-foreground">
            ({visibleGroups.length})
          </span>
        </div>
        <div className="flex items-center gap-1">
          {/* Sort toggle */}
          <button
            onClick={() => setSortOrder(sortOrder === "newest" ? "oldest" : "newest")}
            className="rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-white/5 transition"
            title={`Sort: ${sortOrder}`}
          >
            <ArrowUpDown className="h-3.5 w-3.5" />
          </button>
          {/* Add group */}
          <div className="relative">
            <button
              ref={addBtnRef}
              onClick={() => setAddMenuOpen(!addMenuOpen)}
              className="rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-white/5 transition"
              title="Add group"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
            {addMenuOpen && (
              <AddGroupDropdown
                hiddenGroups={hiddenGroups}
                connectionId={connectionId}
                onAdd={(id) => { addGroup(id); setAddMenuOpen(false); }}
                onCreated={() => { onLabelsRefresh?.(); setAddMenuOpen(false); }}
                onClose={() => setAddMenuOpen(false)}
              />
            )}
          </div>
        </div>
      </div>

      {/* Groups list */}
      <div className="flex-1 overflow-y-auto thin-scroll">
        {visibleGroups.length === 0 ? (
          <div className="px-3 py-8 text-center text-muted-foreground/50 text-xs">
            No groups added. Click + to add Gmail labels as groups.
          </div>
        ) : (
          visibleGroups.map((group) => (
            <GroupSection
              key={group.id}
              group={group}
              connectionId={connectionId}
              isCollapsed={collapsedGroups.has(group.id)}
              onToggle={() => toggleCollapsed(group.id)}
              onRemove={() => removeGroup(group.id)}
              onClickLabel={() => onSelectLabel(group.id)}
              onSelectThread={onSelectThread}
              sortOrder={sortOrder}
            />
          ))
        )}

        {/* Calendar placeholder */}
        <div className="border-t border-white/10 mt-2">
          <div className="flex items-center gap-2 px-3 py-3">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold text-foreground">Calendar</h3>
            <span className="text-xs text-muted-foreground">(0)</span>
          </div>
          <div className="px-3 pb-4">
            <div className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 mb-2">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Today (0)
              </span>
            </div>
            <div className="flex flex-col items-center justify-center py-6 text-muted-foreground/40 gap-2">
              <Calendar className="h-8 w-8" />
              <p className="text-xs">No upcoming events</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Group Section ────────────────────────────────────────────

interface GroupSectionProps {
  group: Label;
  connectionId?: string;
  isCollapsed: boolean;
  onToggle: () => void;
  onRemove: () => void;
  onClickLabel: () => void;
  onSelectThread?: (threadId: string) => void;
  sortOrder: "newest" | "oldest";
}

function GroupSection({
  group,
  connectionId,
  isCollapsed,
  onToggle,
  onRemove,
  onClickLabel,
  onSelectThread,
  sortOrder,
}: GroupSectionProps) {
  const [threads, setThreads] = React.useState<ThreadListItem[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [fetched, setFetched] = React.useState(false);

  // Fetch threads for this label on expand
  React.useEffect(() => {
    if (isCollapsed || fetched) return;

    setLoading(true);
    const params = new URLSearchParams();
    params.set("labelIds", group.id);
    params.set("maxResults", "10");
    if (connectionId) params.set("connectionId", connectionId);

    fetch(`/api/email/threads?${params}`)
      .then((r) => r.json())
      .then((json) => {
        setThreads(json.threads ?? []);
        setFetched(true);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [isCollapsed, fetched, group.id, connectionId]);

  const sortedThreads = React.useMemo(() => {
    const sorted = [...threads];
    sorted.sort((a, b) => {
      const da = new Date(a.lastMessageAt).getTime();
      const db = new Date(b.lastMessageAt).getTime();
      return sortOrder === "newest" ? db - da : da - db;
    });
    return sorted;
  }, [threads, sortOrder]);

  const displayName = group.name.includes("/")
    ? group.name.split("/").pop()!
    : group.name;

  return (
    <div className="border-b border-white/5">
      {/* Group header */}
      <div className="flex items-center gap-2 px-3 py-2.5 hover:bg-white/[0.03] transition-colors group">
        <button onClick={onToggle} className="shrink-0 text-muted-foreground hover:text-foreground transition">
          {isCollapsed ? (
            <ChevronRight className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )}
        </button>
        <div
          className="h-3 w-3 rounded-full shrink-0"
          style={{ backgroundColor: group.color ?? "hsl(var(--primary))" }}
        />
        <button
          onClick={onClickLabel}
          className="flex-1 text-left text-sm font-medium text-foreground hover:text-primary transition truncate"
          title={`Filter by ${group.name}`}
        >
          {displayName}
        </button>
        <span className="text-xs text-muted-foreground tabular-nums">
          {group.messageCount ?? threads.length}
        </span>
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="opacity-0 group-hover:opacity-100 shrink-0 rounded p-0.5 text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition"
          title="Remove group"
        >
          <X className="h-3 w-3" />
        </button>
      </div>

      {/* Group threads */}
      {!isCollapsed && (
        <div className="px-2 pb-2 space-y-1">
          {loading ? (
            <div className="px-3 py-4 text-center text-xs text-muted-foreground/50">
              Loading...
            </div>
          ) : sortedThreads.length === 0 ? (
            <div className="px-3 py-3 text-center text-xs text-muted-foreground/40">
              No emails in this label
            </div>
          ) : (
            sortedThreads.map((thread) => (
              <GroupThreadItem
                key={thread.id}
                thread={thread}
                onClick={() => onSelectThread?.(thread.id)}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ── Group Thread Item (styled with border box) ───────────────

function GroupThreadItem({
  thread,
  onClick,
}: {
  thread: ThreadListItem;
  onClick?: () => void;
}) {
  const sender = thread.from[0]?.name || thread.from[0]?.email || "Unknown";

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left rounded-lg border border-white/10 bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/15 transition p-3 flex gap-2.5",
        thread.isUnread && "border-primary/20 bg-primary/[0.03]"
      )}
    >
      <div className="shrink-0 pt-0.5">
        <ContactAvatar
          email={thread.from[0]?.email ?? ""}
          name={thread.from[0]?.name}
          size={24}
        />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className={cn(
            "text-sm truncate",
            thread.isUnread ? "font-semibold text-foreground" : "text-foreground/80"
          )}>
            {sender}
          </span>
          <span className="text-[10px] text-muted-foreground shrink-0">
            {timeAgo(thread.lastMessageAt)}
          </span>
        </div>
        <p className={cn(
          "text-xs truncate mt-0.5",
          thread.isUnread ? "text-foreground/90" : "text-muted-foreground"
        )}>
          {thread.subject}
        </p>
      </div>
      {thread.isUnread && (
        <div className="pt-1 shrink-0">
          <div className="h-2 w-2 rounded-full bg-primary" />
        </div>
      )}
    </button>
  );
}

// ── Add Group Dropdown ───────────────────────────────────────

function AddGroupDropdown({
  hiddenGroups,
  connectionId,
  onAdd,
  onCreated,
  onClose,
}: {
  hiddenGroups: Label[];
  connectionId?: string;
  onAdd: (labelId: string) => void;
  onCreated: () => void;
  onClose: () => void;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [newName, setNewName] = React.useState("");
  const [creating, setCreating] = React.useState(false);

  React.useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const timer = setTimeout(() => document.addEventListener("click", handle), 0);
    return () => { clearTimeout(timer); document.removeEventListener("click", handle); };
  }, [onClose]);

  async function handleCreate() {
    if (!newName.trim() || !connectionId) return;
    setCreating(true);
    try {
      const res = await fetch("/api/email/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), connection_id: connectionId }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? "Failed to create group");
        return;
      }
      toast("Group created — Gmail label synced");
      setNewName("");
      onCreated();
    } catch {
      toast.error("Failed to create group");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div
      ref={ref}
      className="absolute right-0 top-full mt-1 z-[100] w-56 max-h-72 overflow-y-auto rounded-lg border border-white/10 shadow-2xl py-1 thin-scroll"
      style={{ backgroundColor: "hsl(var(--surface-3))" }}
    >
      {/* Create new group */}
      <div className="px-2 py-2 border-b border-white/5">
        <div className="flex items-center gap-1.5">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            placeholder="New group name..."
            className="flex-1 rounded-md px-2 py-1.5 text-xs bg-white/5 border border-white/10 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
            autoFocus
          />
          <button
            onClick={handleCreate}
            disabled={creating || !newName.trim()}
            className="rounded-md p-1.5 text-primary hover:bg-primary/10 transition disabled:opacity-30"
          >
            {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          </button>
        </div>
        <p className="text-[10px] text-muted-foreground/50 mt-1 px-0.5">
          Creates a Gmail label + group
        </p>
      </div>

      {/* Existing hidden labels to re-add */}
      {hiddenGroups.length > 0 && (
        <>
          <div className="px-3 py-1.5 text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
            Available Groups
          </div>
          {hiddenGroups.map((label) => (
            <button
              key={label.id}
              onClick={() => onAdd(label.id)}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-foreground/90 hover:bg-white/5 transition"
            >
              <div
                className="h-2.5 w-2.5 rounded-full shrink-0"
                style={{ backgroundColor: label.color ?? "hsl(var(--primary))" }}
              />
              <span className="flex-1 text-left truncate">{label.name}</span>
              <Plus className="h-3 w-3 text-muted-foreground" />
            </button>
          ))}
        </>
      )}

      {hiddenGroups.length === 0 && (
        <div className="px-3 py-2 text-xs text-muted-foreground/60 text-center">
          All Gmail groups are visible
        </div>
      )}
    </div>
  );
}
