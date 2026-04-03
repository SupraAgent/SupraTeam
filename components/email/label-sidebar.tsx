"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import type { Label } from "@/lib/email/types";
import { Plus, Check, Loader2, ChevronRight, ChevronDown } from "lucide-react";
import { toast } from "sonner";

const LABEL_COLORS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e", "#06b6d4",
  "#3b82f6", "#8b5cf6", "#ec4899", "#6b7280",
] as const;

// System labels we care about, in order
const SYSTEM_LABELS = [
  { id: "INBOX", name: "Inbox", icon: InboxIcon },
  { id: "STARRED", name: "Starred", icon: StarIcon },
  { id: "SENT", name: "Sent", icon: SendIcon },
  { id: "DRAFT", name: "Drafts", icon: DraftIcon },
  { id: "SPAM", name: "Spam", icon: SpamIcon },
  { id: "TRASH", name: "Trash", icon: TrashIcon },
] as const;

type LabelSidebarProps = {
  labels: Label[];
  activeLabel: string;
  onSelectLabel: (labelId: string) => void;
  unreadCounts: Record<string, number>;
  onDeleteLabel?: (labelId: string) => void;
  onAddThreadsToLabel?: (threadIds: string[], labelId: string) => void;
  connectionId?: string;
  onLabelsRefresh?: () => void;
};

