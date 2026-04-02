"use client";

import * as React from "react";
import { cn, timeAgo } from "@/lib/utils";
import type { ThreadListItem } from "@/lib/email/types";
import { ContactAvatar } from "./contact-avatar";
import { EMAIL_THREAD_DRAG_TYPE, type DragThreadData } from "./email-groups";
import { GripVertical, Inbox, Star, Archive, Trash2, MailOpen, Mail, Clock, AlertTriangle, Ban, FolderPlus } from "lucide-react";

export type ContextMenuAction = "archive" | "trash" | "star" | "read" | "unread" | "snooze" | "spam" | "block" | "add_to_group";

interface ContextMenuState {
  x: number;
  y: number;
  threadIds: string[];
}

type ThreadListProps = {
  threads: ThreadListItem[];
  selectedId: string | null;
  selectedIds?: Set<string>;
  onSelect: (id: string) => void;
  onToggleSelect?: (id: string) => void;
  onRangeSelect?: (fromIndex: number, toIndex: number) => void;
  loading: boolean;
  onLoadMore?: () => void;
  hasMore?: boolean;
  onPrefetch?: (id: string) => void;
  onSwipeArchive?: (id: string) => void;
  onSwipeSnooze?: (id: string) => void;
  onContextAction?: (threadIds: string[], action: ContextMenuAction) => void;
};

