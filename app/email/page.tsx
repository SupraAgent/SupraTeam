"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { ThreadList, type ContextMenuAction } from "@/components/email/thread-list";
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
import { GroupsPanel } from "@/components/email/groups-panel";
import { LabelPicker } from "@/components/email/label-picker";
import { DragDropZones } from "@/components/email/drag-drop-zones";
import { LayoutDashboard, PanelRight } from "lucide-react";

export default function EmailPage() {
  return (
    <UndoSendProvider>
      <EmailPageInner />
    </UndoSendProvider>
  );
}

function EmailPageInner() {
  const { connections, loading: connectionsLoading, refresh: refreshConnections } = useEmailConnections();
  const [activeConnectionId, setActiveConnectionId] = React.useState<string | undefined>(undefined);
  const [activeLabel, setActiveLabel] = React.useState("INBOX");
  const [selectedThreadId, setSelectedThreadId] = React.useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = React.useState(0);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [advancedSearchOpen, setAdvancedSearchOpen] = React.useState(false);
  const [keyboardHelpOpen, setKeyboardHelpOpen] = React.useState(false);
  const [activeCategory, setActiveCategory] = React.useState<InboxCategory | "all">("all");
  const searchRef = React.useRef<HTMLInputElement>(null);
  const searchTimerRef = React.useRef<ReturnType<typeof setTimeout>>(undefined);

  // Set default connection as active when connections load
  React.useEffect(() => {
    if (!activeConnectionId && connections.length > 0) {
      const defaultConn = connections.find((c) => c.is_default) ?? connections[0];
      setActiveConnectionId(defaultConn.id);
    }
  }, [connections, activeConnectionId]);

  // Clean up debounce timer on unmount
  React.useEffect(() => {
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, []);

  // Debounce search by 200ms
  const handleSearchChange = React.useCallback((value: string) => {
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

  // Right panel (Groups sidebar) state
  const [rightPanelOpen, setRightPanelOpen] = React.useState(() => {
    if (typeof window === "undefined") return true;
    try { return localStorage.getItem("email-right-panel") !== "false"; } catch { return true; }
  });

  // Drag state for drop zones
  const [isDragging, setIsDragging] = React.useState(false);
  const [draggedThreadIds, setDraggedThreadIds] = React.useState<string[]>([]);

  // Snooze state
  const [snoozeOpen, setSnoozeOpen] = React.useState(false);
  const [snoozeThreadId, setSnoozeThreadId] = React.useState<string | null>(null);

  // Label picker state
  const [labelPickerOpen, setLabelPickerOpen] = React.useState(false);

  // Data hooks
  const { threads, loading, error, reconnect, nextPageToken, loadMore, refresh, setThreads } = useThreads({
    labelIds: searchQuery ? undefined : [activeLabel],
    query: searchQuery || undefined,
    connectionId: activeConnectionId,
  });
  const { thread: activeThread, loading: threadLoading } = useThread(selectedThreadId, activeConnectionId);
  const { labels, loading: labelsLoading, refreshLabels } = useLabels(activeConnectionId);
  const { performAction, performBulkAction, undoAction } = useEmailActions(setThreads, activeConnectionId);
  const undoActionRef = React.useRef(undoAction);
  undoActionRef.current = undoAction;
  const aiCategories = useAICategories(threads);
  const { split, counts } = useSplitInbox(threads, aiCategories);
  const prefetchThread = usePrefetchThread(activeConnectionId);

  // Batch-prefetch first 3 threads for instant navigation
  useBatchPrefetch(threads, activeConnectionId);

  // Gmail Pub/Sub push — refresh on new mail
  useGmailPush(refresh);

  // Bootstrap default groups on first connection load (client-side flag for idempotency)
  React.useEffect(() => {
    if (!activeConnectionId) return;
    const flagKey = `email-groups-bootstrapped:${activeConnectionId}`;
    try {
      if (localStorage.getItem(flagKey)) return;
    } catch { return; }
    fetch(`/api/email/groups/bootstrap?connection_id=${activeConnectionId}`, { method: "POST" })
      .then((r) => r.json())
      .then((json) => {
        // Only set flag after successful response so failed attempts can retry
        try { localStorage.setItem(flagKey, "1"); } catch { /* noop */ }
        if (json.data?.created > 0) {
          refreshLabels();
          toast(`Created ${json.data.created} default groups`);
        }
      })
      .catch(() => {}); // silent — will retry on next page load
  }, [activeConnectionId, refreshLabels]);

  // Visible threads based on active category
  const visibleThreads = activeCategory === "all" ? threads : split[activeCategory];

  // Unread counts from labels
  const unreadCounts: Record<string, number> = {};
  for (const l of labels) {
    if (l.unreadCount) unreadCounts[l.id] = l.unreadCount;
  }

  // No connection flag (render handled after all hooks)
  const router = useRouter();
  const noConnection = !connectionsLoading && connections.length === 0;

  // No longer redirect — show connection banners inline instead

  // ── Action handlers ──────────────────────────────────────

  function handleArchive() {
    const id = selectedThreadId ?? visibleThreads[selectedIndex]?.id;
    if (!id) return;
    performAction(id, "archive");
    // Read undoAction from ref in onClick to get the latest value set by performAction
    toast("Archived", {
      action: { label: "Undo", onClick: () => undoActionRef.current?.undo() },
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
    const ids = Array.from(selectedIds);
    performBulkAction(ids, "archive");
    toast(`Archived ${ids.length} threads`, {
      action: { label: "Undo", onClick: () => undoActionRef.current?.undo() },
    });
    setSelectedIds(new Set());
    setSelectedThreadId(null);
  }

  function handleBulkTrash() {
    const ids = Array.from(selectedIds);
    performBulkAction(ids, "trash");
    toast(`Trashed ${ids.length} threads`, {
      action: { label: "Undo", onClick: () => undoActionRef.current?.undo() },
    });
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

  function handleBulkSpam() {
    const ids = Array.from(selectedIds);
    for (const id of ids) {
      performAction(id, "labels", { labelIds: { add: ["SPAM"], remove: ["INBOX"] } });
    }
    setThreads((prev) => prev.filter((t) => !selectedIds.has(t.id)));
    toast(`Reported ${ids.length} as spam`);
    setSelectedIds(new Set());
    setSelectedThreadId(null);
  }

  // Right-click context menu handler
  function handleContextAction(threadIds: string[], action: ContextMenuAction) {
    const isBulk = threadIds.length > 1;
    switch (action) {
      case "archive":
        if (isBulk) {
          performBulkAction(threadIds, "archive");
          toast(`Archived ${threadIds.length} threads`, {
            action: { label: "Undo", onClick: () => undoActionRef.current?.undo() },
          });
        } else {
          performAction(threadIds[0], "archive");
          toast("Archived", {
            action: { label: "Undo", onClick: () => undoActionRef.current?.undo() },
          });
        }
        break;
      case "trash":
        if (isBulk) {
          performBulkAction(threadIds, "trash");
          toast(`Trashed ${threadIds.length} threads`);
        } else {
          performAction(threadIds[0], "trash");
          toast("Moved to trash");
        }
        break;
      case "star":
        for (const id of threadIds) performAction(id, "star");
        break;
      case "read":
        for (const id of threadIds) performAction(id, "read");
        break;
      case "unread":
        for (const id of threadIds) performAction(id, "unread");
        break;
      case "snooze":
        if (threadIds.length === 1) {
          setSnoozeThreadId(threadIds[0]);
          setSnoozeOpen(true);
        } else {
          toast("Snooze one thread at a time");
        }
        return; // don't clear selection for snooze
      case "spam":
        for (const id of threadIds) {
          performAction(id, "labels", { labelIds: { add: ["SPAM"], remove: ["INBOX"] } });
        }
        setThreads((prev) => prev.filter((t) => !threadIds.includes(t.id)));
        toast(isBulk ? `Reported ${threadIds.length} as spam` : "Reported as spam");
        break;
      case "block":
        // Block = spam + toast (Gmail doesn't have a separate block API, spam is closest)
        for (const id of threadIds) {
          performAction(id, "labels", { labelIds: { add: ["SPAM"], remove: ["INBOX"] } });
        }
        setThreads((prev) => prev.filter((t) => !threadIds.includes(t.id)));
        toast(isBulk ? `Blocked ${threadIds.length} senders` : "Sender blocked");
        break;
    }
    // Clear selection after context action
    setSelectedIds(new Set());
    if (threadIds.includes(selectedThreadId ?? "")) {
      setSelectedThreadId(null);
    }
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
    onLabelPicker: () => {
      if (selectedThreadId || selectedIds.size > 0) {
        setLabelPickerOpen(true);
      } else {
        toast("Select a thread first", { duration: 2000 });
      }
    },
  }, !composeOpen && !snoozeOpen && !advancedSearchOpen && !keyboardHelpOpen && !commandPaletteOpen && !labelPickerOpen);

  // Active connection for display
  const activeConnection = connections.find((c) => c.id === activeConnectionId);

  function switchAccount(connectionId: string) {
    setActiveConnectionId(connectionId);
    setSelectedThreadId(null);
    setSelectedIndex(0);
    setSearchQuery("");
    setActiveCategory("all");
    setActiveLabel("INBOX");
    setSelectedIds(new Set());
    setComposeOpen(false);
  }

  // ── Add threads to a label (drag-to-group) ──────────────
  function handleAddThreadsToLabel(threadIds: string[], labelId: string) {
    const label = labels.find((l) => l.id === labelId);
    const displayName = label
      ? label.name.includes("/") ? label.name.split("/").pop()! : label.name
      : "group";

    // Use batch API for efficiency (single call instead of N)
    fetch("/api/email/threads/batch-label", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        threadIds,
        add: [labelId],
        remove: [],
        connectionId: activeConnectionId,
      }),
    })
      .then((r) => r.json())
      .then((json) => {
        if (json.error) {
          toast.error(json.error);
        } else {
          toast(`Added ${threadIds.length === 1 ? "thread" : `${threadIds.length} threads`} to ${displayName}`);
        }
      })
      .catch(() => toast.error("Failed to add to group"));
  }

  // ── Delete label handler ──────────────────────────────────
  async function handleDeleteLabel(labelId: string) {
    try {
      const params = new URLSearchParams({ id: labelId });
      if (activeConnectionId) params.set("connectionId", activeConnectionId);
      const res = await fetch(`/api/email/groups?${params}`, { method: "DELETE" });
      if (!res.ok) {
        const json = await res.json();
        toast.error(json.error ?? "Failed to delete group");
        return;
      }
      toast("Group deleted");
      if (activeLabel === labelId) setActiveLabel("INBOX");
      refreshLabels();
    } catch {
      toast.error("Failed to delete group");
    }
  }

  // ── Right panel toggle ──────────────────────────────────
  function toggleRightPanel() {
    setRightPanelOpen((prev) => {
      const next = !prev;
      try { localStorage.setItem("email-right-panel", String(next)); } catch { /* noop */ }
      return next;
    });
  }

  // ── Drag handlers ──────────────────────────────────────
  function handleDragStart(threadIds: string[]) {
    setIsDragging(true);
    setDraggedThreadIds(threadIds);
  }

  function handleDragEnd() {
    setIsDragging(false);
    setDraggedThreadIds([]);
  }

  function handleDragArchive(threadIds: string[]) {
    if (threadIds.length > 1) {
      performBulkAction(threadIds, "archive");
      toast(`Archived ${threadIds.length} threads`, {
        action: { label: "Undo", onClick: () => undoActionRef.current?.undo() },
      });
    } else if (threadIds.length === 1) {
      performAction(threadIds[0], "archive");
      toast("Archived", {
        action: { label: "Undo", onClick: () => undoActionRef.current?.undo() },
      });
    }
    setSelectedIds(new Set());
    if (threadIds.includes(selectedThreadId ?? "")) setSelectedThreadId(null);
    setIsDragging(false);
    setDraggedThreadIds([]);
  }

  function handleDragBlock(threadIds: string[]) {
    // Block = add to SPAM + remove from INBOX for all threads
    for (const id of threadIds) {
      performAction(id, "labels", { labelIds: { add: ["SPAM"], remove: ["INBOX"] } });
    }
    setThreads((prev) => prev.filter((t) => !threadIds.includes(t.id)));
    toast(threadIds.length > 1 ? `Blocked ${threadIds.length} senders` : "Sender blocked");
    setSelectedIds(new Set());
    if (threadIds.includes(selectedThreadId ?? "")) setSelectedThreadId(null);
    setIsDragging(false);
    setDraggedThreadIds([]);
  }

  // ── Render ───────────────────────────────────────────────

  return (
    <EmailErrorBoundary>
    <div className="flex flex-col h-[calc(100vh-3.5rem)] md:h-screen">
      {/* Account tabs — browser-tab style */}
      {connections.length > 0 && (
        <div className="flex items-center border-b border-white/10 shrink-0 px-1" style={{ backgroundColor: "hsl(var(--surface-1))" }}>
          {connections.map((conn) => {
            const isActive = conn.id === activeConnectionId;
            const emailLabel = conn.email.split("@")[0];
            const domain = conn.email.split("@")[1];
            const isPersonal = conn.provider === "gmail_app_password";
            return (
              <button
                key={conn.id}
                onClick={() => switchAccount(conn.id)}
                className={cn(
                  "group relative flex items-center gap-2 px-3 py-2 text-xs font-medium transition-colors max-w-[200px] min-w-0",
                  isActive
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-white/[0.03]"
                )}
              >
                {isActive && (
                  <div className="absolute bottom-0 left-2 right-2 h-0.5 bg-primary rounded-full" />
                )}
                <span className={cn(
                  "shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold",
                  isActive ? "bg-primary/20 text-primary" : "bg-white/10 text-muted-foreground"
                )}>
                  {isPersonal ? "P" : "G"}
                </span>
                <span className="truncate">{emailLabel}</span>
                <span className="text-[10px] text-muted-foreground hidden sm:inline truncate">@{domain}</span>
              </button>
            );
          })}
          <button
            onClick={() => router.push("/settings/integrations/email")}
            className="flex items-center justify-center w-7 h-7 ml-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-white/5 transition shrink-0"
            title="Add email account"
          >
            <PlusIcon className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

    <div className="flex flex-1 min-h-0">
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
            setSearchQuery("");
            setActiveCategory("all");
          }}
          unreadCounts={unreadCounts}
          onDeleteLabel={handleDeleteLabel}
          onAddThreadsToLabel={handleAddThreadsToLabel}
        />
      </div>

      {/* Thread list */}
      <div className={cn(
        "w-full md:w-80 border-r border-white/10 flex flex-col md:shrink-0",
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
            <Link
              href="/email/dashboard"
              className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-white/5 transition"
              title="Dashboard (d)"
            >
              <LayoutDashboard className="h-4 w-4" />
            </Link>
            <button
              onClick={toggleRightPanel}
              className={cn(
                "rounded-lg p-1.5 hover:bg-white/5 transition",
                rightPanelOpen ? "text-primary" : "text-muted-foreground hover:text-foreground"
              )}
              title="Toggle Panels"
            >
              <PanelRight className="h-4 w-4" />
            </button>
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
                onClick={() => { setSearchQuery(""); }}
                className="text-[10px] text-muted-foreground hover:text-foreground transition"
              >
                Clear
              </button>
            </div>
          </div>
        )}

        {noConnection ? (
          <div className="mx-3 mt-2 rounded-xl border border-primary/30 bg-primary/10 px-4 py-3">
            <div className="flex items-center gap-2 text-sm text-primary">
              <MailPlusIcon className="h-4 w-4 shrink-0" />
              <span className="flex-1">No email connection found. Connect your Gmail to get started.</span>
            </div>
            <div className="flex items-center gap-2 mt-3">
              <button
                onClick={async () => {
                  try {
                    const res = await fetch("/api/email/connections/gmail", { method: "POST" });
                    const json = await res.json();
                    if (json.url) window.location.href = json.url;
                    else toast.error(json.error ?? "Failed to start Gmail OAuth");
                  } catch { toast.error("Failed to connect Gmail"); }
                }}
                className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary/90 transition"
              >
                Connect Gmail
              </button>
              <button
                onClick={() => router.push("/settings/integrations/email")}
                className="rounded-lg bg-white/5 border border-white/10 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-white/10 transition"
              >
                Personal Gmail
              </button>
              <span className="text-[10px] text-muted-foreground">Use App Password — no admin required</span>
            </div>
          </div>
        ) : error ? (
          <div className="mx-3 mt-2 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3">
            <p className="text-xs text-red-400">{error}</p>
            <div className="flex items-center gap-2 mt-2">
              <button
                onClick={refresh}
                className="rounded-lg bg-white/5 border border-white/10 px-3 py-1.5 text-[11px] font-medium text-foreground hover:bg-white/10 transition"
              >
                Retry
              </button>
              {reconnect && (
                <button
                  onClick={() => router.push("/settings/integrations/email")}
                  className="rounded-lg bg-primary px-3 py-1.5 text-[11px] font-medium text-white hover:bg-primary/90 transition"
                >
                  Reconnect Gmail
                </button>
              )}
              <button
                onClick={() => router.push("/settings/integrations/email")}
                className="rounded-lg bg-white/5 border border-white/10 px-3 py-1.5 text-[11px] font-medium text-foreground hover:bg-white/10 transition"
              >
                Try Personal Gmail
              </button>
            </div>
          </div>
        ) : null}

        {/* Bulk action bar */}
        {hasSelection && (
          <div className="px-3 py-2 border-b border-white/10 flex items-center gap-2 shrink-0" style={{ backgroundColor: "hsl(var(--surface-2))" }}>
            <span className="text-xs text-foreground font-medium">{selectedIds.size} selected</span>
            <div className="flex items-center gap-1 ml-auto">
              <BulkButton label="Archive" onClick={handleBulkArchive} />
              <BulkButton label="Trash" onClick={handleBulkTrash} />
              <BulkButton label="Star" onClick={handleBulkStar} />
              <BulkButton label="Read" onClick={handleBulkRead} />
              <BulkButton label="Spam" onClick={handleBulkSpam} />
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
          onRangeSelect={(fromIndex, toIndex) => {
            const start = Math.min(fromIndex, toIndex);
            const end = Math.max(fromIndex, toIndex);
            setSelectedIds((prev) => {
              const next = new Set(prev);
              for (let i = start; i <= end; i++) {
                if (visibleThreads[i]) next.add(visibleThreads[i].id);
              }
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
          onContextAction={handleContextAction}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
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
              connectionId={activeConnectionId}
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

      {/* Right sidebar — Groups panel */}
      {rightPanelOpen && (
        <div
          className="w-72 border-l border-white/10 shrink-0 overflow-y-auto thin-scroll hidden xl:block"
          style={{ backgroundColor: "hsl(var(--surface-1))" }}
        >
          <GroupsPanel
            labels={labels}
            connectionId={activeConnectionId}
            onSelectLabel={(id) => {
              setActiveLabel(id);
              setSelectedThreadId(null);
              setSearchQuery("");
              setActiveCategory("all");
            }}
            onSelectThread={(threadId) => setSelectedThreadId(threadId)}
            onLabelsRefresh={refreshLabels}
            onDeleteLabel={handleDeleteLabel}
            onAddThreadsToLabel={handleAddThreadsToLabel}
          />
        </div>
      )}

      {/* Drag drop zones (archive + block) */}
      <DragDropZones
        visible={isDragging}
        onArchive={handleDragArchive}
        onBlock={handleDragBlock}
      />

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
        connectionId={activeConnectionId}
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

      {/* Label picker (L shortcut) */}
      <LabelPicker
        open={labelPickerOpen}
        onClose={() => setLabelPickerOpen(false)}
        labels={labels}
        onApply={(labelId) => {
          const threadIds = selectedIds.size > 0
            ? Array.from(selectedIds)
            : selectedThreadId ? [selectedThreadId] : [];
          if (threadIds.length > 0) handleAddThreadsToLabel(threadIds, labelId);
        }}
      />

      {/* Compose modal */}
      <ComposeModal
        open={composeOpen}
        onClose={() => setComposeOpen(false)}
        mode={composeMode}
        threadId={composeThreadId}
        messageId={composeMessageId}
        connectionId={activeConnectionId}
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

function PlusIcon({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>;
}