export function LabelSidebar({ labels, activeLabel, onSelectLabel, unreadCounts, onDeleteLabel, onAddThreadsToLabel, connectionId, onLabelsRefresh }: LabelSidebarProps) {
  const userLabels = labels.filter((l) => l.type === "user");
  const [confirmDelete, setConfirmDelete] = React.useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = React.useState<string | null>(null);
  const [dropFlashId, setDropFlashId] = React.useState<string | null>(null);
  const [showCreateLabel, setShowCreateLabel] = React.useState(false);
  const [newLabelName, setNewLabelName] = React.useState("");
  const [newLabelColor, setNewLabelColor] = React.useState<string>(LABEL_COLORS[5]);
  const [creating, setCreating] = React.useState(false);
  const [collapsedGroups, setCollapsedGroups] = React.useState<Set<string>>(new Set());

  async function handleCreateLabel() {
    if (!newLabelName.trim() || !connectionId) return;
    setCreating(true);
    try {
      const res = await fetch("/api/email/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newLabelName.trim(), connection_id: connectionId, color: newLabelColor }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? "Failed to create label");
        return;
      }
      toast("Label created");
      setNewLabelName("");
      setShowCreateLabel(false);
      onLabelsRefresh?.();
    } catch {
      toast.error("Failed to create label");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="w-full space-y-1">
      {/* System labels */}
      {SYSTEM_LABELS.map((sl) => (
        <button
          key={sl.id}
          onClick={() => onSelectLabel(sl.id)}
          className={cn(
            "w-full flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors",
            activeLabel === sl.id
              ? "bg-white/10 text-foreground"
              : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
          )}
        >
          <sl.icon className="h-3.5 w-3.5 shrink-0" />
          <span className="flex-1 text-left">{sl.name}</span>
          {(unreadCounts[sl.id] ?? 0) > 0 && (
            <span className="text-[10px] text-primary font-semibold">
              {unreadCounts[sl.id]}
            </span>
          )}
        </button>
      ))}

      {/* User labels */}
      <>
        <div className="pt-2 pb-1 px-2.5 flex items-center justify-between">
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50">
            Labels
          </span>
          <button
            onClick={() => setShowCreateLabel(!showCreateLabel)}
            className="rounded p-0.5 text-muted-foreground/50 hover:text-foreground hover:bg-white/5 transition"
            title="Create label"
          >
            <Plus className="h-3 w-3" />
          </button>
        </div>

        {/* Inline create label */}
        {showCreateLabel && (
          <div className="px-2.5 pb-1 space-y-1.5">
            <div className="flex items-center gap-1">
              <div
                className="h-4 w-4 rounded-full shrink-0 border border-white/20"
                style={{ backgroundColor: newLabelColor }}
              />
              <input
                type="text"
                value={newLabelName}
                onChange={(e) => setNewLabelName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreateLabel();
                  if (e.key === "Escape") { setShowCreateLabel(false); setNewLabelName(""); }
                }}
                placeholder="Label name..."
                className="flex-1 min-w-0 rounded-md px-2 py-1 text-[11px] bg-white/5 border border-white/10 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50"
                autoFocus
              />
              <button
                onClick={handleCreateLabel}
                disabled={creating || !newLabelName.trim()}
                className="rounded p-1 text-primary hover:bg-primary/10 transition disabled:opacity-30"
              >
                {creating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
              </button>
            </div>
            <div className="flex items-center gap-1 pl-0.5">
              {LABEL_COLORS.map((color) => (
                <button
                  key={color}
                  onClick={() => setNewLabelColor(color)}
                  className={cn(
                    "h-3.5 w-3.5 rounded-full transition-all",
                    newLabelColor === color ? "ring-2 ring-white/60 scale-110" : "hover:scale-110"
                  )}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>
        )}
        {/* Render labels with nested grouping by "/" prefix */}
        {(() => {
          // Group labels: "Parent/Child" groups under "Parent"
          const topLevel: Label[] = [];
          const nested: Record<string, Label[]> = {};
          for (const label of userLabels) {
            if (label.name.includes("/")) {
              const parent = label.name.split("/")[0];
              if (!nested[parent]) nested[parent] = [];
              nested[parent].push(label);
            } else {
              topLevel.push(label);
            }
          }
          // Render standalone parents that also have children
          const parentNames = Object.keys(nested);
          const renderedParents = new Set<string>();

          return (
            <>
              {topLevel.map((label) => {
                const children = nested[label.name];
                const hasChildren = children && children.length > 0;
                if (hasChildren) renderedParents.add(label.name);
                return (
                  <React.Fragment key={label.id}>
                    <LabelRow
                      label={label}
                      displayName={label.name}
                      activeLabel={activeLabel}
                      onSelectLabel={onSelectLabel}
                      onDeleteLabel={onDeleteLabel}
                      onAddThreadsToLabel={onAddThreadsToLabel}
                      confirmDelete={confirmDelete}
                      setConfirmDelete={setConfirmDelete}
                      dropTargetId={dropTargetId}
                      setDropTargetId={setDropTargetId}
                      dropFlashId={dropFlashId}
                      setDropFlashId={setDropFlashId}
                      hasChildren={hasChildren}
                      collapsed={collapsedGroups.has(label.name)}
                      onToggleCollapse={() => setCollapsedGroups((prev) => {
                        const next = new Set(prev);
                        if (next.has(label.name)) next.delete(label.name);
                        else next.add(label.name);
                        return next;
                      })}
                    />
                    {hasChildren && !collapsedGroups.has(label.name) && children.map((child) => (
                      <LabelRow
                        key={child.id}
                        label={child}
                        displayName={child.name.split("/").pop()!}
                        activeLabel={activeLabel}
                        onSelectLabel={onSelectLabel}
                        onDeleteLabel={onDeleteLabel}
                        onAddThreadsToLabel={onAddThreadsToLabel}
                        confirmDelete={confirmDelete}
                        setConfirmDelete={setConfirmDelete}
                        dropTargetId={dropTargetId}
                        setDropTargetId={setDropTargetId}
                        dropFlashId={dropFlashId}
                        setDropFlashId={setDropFlashId}
                        indent
                      />
                    ))}
                  </React.Fragment>
                );
              })}
              {/* Orphan groups — nested labels whose parent isn't a standalone label */}
              {parentNames.filter((p) => !renderedParents.has(p)).map((parentName) => (
                <React.Fragment key={`group-${parentName}`}>
                  <button
                    onClick={() => setCollapsedGroups((prev) => {
                      const next = new Set(prev);
                      if (next.has(parentName)) next.delete(parentName);
                      else next.add(parentName);
                      return next;
                    })}
                    className="w-full flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:bg-white/5 transition-colors"
                  >
                    {collapsedGroups.has(parentName) ? (
                      <ChevronRight className="h-3 w-3 shrink-0" />
                    ) : (
                      <ChevronDown className="h-3 w-3 shrink-0" />
                    )}
                    <span>{parentName}</span>
                  </button>
                  {!collapsedGroups.has(parentName) && nested[parentName].map((child) => (
                    <LabelRow
                      key={child.id}
                      label={child}
                      displayName={child.name.split("/").pop()!}
                      activeLabel={activeLabel}
                      onSelectLabel={onSelectLabel}
                      onDeleteLabel={onDeleteLabel}
                      onAddThreadsToLabel={onAddThreadsToLabel}
                      confirmDelete={confirmDelete}
                      setConfirmDelete={setConfirmDelete}
                      dropTargetId={dropTargetId}
                      setDropTargetId={setDropTargetId}
                      dropFlashId={dropFlashId}
                      setDropFlashId={setDropFlashId}
                      indent
                    />
                  ))}
                </React.Fragment>
              ))}
            </>
          );
        })()}
      </>
    </div>
  );
}

// ── Extracted label row (supports nesting + colors) ─────────

function LabelRow({
  label,
  displayName,
  activeLabel,
  onSelectLabel,
  onDeleteLabel,
  onAddThreadsToLabel,
  confirmDelete,
  setConfirmDelete,
  dropTargetId,
  setDropTargetId,
  dropFlashId,
  setDropFlashId,
  indent,
  hasChildren,
  collapsed,
  onToggleCollapse,
}: {
  label: Label;
  displayName: string;
  activeLabel: string;
  onSelectLabel: (id: string) => void;
  onDeleteLabel?: (id: string) => void;
  onAddThreadsToLabel?: (threadIds: string[], labelId: string) => void;
  confirmDelete: string | null;
  setConfirmDelete: (id: string | null) => void;
  dropTargetId: string | null;
  setDropTargetId: (id: string | null) => void;
  dropFlashId: string | null;
  setDropFlashId: (id: string | null) => void;
  indent?: boolean;
  hasChildren?: boolean;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}) {
  if (confirmDelete === label.id) {
    return (
      <div className={cn("rounded-lg px-2.5 py-1.5 bg-red-500/10 border border-red-500/20", indent && "ml-3")}>
        <p className="text-[10px] text-red-400 mb-1.5">
          Delete &ldquo;{displayName}&rdquo;?
        </p>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => { onDeleteLabel?.(label.id); setConfirmDelete(null); }}
            className="rounded px-2 py-0.5 text-[10px] font-medium bg-red-500/20 text-red-400 hover:bg-red-500/30 transition"
          >
            Yes
          </button>
          <button
            onClick={() => setConfirmDelete(null)}
            className="rounded px-2 py-0.5 text-[10px] font-medium bg-white/5 text-muted-foreground hover:bg-white/10 transition"
          >
            No
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("relative group", indent && "ml-3")}>
      <button
        onClick={() => onSelectLabel(label.id)}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes("application/x-thread-ids")) {
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
            setDropTargetId(label.id);
          }
        }}
        onDragLeave={() => setDropTargetId(null)}
        onDrop={(e) => {
          e.preventDefault();
          setDropTargetId(null);
          const raw = e.dataTransfer.getData("application/x-thread-ids");
          if (!raw) return;
          try {
            const ids = JSON.parse(raw) as string[];
            onAddThreadsToLabel?.(ids, label.id);
            setDropFlashId(label.id);
            setTimeout(() => setDropFlashId(null), 600);
          } catch { /* ignore */ }
        }}
        className={cn(
          "w-full flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors",
          dropFlashId === label.id
            ? "bg-green-500/20 text-green-400 ring-1 ring-green-500/40"
            : dropTargetId === label.id
              ? "bg-primary/20 text-primary ring-1 ring-primary/40"
              : activeLabel === label.id
                ? "bg-white/10 text-foreground"
                : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
        )}
      >
        {hasChildren && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => { e.stopPropagation(); onToggleCollapse?.(); }}
            onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); onToggleCollapse?.(); } }}
            className="shrink-0"
          >
            {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </span>
        )}
        <div
          className="h-2.5 w-2.5 rounded-full shrink-0"
          style={{ backgroundColor: label.color ?? "hsl(var(--primary))" }}
        />
        <span className="flex-1 text-left truncate">{displayName}</span>
        {(label.unreadCount ?? 0) > 0 && (
          <span className="text-[10px] text-muted-foreground">
            {label.unreadCount}
          </span>
        )}
        {onDeleteLabel && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => { e.stopPropagation(); setConfirmDelete(label.id); }}
            onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); setConfirmDelete(label.id); } }}
            className="opacity-0 group-hover:opacity-100 shrink-0 rounded p-0.5 text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition"
            title="Delete label"
          >
            <DeleteIcon className="h-3 w-3" />
          </span>
        )}
      </button>
    </div>
  );
}

function DeleteIcon({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>;
}

// ── Inline SVGs ─────────────────────────────────────────────

function InboxIcon({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12" /><path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z" /></svg>;
}

function StarIcon({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>;
}

function SendIcon({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>;
}

function DraftIcon({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>;
}

function SpamIcon({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>;
}

function TrashIcon({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>;
}
