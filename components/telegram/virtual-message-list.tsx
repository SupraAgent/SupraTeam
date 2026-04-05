"use client";

import * as React from "react";
import { Virtuoso, VirtuosoHandle } from "react-virtuoso";
import type { TgMessage } from "@/lib/client/telegram-service";
import { Loader2, ArrowDown } from "lucide-react";

// ── Constants ─────────────────────────────────────────────────
const INITIAL_INDEX = 100_000; // large offset so prepend never goes negative

interface VirtualMessageListProps {
  messages: TgMessage[];
  hasMore: boolean;
  loading: boolean;
  loadOlder: () => Promise<boolean>;
  /** Render a single message row */
  renderMessage: (msg: TgMessage) => React.ReactNode;
  /** Number of new messages received while scrolled up */
  newMessageCount: number;
  /** Called when user scrolls to bottom (clears new-message badge) */
  onBottomReached: () => void;
  /** Empty state when no messages */
  emptyState?: React.ReactNode;
  /** Whether search is active (disables follow-output) */
  searchActive?: boolean;
  /** Search results to render instead of messages */
  searchResults?: TgMessage[];
}

export function VirtualMessageList({
  messages,
  hasMore,
  loading,
  loadOlder,
  renderMessage,
  newMessageCount,
  onBottomReached,
  emptyState,
  searchActive,
  searchResults,
}: VirtualMessageListProps) {
  const virtuosoRef = React.useRef<VirtuosoHandle>(null);
  const [atBottom, setAtBottom] = React.useState(true);
  const [showJumpButton, setShowJumpButton] = React.useState(false);
  const loadingOlderRef = React.useRef(false);

  // Which messages to display
  const displayMessages = searchActive && searchResults && searchResults.length > 0
    ? searchResults
    : messages;

  // Compute firstItemIndex for stable prepend
  const firstItemIndex = INITIAL_INDEX - displayMessages.length;

  // Show "jump to latest" when not at bottom
  React.useEffect(() => {
    setShowJumpButton(!atBottom);
  }, [atBottom]);

  // Notify parent when we reach bottom
  React.useEffect(() => {
    if (atBottom) {
      onBottomReached();
    }
  }, [atBottom, onBottomReached]);

  const handleStartReached = React.useCallback(async () => {
    if (loadingOlderRef.current || !hasMore || searchActive) return;
    loadingOlderRef.current = true;
    try {
      await loadOlder();
    } finally {
      // Small delay to prevent rapid-fire calls
      setTimeout(() => { loadingOlderRef.current = false; }, 300);
    }
  }, [hasMore, loadOlder, searchActive]);

  const scrollToBottom = React.useCallback(() => {
    virtuosoRef.current?.scrollToIndex({
      index: displayMessages.length - 1,
      behavior: "smooth",
      align: "end",
    });
  }, [displayMessages.length]);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (displayMessages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        {emptyState}
      </div>
    );
  }

  return (
    <div className="relative flex-1 min-h-0">
      <Virtuoso
        ref={virtuosoRef}
        data={displayMessages}
        firstItemIndex={firstItemIndex}
        initialTopMostItemIndex={displayMessages.length - 1}
        followOutput={searchActive ? false : "smooth"}
        alignToBottom
        atBottomStateChange={setAtBottom}
        atBottomThreshold={150}
        startReached={handleStartReached}
        overscan={{ main: 200, reverse: 400 }}
        className="h-full"
        itemContent={(_index, msg) => (
          <div className="px-4 py-1.5" id={`msg-${msg.id}`}>
            {renderMessage(msg)}
          </div>
        )}
        components={{
          Header: () => hasMore && !searchActive ? (
            <div className="flex justify-center py-3">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground/50" />
            </div>
          ) : null,
        }}
      />

      {/* Jump to latest floating button */}
      {showJumpButton && (
        <button
          onClick={scrollToBottom}
          className="absolute bottom-4 right-4 z-20 flex items-center justify-center h-10 w-10 rounded-full bg-primary/20 border border-primary/30 text-primary shadow-lg hover:bg-primary/30 transition-all animate-in fade-in slide-in-from-bottom-2 duration-200"
          title="Jump to latest"
        >
          <ArrowDown className="h-4 w-4" />
          {newMessageCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary text-[10px] font-medium text-primary-foreground px-1">
              {newMessageCount > 99 ? "99+" : newMessageCount}
            </span>
          )}
        </button>
      )}
    </div>
  );
}
