"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { ThreadList } from "@/components/email/thread-list";
import { ThreadView } from "@/components/email/thread-view";
import { ComposeModal } from "@/components/email/compose-modal";
import { LabelSidebar } from "@/components/email/label-sidebar";
import { UndoSendProvider, UndoSendBar } from "@/components/email/undo-send-bar";
import { SnoozePicker } from "@/components/email/snooze-picker";
import { AdvancedSearch } from "@/components/email/advanced-search";
import { KeyboardHelp } from "@/components/email/keyboard-help";
import { useThreads, useThread, useLabels, useEmailActions, useEmailKeyboard, useEmailConnections, useSplitInbox, useAICategories, usePrefetchThread, useBatchPrefetch, useGmailPush } from "@/lib/email/hooks";
import { INBOX_CATEGORIES, type InboxCategory } from "@/lib/email/types";
import { EmailErrorBoundary } from "@/components/email/error-boundary";
import { toast } from "sonner";
import { CommandPalette } from "@/components/email/command-palette";
import { AutoDraftBanner } from "@/components/email/auto-draft";

export default function EmailPage() {
  return (
    <UndoSendProvider>
      <EmailPageInner />
    </UndoSendProvider>
  );
}

function EmailPageInner() {
  const { connections, loading: connectionsLoading } = useEmailConnections();
  const [activeLabel, setActiveLabel] = React.useState("INBOX");
  const [selectedThreadId, setSelectedThreadId] = React.useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = React.useState(0);
  const [searchInput, setSearchInput] = React.useState("");
  const [searchQuery, setSearchQuery] = React.useState("");
  const [showSearch, setShowSearch] = React.useState(false);
  const [advancedSearchOpen, setAdvancedSearchOpen] = React.useState(false);
  const [keyboardHelpOpen, setKeyboardHelpOpen] = React.useState(false);
  const [activeCategory, setActiveCategory] = React.useState<InboxCategory | "all">("all");
  const searchRef = React.useRef<HTMLInputElement>(null);
  const searchTimerRef = React.useRef<ReturnType<typeof setTimeout>>(undefined);

  // Debounce search by 400ms
  const handleSearchChange = React.useCallback((value: string) => {
    setSearchInput(value);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => setSearchQuery(value), 200);
  }, []);

  // Compose modal state
  const [composeOpen, setComposeOpen] = React.useState(false);
  const [composeMode, setComposeMode] = React.useState<"compose" | "reply" | "replyAll" | "forward">("compose");
  const [composeThreadId, setComposeThreadId] = React.useState<string>();
  const [composeMessageId, setComposeMessageId] = React.useState<string>();

  // Multi-select state
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const hasSelection = selectedIds.size > 0;

  // Command palette state
  const [commandPaletteOpen, setCommandPaletteOpen] = React.useState(false);

  // Snooze state
  const [snoozeOpen, setSnoozeOpen] = React.useState(false);
  const [snoozeThreadId, setSnoozeThreadId] = React.useState<string | null>(null);

  // Data hooks
  const { threads, loading, error, nextPageToken, loadMore, refresh, setThreads } = useThreads({
    labelIds: searchQuery ? undefined : [activeLabel],
    query: searchQuery || undefined,
  });
  const { thread: activeThread, loading: threadLoading } = useThread(selectedThreadId);
  const { labels, loading: labelsLoading } = useLabels();
  const { performAction, undoAction } = useEmailActions(setThreads);
  const aiCategories = useAICategories(threads);
  const { split, counts } = useSplitInbox(threads, aiCategories);
  const prefetchThread = usePrefetchThread();

  // Batch-prefetch first 3 threads for instant navigation
  useBatchPrefetch(threads);

  // Gmail Pub/Sub push — refresh on new mail
  useGmailPush(refresh);

  // Visible threads based on active category
  const visibleThreads = activeCategory === "all" ? threads : split[activeCategory];

  // Unread counts from labels
  const unreadCounts: Record<string, number> = {};
  for (const l of labels) {
    if (l.unreadCount) unreadCounts[l.id] = l.unreadCount;
  }

  // No connection state
  if (!connectionsLoading && connections.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-4">
        <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center">
          <MailPlusIcon className="h-8 w-8 text-primary" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-foreground">Connect your email</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Connect your Gmail account to read, send, and manage email alongside your CRM deals.
          </p>
        </div>
        <a
          href="/settings/email"
          className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition"
        >
          Connect Gmail
        </a>
      </div>
    );
  }

  // ── Action handlers ──────────────────────────────────────

  function handleArchive() {
    const id = selectedThreadId ?? visibleThreads[selectedIndex]?.id;
    if (!id) return;
    performAction(id, "archive");
    toast("Archived", {
      action: undoAction
        ? { label: "Undo", onClick: () => undoAction.undo() }
        : undefined,
    });
    if (selectedThreadId) {
      const idx = visibleThreads.findIndex((t) => t.id === selectedThreadId);
      const next = visibleThreads[idx + 1] ?? visibleThreads[idx - 1];
      setSelectedThreadId(next?.id ?? null);
    }
  }

  function handleTrash() {
    const id = selectedThreadId ?? visibleThreads[selectedIndex]?.id;
    if (!id) return;
    performAction(id, "trash");
    toast("Moved to trash");
    if (selectedThreadId) {
      const idx = visibleThreads.findIndex((t) => t.id === selectedThreadId);
      const next = visibleThreads[idx + 1] ?? visibleThreads[idx - 1];
      setSelectedThreadId(next?.id ?? null);
    }
  }

  function handleStar() {
    const id = selectedThreadId ?? visibleThreads[selectedIndex]?.id;
    if (id) performAction(id, "star");
  }

  function handleMarkUnread() {
    const id = selectedThreadId ?? visibleThreads[selectedIndex]?.id;
    if (id) {
      performAction(id, "unread");
      setSelectedThreadId(null);
    }
  }

  function handleSnooze() {
    const id = selectedThreadId ?? visibleThreads[selectedIndex]?.id;
    if (id) {
      setSnoozeThreadId(id);
      setSnoozeOpen(true);
    }
  }

  // Bulk actions on multi-selected threads
  function handleBulkArchive() {
    for (const id of selectedIds) performAction(id, "archive");
    toast(`Archived ${selectedIds.size} threads`);
    setSelectedIds(new Set());
    setSelectedThreadId(null);
  }

  function handleBulkTrash() {
    for (const id of selectedIds) performAction(id, "trash");
    toast(`Trashed ${selectedIds.size} threads`);
    setSelectedIds(new Set());
    setSelectedThreadId(null);
  }

  function handleBulkStar() {
    for (const id of selectedIds) performAction(id, "star");
    setSelectedIds(new Set());
  }

  function handleBulkRead() {
    for (const id of selectedIds) performAction(id, "read");
    setSelectedIds(new Set());
  }

  function handleCommandAction(action: string) {
    switch (action) {
      case "archive": handleArchive(); break;
      case "trash": handleTrash(); break;
      case "star": handleStar(); break;
      case "unread": handleMarkUnread(); break;
      case "snooze": handleSnooze(); break;
      case "reply": openCompose("reply", selectedThreadId ?? undefined); break;
      case "replyAll": openCompose("replyAll", selectedThreadId ?? undefined); break;
      case "forward": openCompose("forward", selectedThreadId ?? undefined); break;
      case "compose": openCompose("compose"); break;
      case "goInbox": setActiveLabel("INBOX"); setSelectedThreadId(null); setSearchQuery(""); break;
      case "goStarred": setActiveLabel("STARRED"); setSelectedThreadId(null); setSearchQuery(""); break;
      case "goSent": setActiveLabel("SENT"); setSelectedThreadId(null); setSearchQuery(""); break;
      case "goDrafts": setActiveLabel("DRAFT"); setSelectedThreadId(null); setSearchQuery(""); break;
      case "search": setAdvancedSearchOpen(true); break;
      case "help": setKeyboardHelpOpen((v) => !v); break;
      case "refresh": refresh(); break;
    }
  }

  function openCompose(mode: "compose" | "reply" | "replyAll" | "forward", threadId?: string, messageId?: string) {
    setComposeMode(mode);
    setComposeThreadId(threadId);
    setComposeMessageId(messageId);
    setComposeOpen(true);
  }

  // ── Keyboard shortcuts ───────────────────────────────────

  useEmailKeyboard({
    onNext: () => {
      if (!selectedThreadId) {
        setSelectedIndex((i) => Math.min(i + 1, visibleThreads.length - 1));
      }
    },
    onPrev: () => {
      if (!selectedThreadId) {
        setSelectedIndex((i) => Math.max(i - 1, 0));
      }
    },
    onOpen: () => {
      if (!selectedThreadId && visibleThreads[selectedIndex]) {
        const thread = visibleThreads[selectedIndex];
        setSelectedThreadId(thread.id);
        // Optimistic mark-as-read on keyboard open
        if (thread.isUnread) {
          setThreads((prev) =>
            prev.map((t) => (t.id === thread.id ? { ...t, isUnread: false } : t))
          );
        }
      }
    },
    onBack: () => setSelectedThreadId(null),
    onArchive: handleArchive,
    onTrash: handleTrash,
    onReply: () => openCompose("reply", selectedThreadId ?? undefined),
    onReplyAll: () => openCompose("replyAll", selectedThreadId ?? undefined),
    onForward: () => openCompose("forward", selectedThreadId ?? undefined),
    onStar: handleStar,
    onMarkUnread: handleMarkUnread,
    onCompose: () => openCompose("compose"),
    onSearch: () => {
      setAdvancedSearchOpen(true);
    },
    onArchiveNext: handleArchive,
    onArchivePrev: handleArchive,
    onSnooze: handleSnooze,
    onSendAndArchive: () => {
      // Send + Archive: archive current thread after compose closes
      if (selectedThreadId) {
        performAction(selectedThreadId, "archive");
        toast("Archived");
        setSelectedThreadId(null);
      }
    },
    onGoInbox: () => { setActiveLabel("INBOX"); setSelectedThreadId(null); setSearchQuery(""); },
    onGoStarred: () => { setActiveLabel("STARRED"); setSelectedThreadId(null); setSearchQuery(""); },
    onGoSent: () => { setActiveLabel("SENT"); setSelectedThreadId(null); setSearchQuery(""); },
    onGoDrafts: () => { setActiveLabel("DRAFT"); setSelectedThreadId(null); setSearchQuery(""); },
    onGoAll: () => { setSearchQuery("in:anywhere"); setSelectedThreadId(null); },
    onToggleSelect: () => {
      const id = selectedThreadId ?? visibleThreads[selectedIndex]?.id;
      if (id) {
        setSelectedIds((prev) => {
          const next = new Set(prev);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        });
      }
    },
    onSelectAll: () => {
      setSelectedIds(new Set(visibleThreads.map((t) => t.id)));
    },
    onDeselectAll: () => setSelectedIds(new Set()),
    onShowHelp: () => setKeyboardHelpOpen((v) => !v),
    onCommandPalette: () => setCommandPaletteOpen(true),
  }, !composeOpen && !snoozeOpen && !advancedSearchOpen && !keyboardHelpOpen && !commandPaletteOpen);

  // ── Render ───────────────────────────────────────────────

  return (
    <EmailErrorBoundary>
    <div className="flex h-[calc(100vh-3.5rem)] md:h-screen">
      {/* Label sidebar */}
      <div className={cn(
        "w-44 border-r border-white/10 py-3 px-2 shrink-0 overflow-y-auto thin-scroll hidden lg:block"
      )} style={{ backgroundColor: "hsl(var(--surface-1))" }}>
        <LabelSidebar
          labels={labels}
          activeLabel={activeLabel}
          onSelectLabel={(id) => {
            setActiveLabel(id);
            setSelectedThreadId(null);
            setSearchInput("");
            setSearchQuery("");
            setActiveCategory("all");
          }}
          unreadCounts={unreadCounts}
        />
      </div>

      {/* Thread list */}
      <div className={cn(
        "w-80 border-r border-white/10 flex flex-col shrink-0",
        selectedThreadId ? "hidden md:flex" : "flex",
        "min-w-0"
      )}>
        {/* Header */}
        <div className="px-3 py-2.5 border-b border-white/10 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-semibold text-foreground">
              {searchQuery ? `Search: ${searchQuery}` : activeLabel === "INBOX" ? "Inbox" : labels.find((l) => l.id === activeLabel)?.name ?? activeLabel}
            </h1>
            {(unreadCounts[activeLabel] ?? 0) > 0 && (
              <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                {unreadCounts[activeLabel]}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setAdvancedSearchOpen(true)}
              className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-white/5 transition"
              title="Search (/)"
            >
              <SearchIcon className="h-4 w-4" />
            </button>
            <button
              onClick={() => openCompose("compose")}
              className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-white/5 transition"
              title="Compose (c)"
            >
              <ComposeIcon className="h-4 w-4" />
            </button>
            <button
              onClick={refresh}
              className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-white/5 transition"
              title="Refresh"
            >
              <RefreshIcon className={cn("h-4 w-4", loading && "animate-spin")} />
            </button>
          </div>
        </div>

        {/* Split inbox tabs */}
        {activeLabel === "INBOX" && !searchQuery && (
          <div className="flex border-b border-white/10 shrink-0">
            <SplitTab
              label="All"
              active={activeCategory === "all"}
              count={threads.filter((t) => t.isUnread).length}
              onClick={() => { setActiveCategory("all"); setSelectedIndex(0); }}
            />
            {INBOX_CATEGORIES.map((cat) => (
              <SplitTab
                key={cat.id}
                label={cat.label}
                active={activeCategory === cat.id}
                count={counts[cat.id]}
                onClick={() => { setActiveCategory(cat.id); setSelectedIndex(0); }}
              />
            ))}
          </div>
        )}

        {/* Active search indicator */}
        {searchQuery && (
          <div className="px-3 py-2 border-b border-white/10 flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <SearchIcon className="h-3.5 w-3.5 text-primary shrink-0" />
              <span className="text-xs text-foreground truncate">{searchQuery}</span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={() => setAdvancedSearchOpen(true)}
                className="text-[10px] text-primary hover:underline"
              >
                Edit
              </button>
              <button
                onClick={() => { setSearchQuery(""); setShowSearch(false); }}
                className="text-[10px] text-muted-foreground hover:text-foreground transition"
              >
                Clear
              </button>
            </div>
          </div>
        )}

        {error && (
          <div className="px-3 py-2 text-xs text-red-400 border-b border-white/10">
            {error}
          </div>
        )}

        {/* Bulk action bar */}
        {hasSelection && (
          <div className="px-3 py-2 border-b border-white/10 flex items-center gap-2 shrink-0" style={{ backgroundColor: "hsl(var(--surface-2))" }}>
            <span className="text-xs text-foreground font-medium">{selectedIds.size} selected</span>
            <div className="flex items-center gap-1 ml-auto">
              <BulkButton label="Archive" onClick={handleBulkArchive} />
              <BulkButton label="Trash" onClick={handleBulkTrash} />
              <BulkButton label="Star" onClick={handleBulkStar} />
              <BulkButton label="Read" onClick={handleBulkRead} />
              <button onClick={() => setSelectedIds(new Set())} className="text-[10px] text-muted-foreground hover:text-foreground ml-1">
                Clear
              </button>
            </div>
          </div>
        )}

        <ThreadList
          threads={visibleThreads}
          selectedId={selectedThreadId}
          selectedIds={selectedIds}
          onSelect={(id) => {
            setSelectedThreadId(id);
            setSelectedIndex(visibleThreads.findIndex((t) => t.id === id));
            // Optimistic mark-as-read — update list instantly
            setThreads((prev) =>
              prev.map((t) => (t.id === id && t.isUnread ? { ...t, isUnread: false } : t))
            );
          }}
          onToggleSelect={(id) => {
            setSelectedIds((prev) => {
              const next = new Set(prev);
              if (next.has(id)) next.delete(id);
              else next.add(id);
              return next;
            });
          }}
          loading={loading}
          onLoadMore={activeCategory === "all" ? loadMore : undefined}
          hasMore={activeCategory === "all" && !!nextPageToken}
          onPrefetch={prefetchThread}
          onSwipeArchive={(id) => {
            performAction(id, "archive");
            toast("Archived");
          }}
          onSwipeSnooze={(id) => {
            setSnoozeThreadId(id);
            setSnoozeOpen(true);
          }}
        />
      </div>

      {/* Thread view */}
      <div className={cn(
        "flex-1 flex flex-col",
        !selectedThreadId && "hidden md:flex"
      )}>
        {activeThread ? (
          <>
            <ThreadView
              thread={activeThread}
              loading={threadLoading}
              onReply={() => openCompose("reply", selectedThreadId ?? undefined)}
              onReplyAll={() => openCompose("replyAll", selectedThreadId ?? undefined)}
              onForward={(msgId) => openCompose("forward", selectedThreadId ?? undefined, msgId)}
              onArchive={handleArchive}
              onTrash={handleTrash}
              onStar={handleStar}
              onMarkUnread={handleMarkUnread}
              onBack={() => setSelectedThreadId(null)}
            />
            <AutoDraftBanner
              threadId={selectedThreadId}
              onUseDraft={(text) => {
                openCompose("reply", selectedThreadId ?? undefined);
                // Small delay to let compose modal mount, then we'd need to prefill
                // For now, copy to clipboard as fallback
                navigator.clipboard?.writeText(text).catch(() => {});
                toast("Draft copied — paste into reply");
              }}
            />
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-2">
            <MailOpenIcon className="h-10 w-10 opacity-30" />
            <p className="text-sm">Select a thread to read</p>
            <div className="flex flex-wrap items-center gap-2 mt-2 text-[10px]">
              <kbd className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5">j/k</kbd>
              <span>navigate</span>
              <kbd className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5">Enter</kbd>
              <span>open</span>
              <kbd className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5">e</kbd>
              <span>archive</span>
              <kbd className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5">c</kbd>
              <span>compose</span>
              <kbd className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5">/</kbd>
              <span>search</span>
              <kbd className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5">h</kbd>
              <span>snooze</span>
            </div>
          </div>
        )}
      </div>

      {/* Undo archive/trash toast */}
      {undoAction && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-xl border border-white/10 backdrop-blur-sm px-4 py-2.5 shadow-2xl"
          style={{ backgroundColor: "hsl(var(--surface-5))" }}
        >
          <span className="text-xs text-foreground">
            Thread {undoAction.action === "archive" ? "archived" : "trashed"}
          </span>
          <button
            onClick={undoAction.undo}
            className="text-xs font-semibold text-primary hover:text-primary/80 transition"
          >
            Undo
          </button>
        </div>
      )}

      {/* Undo send bar (60s countdown) */}
      <UndoSendBar />

      {/* Snooze picker */}
      <SnoozePicker
        open={snoozeOpen}
        onClose={() => setSnoozeOpen(false)}
        threadId={snoozeThreadId}
        onSnoozed={() => {
          // Remove snoozed thread from list
          if (snoozeThreadId) {
            setThreads((prev) => prev.filter((t) => t.id !== snoozeThreadId));
            if (selectedThreadId === snoozeThreadId) {
              setSelectedThreadId(null);
            }
          }
        }}
      />

      {/* Keyboard help overlay */}
      <KeyboardHelp
        open={keyboardHelpOpen}
        onClose={() => setKeyboardHelpOpen(false)}
      />

      {/* Advanced search */}
      <AdvancedSearch
        open={advancedSearchOpen}
        onClose={() => setAdvancedSearchOpen(false)}
        onSearch={(q) => {
          setSearchQuery(q);
          setShowSearch(true);
          setSelectedThreadId(null);
          setSelectedIndex(0);
        }}
        initialQuery={searchQuery}
      />

      {/* Command palette */}
      <CommandPalette
        open={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        onAction={handleCommandAction}
      />

      {/* Compose modal */}
      <ComposeModal
        open={composeOpen}
        onClose={() => setComposeOpen(false)}
        mode={composeMode}
        threadId={composeThreadId}
        messageId={composeMessageId}
        onSent={() => {
          refresh();
        }}
        onSentAndArchive={() => {
          if (composeThreadId) {
            performAction(composeThreadId, "archive");
            toast("Sent & Archived");
            setSelectedThreadId(null);
          }
          refresh();
        }}
      />
    </div>
    </EmailErrorBoundary>
  );
}

