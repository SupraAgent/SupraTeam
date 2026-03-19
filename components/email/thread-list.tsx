"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { timeAgo } from "@/lib/utils";
import type { ThreadListItem } from "@/lib/email/types";
import { ContactAvatar } from "./contact-avatar";

type ThreadListProps = {
  threads: ThreadListItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  loading: boolean;
  onLoadMore?: () => void;
  hasMore?: boolean;
  onPrefetch?: (id: string) => void;
  onSwipeArchive?: (id: string) => void;
  onSwipeSnooze?: (id: string) => void;
};

export function ThreadList({ threads, selectedId, onSelect, loading, onLoadMore, hasMore, onPrefetch, onSwipeArchive, onSwipeSnooze }: ThreadListProps) {
  const listRef = React.useRef<HTMLDivElement>(null);

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

  return (
    <div ref={listRef} className="flex-1 overflow-y-auto thin-scroll">
      {threads.map((thread) => (
        <ThreadRow
          key={thread.id}
          thread={thread}
          isSelected={thread.id === selectedId}
          onClick={() => onSelect(thread.id)}
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
    </div>
  );
}

function ThreadRow({
  thread,
  isSelected,
  onClick,
  onMouseEnter,
  onSwipeLeft,
  onSwipeRight,
}: {
  thread: ThreadListItem;
  isSelected: boolean;
  onClick: () => void;
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
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={{ transform: swipeOffset ? `translateX(${swipeOffset}px)` : undefined, transition: swipeOffset ? "none" : "transform 200ms ease-out" }}
      className={cn(
        "w-full text-left px-3 py-2.5 border-b border-white/5 transition-colors flex gap-3 relative",
        isSelected ? "bg-white/[0.08]" : "hover:bg-white/[0.03]",
        thread.isUnread && "bg-white/[0.02]"
      )}
    >
      {/* Contact avatar */}
      <div className="pt-0.5 shrink-0 relative">
        <ContactAvatar
          email={thread.from[0]?.email ?? ""}
          name={thread.from[0]?.name}
          size={28}
        />
        {thread.isStarred && (
          <StarFilledIcon className="h-2.5 w-2.5 text-yellow-400 absolute -bottom-0.5 -right-0.5" />
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
