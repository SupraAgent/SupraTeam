"use client";

import * as React from "react";
import type { Thread, ThreadList, ThreadListItem, Label, EmailConnection, InboxCategory } from "./types";

// ── Thread cache (module-level singleton) ────────────────────

const threadCache = new Map<string, { data: Thread; ts: number }>();
const listCache = new Map<string, { data: ThreadListItem[]; ts: number; nextPageToken?: string }>();
const CACHE_TTL = 60_000; // 1 minute stale-while-revalidate window

function getCachedThread(id: string): Thread | null {
  const entry = threadCache.get(id);
  if (!entry) return null;
  return entry.data;
}

function setCachedThread(id: string, data: Thread) {
  threadCache.set(id, { data, ts: Date.now() });
}

function isCacheStale(key: string, cache: Map<string, { ts: number }>): boolean {
  const entry = cache.get(key);
  if (!entry) return true;
  return Date.now() - entry.ts > CACHE_TTL;
}

function getListCacheKey(labelIds?: string[], query?: string): string {
  return `${labelIds?.join(",") ?? ""}|${query ?? ""}`;
}

// ── Connections ─────────────────────────────────────────────

export function useEmailConnections() {
  const [connections, setConnections] = React.useState<EmailConnection[]>([]);
  const [loading, setLoading] = React.useState(true);

  const refresh = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/email/connections");
      if (res.ok) {
        const json = await res.json();
        setConnections(json.data ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { refresh(); }, [refresh]);

  return { connections, loading, refresh };
}

// ── Threads (inbox) — with cache + stale-while-revalidate ───

export function useThreads(options?: {
  labelIds?: string[];
  query?: string;
  maxResults?: number;
}) {
  const [threads, setThreads] = React.useState<ThreadListItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [nextPageToken, setNextPageToken] = React.useState<string>();
  const [error, setError] = React.useState<string>();

  const cacheKey = getListCacheKey(options?.labelIds, options?.query);

  const fetchThreads = React.useCallback(async (pageToken?: string) => {
    // Serve from cache immediately (stale-while-revalidate)
    if (!pageToken) {
      const cached = listCache.get(cacheKey);
      if (cached) {
        setThreads(cached.data);
        setNextPageToken(cached.nextPageToken);
        // If cache is fresh, skip network
        if (!isCacheStale(cacheKey, listCache)) {
          setLoading(false);
          return;
        }
        // Otherwise continue to revalidate in background (don't show loading)
      } else {
        setLoading(true);
      }
    } else {
      setLoading(true);
    }

    setError(undefined);
    try {
      const params = new URLSearchParams();
      if (options?.labelIds?.length) params.set("labelIds", options.labelIds.join(","));
      if (options?.query) params.set("q", options.query);
      if (options?.maxResults) params.set("maxResults", String(options.maxResults));
      if (pageToken) params.set("pageToken", pageToken);

      const res = await fetch(`/api/email/threads?${params}`);
      const json = await res.json();

      if (!res.ok) {
        setError(json.error ?? "Failed to load");
        return;
      }

      const data = json.data as ThreadList;
      if (pageToken) {
        setThreads((prev) => {
          const merged = [...prev, ...data.threads];
          listCache.set(cacheKey, { data: merged, ts: Date.now(), nextPageToken: data.nextPageToken });
          return merged;
        });
      } else {
        setThreads(data.threads);
        listCache.set(cacheKey, { data: data.threads, ts: Date.now(), nextPageToken: data.nextPageToken });
      }
      setNextPageToken(data.nextPageToken);

      // Pre-warm thread cache with list items (snippet data)
      for (const t of data.threads) {
        if (!threadCache.has(t.id)) {
          // Store partial data for instant thread preview
          threadCache.set(t.id, {
            data: { ...t, messages: [] } as unknown as Thread,
            ts: 0, // Mark as stale so full fetch happens
          });
        }
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, [options?.labelIds?.join(","), options?.query, options?.maxResults, cacheKey]);

  React.useEffect(() => { fetchThreads(); }, [fetchThreads]);

  const loadMore = React.useCallback(() => {
    if (nextPageToken) fetchThreads(nextPageToken);
  }, [nextPageToken, fetchThreads]);

  const refresh = React.useCallback(() => {
    listCache.delete(cacheKey);
    return fetchThreads();
  }, [fetchThreads, cacheKey]);

  return { threads, loading, error, nextPageToken, loadMore, refresh, setThreads };
}

// ── Single thread — with cache ──────────────────────────────

export function useThread(threadId: string | null) {
  const [thread, setThread] = React.useState<Thread | null>(null);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (!threadId) {
      setThread(null);
      return;
    }

    // Serve cached immediately
    const cached = getCachedThread(threadId);
    if (cached && cached.messages?.length > 0) {
      setThread(cached);
      // If fresh, skip network
      const entry = threadCache.get(threadId);
      if (entry && Date.now() - entry.ts < CACHE_TTL) {
        return;
      }
      // Revalidate in background
    }

    setLoading(true);
    fetch(`/api/email/threads/${threadId}`)
      .then((r) => r.json())
      .then((json) => {
        const data = json.data ?? null;
        setThread(data);
        if (data) setCachedThread(threadId, data);
      })
      .catch(() => setThread(null))
      .finally(() => setLoading(false));
  }, [threadId]);

  return { thread, loading };
}

// ── Prefetch thread on hover ────────────────────────────────

export function usePrefetchThread() {
  const prefetch = React.useCallback((threadId: string) => {
    const entry = threadCache.get(threadId);
    // Only prefetch if we don't have full data
    if (entry && entry.data.messages?.length > 0 && Date.now() - entry.ts < CACHE_TTL) {
      return;
    }
    fetch(`/api/email/threads/${threadId}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.data) setCachedThread(threadId, json.data);
      })
      .catch(() => {});
  }, []);

  return prefetch;
}

// ── Labels ──────────────────────────────────────────────────

export function useLabels() {
  const [labels, setLabels] = React.useState<Label[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    fetch("/api/email/labels")
      .then((r) => r.json())
      .then((json) => setLabels(json.data ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return { labels, loading };
}

// ── Split inbox categorization ──────────────────────────────

// Gmail category label IDs
const CATEGORY_MAP: Record<string, InboxCategory> = {
  CATEGORY_PERSONAL: "important",
  CATEGORY_SOCIAL: "updates",
  CATEGORY_PROMOTIONS: "other",
  CATEGORY_UPDATES: "updates",
  CATEGORY_FORUMS: "other",
  IMPORTANT: "important",
  STARRED: "important",
};

// Heuristic: categorize based on labels and sender patterns
export function categorizeThread(thread: ThreadListItem): InboxCategory {
  // Check Gmail category labels first
  for (const labelId of thread.labelIds) {
    const cat = CATEGORY_MAP[labelId];
    if (cat) return cat;
  }

  // Heuristic: noreply/notifications → updates
  const senderEmail = thread.from[0]?.email ?? "";
  if (
    senderEmail.includes("noreply") ||
    senderEmail.includes("no-reply") ||
    senderEmail.includes("notifications") ||
    senderEmail.includes("notify") ||
    senderEmail.includes("mailer-daemon") ||
    senderEmail.includes("digest") ||
    senderEmail.includes("updates@")
  ) {
    return "updates";
  }

  // Heuristic: newsletter/marketing patterns → other
  if (
    senderEmail.includes("newsletter") ||
    senderEmail.includes("marketing") ||
    senderEmail.includes("promo") ||
    senderEmail.includes("info@") ||
    senderEmail.includes("hello@") ||
    senderEmail.includes("team@")
  ) {
    return "other";
  }

  // Default: important (direct human emails)
  return "important";
}

export function useSplitInbox(threads: ThreadListItem[]) {
  return React.useMemo(() => {
    const split: Record<InboxCategory, ThreadListItem[]> = {
      important: [],
      updates: [],
      other: [],
    };
    const counts: Record<InboxCategory, number> = { important: 0, updates: 0, other: 0 };

    for (const thread of threads) {
      const cat = categorizeThread(thread);
      split[cat].push(thread);
      if (thread.isUnread) counts[cat]++;
    }

    return { split, counts };
  }, [threads]);
}

// ── Thread actions (optimistic) ─────────────────────────────

export function useEmailActions(
  setThreads: React.Dispatch<React.SetStateAction<ThreadListItem[]>>
) {
  // Undo support
  const [undoAction, setUndoAction] = React.useState<{
    threadId: string;
    action: string;
    undo: () => void;
    timer: ReturnType<typeof setTimeout>;
  } | null>(null);

  const performAction = React.useCallback(
    async (threadId: string, action: string, extra?: Record<string, unknown>) => {
      // Optimistic update
      if (action === "archive" || action === "trash") {
        let removedThread: ThreadListItem | undefined;
        setThreads((prev) => {
          removedThread = prev.find((t) => t.id === threadId);
          return prev.filter((t) => t.id !== threadId);
        });

        // Undo support — 5 second window
        if (removedThread) {
          if (undoAction) {
            clearTimeout(undoAction.timer);
          }

          const timer = setTimeout(() => {
            // Actually execute
            fetch(`/api/email/threads/${threadId}`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action, ...extra }),
            });
            setUndoAction(null);
          }, 5000);

          const captured = removedThread;
          setUndoAction({
            threadId,
            action,
            timer,
            undo: () => {
              clearTimeout(timer);
              setThreads((prev) => [captured, ...prev]);
              setUndoAction(null);
            },
          });
          return;
        }
      }

      if (action === "star") {
        setThreads((prev) =>
          prev.map((t) => (t.id === threadId ? { ...t, isStarred: !t.isStarred } : t))
        );
      }

      if (action === "read") {
        setThreads((prev) =>
          prev.map((t) => (t.id === threadId ? { ...t, isUnread: false } : t))
        );
      }

      if (action === "unread") {
        setThreads((prev) =>
          prev.map((t) => (t.id === threadId ? { ...t, isUnread: true } : t))
        );
      }

      // Execute immediately for non-destructive actions
      await fetch(`/api/email/threads/${threadId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
    },
    [setThreads, undoAction]
  );

  return { performAction, undoAction };
}

// ── Keyboard shortcuts ──────────────────────────────────────

type KeyboardActions = {
  onNext: () => void;
  onPrev: () => void;
  onOpen: () => void;
  onBack: () => void;
  onArchive: () => void;
  onTrash: () => void;
  onReply: () => void;
  onReplyAll: () => void;
  onForward: () => void;
  onStar: () => void;
  onMarkUnread: () => void;
  onCompose: () => void;
  onSearch: () => void;
  onArchiveNext: () => void;
  onArchivePrev: () => void;
  onSnooze: () => void;
  onSendAndArchive?: () => void;
};

export function useEmailKeyboard(actions: KeyboardActions, enabled = true) {
  React.useEffect(() => {
    if (!enabled) return;

    function handleKey(e: KeyboardEvent) {
      // Don't handle if typing in an input
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }

      // Cmd/Ctrl shortcuts
      if (e.metaKey || e.ctrlKey) {
        if (e.key === "k") {
          e.preventDefault();
          actions.onSearch();
          return;
        }
        if (e.key === "Enter" && actions.onSendAndArchive) {
          e.preventDefault();
          actions.onSendAndArchive();
          return;
        }
        return;
      }

      switch (e.key) {
        case "j":
          e.preventDefault();
          actions.onNext();
          break;
        case "k":
          e.preventDefault();
          actions.onPrev();
          break;
        case "Enter":
          e.preventDefault();
          actions.onOpen();
          break;
        case "Escape":
          e.preventDefault();
          actions.onBack();
          break;
        case "e":
          e.preventDefault();
          actions.onArchive();
          break;
        case "#":
          e.preventDefault();
          actions.onTrash();
          break;
        case "r":
          e.preventDefault();
          actions.onReply();
          break;
        case "a":
          e.preventDefault();
          actions.onReplyAll();
          break;
        case "f":
          e.preventDefault();
          actions.onForward();
          break;
        case "s":
          e.preventDefault();
          actions.onStar();
          break;
        case "u":
          e.preventDefault();
          actions.onMarkUnread();
          break;
        case "c":
          e.preventDefault();
          actions.onCompose();
          break;
        case "/":
          e.preventDefault();
          actions.onSearch();
          break;
        case "[":
          e.preventDefault();
          actions.onArchivePrev();
          break;
        case "]":
          e.preventDefault();
          actions.onArchiveNext();
          break;
        case "h":
          e.preventDefault();
          actions.onSnooze();
          break;
      }
    }

    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [actions, enabled]);
}