export function ThreadList({ threads, selectedId, selectedIds, onSelect, onToggleSelect, onRangeSelect, loading, onLoadMore, hasMore, onPrefetch, onSwipeArchive, onSwipeSnooze, onContextAction }: ThreadListProps) {
  const listRef = React.useRef<HTMLDivElement>(null);
  const lastClickedIndexRef = React.useRef<number>(-1);
  const [contextMenu, setContextMenu] = React.useState<ContextMenuState | null>(null);

  // Close context menu on click outside or scroll
  React.useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [contextMenu]);

  // Close on Escape
  React.useEffect(() => {
    if (!contextMenu) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setContextMenu(null);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [contextMenu]);

  function handleClick(index: number, e: React.MouseEvent) {
    const thread = threads[index];
    if (e.shiftKey && lastClickedIndexRef.current >= 0 && onRangeSelect) {
      e.preventDefault();
      onRangeSelect(lastClickedIndexRef.current, index);
    } else {
      onSelect(thread.id);
    }
    lastClickedIndexRef.current = index;
  }

  function handleContextMenu(index: number, e: React.MouseEvent) {
    e.preventDefault();
    const thread = threads[index];
    const hasMultiSelect = selectedIds && selectedIds.size > 0;
    const threadIds = hasMultiSelect && selectedIds.has(thread.id)
      ? Array.from(selectedIds)
      : [thread.id];
    setContextMenu({ x: e.clientX, y: e.clientY, threadIds });
  }

  function handleContextAction(action: ContextMenuAction) {
    if (contextMenu && onContextAction) {
      onContextAction(contextMenu.threadIds, action);
    }
    setContextMenu(null);
  }

  if (loading && threads.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
        Loading inbox...
      </div>
    );
  }

  if (!loading && threads.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-2 px-4">
        <Inbox className="h-8 w-8 opacity-40" />
        <p className="text-sm">No emails</p>
      </div>
    );
  }

  const isMultiContext = contextMenu && contextMenu.threadIds.length > 1;

  return (
    <div ref={listRef} className="flex-1 overflow-y-auto thin-scroll relative">
      {threads.map((thread, index) => (
        <ThreadRow
          key={thread.id}
          thread={thread}
          isSelected={thread.id === selectedId}
          isChecked={selectedIds?.has(thread.id) ?? false}
          showCheckbox={!!selectedIds && selectedIds.size > 0}
          onClick={(e) => handleClick(index, e)}
          onContextMenu={(e) => handleContextMenu(index, e)}
          onToggleSelect={() => onToggleSelect?.(thread.id)}
          onMouseEnter={() => onPrefetch?.(thread.id)}
          onSwipeLeft={() => onSwipeArchive?.(thread.id)}
          onSwipeRight={() => onSwipeSnooze?.(thread.id)}
        />
      ))}
      {hasMore && (
        <button
          onClick={onLoadMore}
          className="w-full py-3 text-xs text-primary hover:text-primary/80 transition"
        >
          Load more
        </button>
      )}

      {/* Right-click context menu */}
      {contextMenu && (
        <div
          className="fixed z-[100] min-w-[180px] rounded-lg border border-white/10 shadow-2xl py-1 overflow-hidden"
          style={{
            left: Math.min(contextMenu.x, typeof window !== "undefined" ? window.innerWidth - 200 : contextMenu.x),
            top: Math.min(contextMenu.y, typeof window !== "undefined" ? window.innerHeight - 320 : contextMenu.y),
            backgroundColor: "hsl(var(--surface-3))",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {isMultiContext && (
            <div className="px-3 py-1.5 text-[10px] text-muted-foreground border-b border-white/5">
              {contextMenu.threadIds.length} threads selected
            </div>
          )}
          <ContextMenuItem icon={<Archive className="h-3.5 w-3.5" />} label="Archive" shortcut="e" onClick={() => handleContextAction("archive")} />
          <ContextMenuItem icon={<Trash2 className="h-3.5 w-3.5" />} label="Delete" shortcut="#" onClick={() => handleContextAction("trash")} />
          <ContextMenuItem icon={<Star className="h-3.5 w-3.5" />} label="Star" shortcut="s" onClick={() => handleContextAction("star")} />
          <div className="h-px bg-white/5 my-1" />
          <ContextMenuItem icon={<MailOpen className="h-3.5 w-3.5" />} label="Mark as read" onClick={() => handleContextAction("read")} />
          <ContextMenuItem icon={<Mail className="h-3.5 w-3.5" />} label="Mark as unread" shortcut="u" onClick={() => handleContextAction("unread")} />
          <ContextMenuItem icon={<Clock className="h-3.5 w-3.5" />} label="Snooze" shortcut="h" onClick={() => handleContextAction("snooze")} />
          <ContextMenuItem icon={<FolderPlus className="h-3.5 w-3.5" />} label="Add to group" onClick={() => handleContextAction("add_to_group")} />
          <div className="h-px bg-white/5 my-1" />
          <ContextMenuItem icon={<AlertTriangle className="h-3.5 w-3.5" />} label="Report spam" onClick={() => handleContextAction("spam")} destructive />
          <ContextMenuItem icon={<Ban className="h-3.5 w-3.5" />} label="Block sender" onClick={() => handleContextAction("block")} destructive />
        </div>
      )}
    </div>
  );
}

function ThreadRow({
  thread,
  isSelected,
  isChecked,
  showCheckbox,
  onClick,
  onContextMenu,
  onToggleSelect,
  onMouseEnter,
  onSwipeLeft,
  onSwipeRight,
}: {
  thread: ThreadListItem;
  isSelected: boolean;
  isChecked: boolean;
  showCheckbox: boolean;
  onClick: (e: React.MouseEvent) => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onToggleSelect?: () => void;
  onMouseEnter?: () => void;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
}) {
  const senderName = thread.from[0]?.name || thread.from[0]?.email || "Unknown";
  const shortSender = senderName.split(" ")[0] || senderName.split("@")[0];

  // Touch swipe tracking
  const touchStartRef = React.useRef({ x: 0, y: 0 });
  const [swipeOffset, setSwipeOffset] = React.useState(0);
  const trackingRef = React.useRef(false);

  function handleTouchStart(e: React.TouchEvent) {
    touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    trackingRef.current = false;
  }

  function handleTouchMove(e: React.TouchEvent) {
    const dx = e.touches[0].clientX - touchStartRef.current.x;
    const dy = e.touches[0].clientY - touchStartRef.current.y;
    if (!trackingRef.current) {
      if (Math.abs(dy) > Math.abs(dx)) return;
      if (Math.abs(dx) > 10) trackingRef.current = true;
      else return;
    }
    setSwipeOffset(Math.max(-120, Math.min(120, dx)));
  }

  function handleTouchEnd() {
    if (Math.abs(swipeOffset) > 80) {
      if (swipeOffset < 0) onSwipeLeft?.();
      else onSwipeRight?.();
    }
    setSwipeOffset(0);
    trackingRef.current = false;
  }

  return (
    <div className="relative overflow-hidden">
      {/* Swipe backgrounds */}
      {swipeOffset > 0 && (
        <div className="absolute inset-y-0 left-0 w-full bg-amber-500/20 flex items-center pl-4">
          <span className="text-xs text-amber-400 font-medium">Snooze</span>
        </div>
      )}
      {swipeOffset < 0 && (
        <div className="absolute inset-y-0 right-0 w-full bg-green-500/20 flex items-center justify-end pr-4">
          <span className="text-xs text-green-400 font-medium">Archive</span>
        </div>
      )}
    <button
      draggable
      onDragStart={(e) => {
        const dragData: DragThreadData = {
          threadId: thread.id,
          subject: thread.subject || "",
          snippet: thread.snippet || "",
          fromEmail: thread.from[0]?.email || "",
          fromName: thread.from[0]?.name || "",
          lastMessageAt: thread.lastMessageAt || new Date().toISOString(),
          primaryContacts: thread.from.map((f) => ({ email: f.email, name: f.name })),
        };
        e.dataTransfer.setData(EMAIL_THREAD_DRAG_TYPE, JSON.stringify(dragData));
        e.dataTransfer.effectAllowed = "move";
      }}
      onClick={onClick}
      onContextMenu={onContextMenu}
      onMouseEnter={onMouseEnter}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={{ transform: swipeOffset ? `translateX(${swipeOffset}px)` : undefined, transition: swipeOffset ? "none" : "transform 200ms ease-out" }}
      className={cn(
        "group/threadrow w-full text-left px-3 py-2.5 border-b border-white/5 transition-colors flex gap-3 relative",
        isSelected ? "bg-white/[0.08]" : "hover:bg-white/[0.03]",
        isChecked && "bg-primary/[0.08]",
        thread.isUnread && !isChecked && "bg-white/[0.02]"
      )}
    >
      {/* Selection checkbox */}
      {(showCheckbox || isChecked) && (
        <div
          className="pt-1 shrink-0 flex items-start"
          onClick={(e) => { e.stopPropagation(); onToggleSelect?.(); }}
        >
          <div className={cn(
            "h-4 w-4 rounded border transition-colors flex items-center justify-center cursor-pointer",
            isChecked ? "bg-primary border-primary" : "border-white/20 hover:border-white/40"
          )}>
            {isChecked && (
              <svg className="h-3 w-3 text-primary-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
          </div>
        </div>
      )}

      {/* Drag grip handle */}
      <div className="pt-1.5 shrink-0 opacity-0 group-hover/threadrow:opacity-40 transition-opacity cursor-grab">
        <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
      </div>

      {/* Contact avatar */}
      <div className="pt-0.5 shrink-0 relative">
        <ContactAvatar
          email={thread.from[0]?.email ?? ""}
          name={thread.from[0]?.name}
          size={28}
        />
        {thread.isStarred && (
          <Star className="h-2.5 w-2.5 text-yellow-400 fill-yellow-400 absolute -bottom-0.5 -right-0.5" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        {/* Sender + time */}
        <div className="flex items-center justify-between gap-2">
          <span
            className={cn(
              "text-sm truncate",
              thread.isUnread ? "font-semibold text-foreground" : "text-foreground/80"
            )}
          >
            {shortSender}
            {thread.messageCount > 1 && (
              <span className="text-muted-foreground font-normal ml-1 text-xs">
                ({thread.messageCount})
              </span>
            )}
          </span>
          <span className="text-[10px] text-muted-foreground shrink-0">
            {timeAgo(thread.lastMessageAt)}
          </span>
        </div>

        {/* Subject */}
        <p
          className={cn(
            "text-xs truncate mt-0.5",
            thread.isUnread ? "text-foreground/90" : "text-muted-foreground"
          )}
        >
          {thread.subject}
        </p>

        {/* Snippet */}
        <p className="text-[11px] text-muted-foreground/60 truncate mt-0.5">
          {thread.snippet}
        </p>
      </div>

      {/* Unread dot */}
      {thread.isUnread && (
        <div className="pt-1.5 shrink-0">
          <div className="h-2 w-2 rounded-full bg-primary" />
        </div>
      )}
    </button>
    </div>
  );
}

// ── Context menu item ──────────────────────────────────────

function ContextMenuItem({
  icon,
  label,
  shortcut,
  onClick,
  destructive,
}: {
  icon: React.ReactNode;
  label: string;
  shortcut?: string;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-2.5 px-3 py-1.5 text-xs transition-colors",
        destructive
          ? "text-red-400 hover:bg-red-500/10"
          : "text-foreground/90 hover:bg-white/5"
      )}
    >
      <span className="h-3.5 w-3.5 shrink-0 opacity-70">{icon}</span>
      <span className="flex-1 text-left">{label}</span>
      {shortcut && (
        <kbd className="text-[9px] text-muted-foreground/50 ml-2">{shortcut}</kbd>
      )}
    </button>
  );
}