// ── Bulk action button ────────────────────────────────────

function BulkButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="rounded-md px-2 py-1 text-[10px] font-medium text-foreground bg-white/5 hover:bg-white/10 border border-white/10 transition"
    >
      {label}
    </button>
  );
}

// ── Split inbox tab component ─────────────────────────────

function SplitTab({
  label,
  active,
  count,
  onClick,
}: {
  label: string;
  active: boolean;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex-1 flex items-center justify-center gap-1.5 px-2 py-2 text-xs font-medium transition-colors border-b-2",
        active
          ? "border-primary text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground hover:bg-white/[0.02]"
      )}
    >
      {label}
      {count > 0 && (
        <span className={cn(
          "rounded-full px-1.5 py-0.5 text-[9px] font-semibold",
          active ? "bg-primary/15 text-primary" : "bg-white/5 text-muted-foreground"
        )}>
          {count}
        </span>
      )}
    </button>
  );
}

// ── Inline SVGs ─────────────────────────────────────────────

function SearchIcon({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>;
}

function MailPlusIcon({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22 6 12 13 2 6" /><line x1="12" y1="17" x2="12" y2="23" /><line x1="9" y1="20" x2="15" y2="20" /></svg>;
}

function MailOpenIcon({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><path d="M21.2 8.4c.5.38.8.97.8 1.6v10a2 2 0 01-2 2H4a2 2 0 01-2-2V10a2 2 0 01.8-1.6l8-6a2 2 0 012.4 0l8 6z" /><path d="M22 10l-8.97 5.7a1.94 1.94 0 01-2.06 0L2 10" /></svg>;
}

function ComposeIcon({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>;
}

function RefreshIcon({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" /><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" /></svg>;
}
