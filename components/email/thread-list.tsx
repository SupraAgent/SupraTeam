"use client";

import * as React from "react";
import { cn, timeAgo } from "@/lib/utils";
import type { ThreadListItem } from "@/lib/email/types";
import { ContactAvatar } from "./contact-avatar";
import { QuickReply } from "./quick-reply";
import Link from "next/link";
import { Mail, Building2, Phone } from "lucide-react";

export type ContextMenuAction = "archive" | "trash" | "star" | "read" | "unread" | "snooze" | "spam" | "block" | "quickReply";

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
  onDragStart?: (threadIds: string[]) => void;
  onDragEnd?: () => void;
  onQuickReplySent?: () => void;
  onRefresh?: () => void;
  connectionId?: string;
};

export function ThreadList({ threads, selectedId, selectedIds, onSelect, onToggleSelect, onRangeSelect, loading, onLoadMore, hasMore, onPrefetch, onSwipeArchive, onSwipeSnooze, onContextAction, onDragStart, onDragEnd, onQuickReplySent, onRefresh, connectionId }: ThreadListProps) {
  const listRef = React.useRef<HTMLDivElement>(null);
  const lastClickedIndexRef = React.useRef<number>(-1);
  const [contextMenu, setContextMenu] = React.useState<ContextMenuState | null>(null);
  const [quickReplyId, setQuickReplyId] = React.useState<string | null>(null);

  // Pull-to-refresh state
  const [pullDistance, setPullDistance] = React.useState(0);
  const [refreshing, setRefreshing] = React.useState(false);
  const pullStartY = React.useRef(0);
  const pullTracking = React.useRef(false);

  function handlePullTouchStart(e: React.TouchEvent) {
    if (listRef.current && listRef.current.scrollTop <= 0) {
      pullStartY.current = e.touches[0].clientY;
      pullTracking.current = true;
    }
  }

  function handlePullTouchMove(e: React.TouchEvent) {
    if (!pullTracking.current || refreshing) return;
    const dy = e.touches[0].clientY - pullStartY.current;
    if (dy > 0 && listRef.current && listRef.current.scrollTop <= 0) {
      setPullDistance(Math.min(120, dy * 0.4));
    }
  }

  function handlePullTouchEnd() {
    pullTracking.current = false;
    if (pullDistance > 60 && onRefresh) {
      setRefreshing(true);
      onRefresh();
      setTimeout(() => { setRefreshing(false); setPullDistance(0); }, 1000);
    } else {
      setPullDistance(0);
    }
  }

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
    if (action === "quickReply" && contextMenu?.threadIds.length === 1) {
      setQuickReplyId(contextMenu.threadIds[0]);
      setContextMenu(null);
      return;
    }
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
        <InboxIcon className="h-8 w-8 opacity-40" />
        <p className="text-sm">No emails</p>
      </div>
    );
  }

  const isMultiContext = contextMenu && contextMenu.threadIds.length > 1;

  // Clamp context menu to viewport
  const menuStyle = contextMenu ? {
    left: Math.min(contextMenu.x, (typeof window !== "undefined" ? window.innerWidth : 400) - 200),
    top: Math.min(contextMenu.y, (typeof window !== "undefined" ? window.innerHeight : 800) - 320),
  } : {};

  return (
    <div
      ref={listRef}
      className="flex-1 overflow-y-auto thin-scroll relative"
      onTouchStart={handlePullTouchStart}
      onTouchMove={handlePullTouchMove}
      onTouchEnd={handlePullTouchEnd}
    >
      {/* Pull-to-refresh indicator */}
      {(pullDistance > 0 || refreshing) && (
        <div
          className="flex items-center justify-center transition-all overflow-hidden"
          style={{ height: refreshing ? 40 : pullDistance }}
        >
          <div className={cn(
            "h-5 w-5 rounded-full border-2 border-primary border-t-transparent",
            (refreshing || pullDistance > 60) && "animate-spin"
          )} />
        </div>
      )}
      {threads.map((thread, index) => (
        <React.Fragment key={thread.id}>
          <ThreadRow
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
            onDragStart={(e) => {
              const ids = selectedIds && selectedIds.size > 0 && selectedIds.has(thread.id)
                ? Array.from(selectedIds)
                : [thread.id];
              e.dataTransfer.setData("application/x-thread-ids", JSON.stringify(ids));
              e.dataTransfer.effectAllowed = "move";
              onDragStart?.(ids);
            }}
            onDragEnd={() => onDragEnd?.()}
          />
          {quickReplyId === thread.id && (
            <QuickReply
              threadId={thread.id}
              connectionId={connectionId}
              onSent={onQuickReplySent}
              onClose={() => setQuickReplyId(null)}
            />
          )}
        </React.Fragment>
      ))}
      {hasMore && (
        <button
          onClick={onLoadMore}
          className="w-full py-3 text-xs text-primary hover:text-primary/80 transition"
        >
          Load more
        </button>
      )}

      {/* Right-click context menu — clamped to viewport */}
      {contextMenu && (
        <div
          className="fixed z-[100] min-w-[180px] rounded-lg border border-white/10 shadow-2xl py-1 overflow-hidden"
          style={{
            ...menuStyle,
            backgroundColor: "hsl(var(--surface-3))",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {isMultiContext && (
            <div className="px-3 py-1.5 text-[10px] text-muted-foreground border-b border-white/5">
              {contextMenu.threadIds.length} threads selected
            </div>
          )}
          {!isMultiContext && (
            <ContextMenuItem icon={<ReplyIcon />} label="Quick reply" onClick={() => handleContextAction("quickReply")} />
          )}
          <ContextMenuItem icon={<ArchiveIcon />} label="Archive" shortcut="e" onClick={() => handleContextAction("archive")} />
          <ContextMenuItem icon={<TrashIcon />} label="Delete" shortcut="#" onClick={() => handleContextAction("trash")} />
          <ContextMenuItem icon={<StarOutlineIcon />} label="Star" shortcut="s" onClick={() => handleContextAction("star")} />
          <div className="h-px bg-white/5 my-1" />
          <ContextMenuItem icon={<MailReadIcon />} label="Mark as read" onClick={() => handleContextAction("read")} />
          <ContextMenuItem icon={<MailUnreadIcon />} label="Mark as unread" shortcut="u" onClick={() => handleContextAction("unread")} />
          <ContextMenuItem icon={<ClockIcon />} label="Snooze" shortcut="h" onClick={() => handleContextAction("snooze")} />
          <div className="h-px bg-white/5 my-1" />
          <ContextMenuItem icon={<SpamIcon />} label="Report spam" onClick={() => handleContextAction("spam")} destructive />
          <ContextMenuItem icon={<BlockIcon />} label="Block sender" onClick={() => handleContextAction("block")} destructive />
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
  onDragStart,
  onDragEnd,
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
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: () => void;
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
      onClick={onClick}
      onContextMenu={onContextMenu}
      onMouseEnter={onMouseEnter}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={{ transform: swipeOffset ? `translateX(${swipeOffset}px)` : undefined, transition: swipeOffset ? "none" : "transform 200ms ease-out" }}
      className={cn(
        "w-full text-left px-3 py-2.5 border-b border-white/5 transition-colors flex gap-3 relative",
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

      {/* Contact avatar with popover */}
      <AvatarWithPopover
        email={thread.from[0]?.email ?? ""}
        name={thread.from[0]?.name}
        isStarred={thread.isStarred}
      />

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

// ── Avatar with contact popover ───────────────────────────

interface ContactPopoverData {
  contact: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    company: string | null;
    title: string | null;
    telegram_username: string | null;
  } | null;
}

function AvatarWithPopover({ email, name, isStarred }: { email: string; name?: string; isStarred?: boolean }) {
  const [open, setOpen] = React.useState(false);
  const [data, setData] = React.useState<ContactPopoverData | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [fetchError, setFetchError] = React.useState(false);
  const popoverRef = React.useRef<HTMLDivElement>(null);
  const avatarRef = React.useRef<HTMLDivElement>(null);

  // Fetch contact data on open
  React.useEffect(() => {
    if (!open || !email) return;
    const controller = new AbortController();
    setLoading(true);
    setFetchError(false);
    fetch(`/api/plugins/contact-card?email=${encodeURIComponent(email)}`, { signal: controller.signal })
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((json) => setData({ contact: json.data?.contact ?? null }))
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setFetchError(true);
        setData(null);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [open, email]);

  // Close on click outside
  React.useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node) &&
          avatarRef.current && !avatarRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleEsc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("mousedown", handleClick);
    window.addEventListener("keydown", handleEsc);
    return () => {
      window.removeEventListener("mousedown", handleClick);
      window.removeEventListener("keydown", handleEsc);
    };
  }, [open]);

  return (
    <div className="pt-0.5 shrink-0 relative">
      <div
        ref={avatarRef}
        className="cursor-pointer rounded-full hover:ring-2 hover:ring-primary/40 transition-shadow"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => {
            if (!v) { setData(null); setFetchError(false); }
            return !v;
          });
        }}
      >
        <ContactAvatar email={email} name={name} size={28} />
      </div>
      {isStarred && (
        <StarFilledIcon className="h-2.5 w-2.5 text-yellow-400 absolute -bottom-0.5 -right-0.5 pointer-events-none" />
      )}

      {open && (
        <div
          ref={popoverRef}
          className="absolute left-0 top-full mt-1 z-[80] min-w-[220px] rounded-lg border border-white/10 shadow-2xl p-3 space-y-2"
          style={{ backgroundColor: "hsl(var(--surface-3))" }}
          onClick={(e) => e.stopPropagation()}
        >
          {loading && (
            <div className="space-y-1.5">
              <div className="h-4 w-28 rounded bg-white/5 animate-pulse" />
              <div className="h-3 w-36 rounded bg-white/5 animate-pulse" />
            </div>
          )}
          {!loading && fetchError && (
            <div className="text-xs text-muted-foreground">
              <p>Could not load contact info</p>
              <button
                onClick={() => { setFetchError(false); setData(null); }}
                className="text-primary hover:text-primary/80 text-[10px] mt-1"
              >
                Retry
              </button>
            </div>
          )}
          {!loading && !fetchError && data?.contact && (
            <>
              <div className="flex items-center gap-2">
                <ContactAvatar email={data.contact.email} name={data.contact.name} size={32} />
                <div className="min-w-0">
                  <Link
                    href={`/contacts/${data.contact.id}`}
                    className="text-sm font-medium text-foreground hover:text-primary transition-colors block truncate"
                  >
                    {data.contact.name}
                  </Link>
                  {data.contact.title && (
                    <span className="text-[10px] text-muted-foreground block truncate">{data.contact.title}</span>
                  )}
                </div>
              </div>
              <div className="space-y-1 text-xs text-muted-foreground">
                <div className="flex items-center gap-1.5 truncate">
                  <Mail className="h-3 w-3 shrink-0" />
                  <span className="truncate">{data.contact.email}</span>
                </div>
                {data.contact.company && (
                  <div className="flex items-center gap-1.5 truncate">
                    <Building2 className="h-3 w-3 shrink-0" />
                    <span className="truncate">{data.contact.company}</span>
                  </div>
                )}
                {data.contact.phone && (
                  <div className="flex items-center gap-1.5 truncate">
                    <Phone className="h-3 w-3 shrink-0" />
                    <span className="truncate">{data.contact.phone}</span>
                  </div>
                )}
                {data.contact.telegram_username && (
                  <div className="flex items-center gap-1.5 truncate">
                    <TelegramMiniIcon />
                    <span className="truncate">@{data.contact.telegram_username}</span>
                  </div>
                )}
              </div>
              <Link
                href={`/contacts/${data.contact.id}`}
                className="block text-center text-[10px] text-primary hover:text-primary/80 pt-1 border-t border-white/5 transition-colors"
              >
                View full profile
              </Link>
            </>
          )}
          {!loading && !fetchError && data && !data.contact && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <ContactAvatar email={email} name={name} size={32} />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{name || email}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{email}</p>
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground">Not in CRM</p>
              <Link
                href={`/contacts?action=create&email=${encodeURIComponent(email)}&name=${encodeURIComponent(name || "")}`}
                className="inline-flex items-center gap-1 rounded px-2 py-1 text-[10px] font-medium bg-primary/10 text-primary hover:bg-primary/20 transition"
              >
                + Add to CRM
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TelegramMiniIcon() {
  return <svg className="h-3 w-3 shrink-0" viewBox="0 0 24 24" fill="currentColor"><path d="M11.944 0A12 12 0 000 12a12 12 0 0012 12 12 12 0 0012-12A12 12 0 0012 0h-.056zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 01.171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.479.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" /></svg>;
}

function InboxIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
      <path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z" />
    </svg>
  );
}

function StarFilledIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth={1.5}>
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
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

// ── Context menu icons ─────────────────────────────────────

function ArchiveIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5"><polyline points="21 8 21 21 3 21 3 8" /><rect x="1" y="3" width="22" height="5" /><line x1="10" y1="12" x2="14" y2="12" /></svg>;
}

function TrashIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>;
}

function StarOutlineIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>;
}

function MailReadIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5"><path d="M22 13V6a2 2 0 00-2-2H4a2 2 0 00-2 2v12c0 1.1.9 2 2 2h8" /><polyline points="22 6 12 13 2 6" /></svg>;
}

function MailUnreadIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22 6 12 13 2 6" /><circle cx="19" cy="5" r="3" fill="currentColor" /></svg>;
}

function ClockIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>;
}

function SpamIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>;
}

function BlockIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5"><circle cx="12" cy="12" r="10" /><line x1="4.93" y1="4.93" x2="19.07" y2="19.07" /></svg>;
}

function ReplyIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5"><polyline points="9 17 4 12 9 7" /><path d="M20 18v-2a4 4 0 00-4-4H4" /></svg>;
}
