"use client";

import * as React from "react";
import type { Thread, ThreadList, ThreadListItem, Label, EmailConnection, InboxCategory } from "./types";
import { cacheThreads, getCachedThreads, cacheFullThread, getCachedMessages } from "./idb-cache";
import { createClient } from "@/lib/supabase/client";

// ── Thread cache (module-level singleton) ────────────────────

const threadCache = new Map<string, { data: Thread; ts: number }>();
const listCache = new Map<string, { data: ThreadListItem[]; ts: number; nextPageToken?: string }>();
const CACHE_TTL = 30_000; // 30s stale-while-revalidate window
const POLL_INTERVAL = 120_000; // 120s fallback polling (push handles real-time)
const PREFETCH_BATCH = 3; // prefetch first N threads on list load

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
  const [reconnect, setReconnect] = React.useState(false);

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
        // Try IndexedDB for instant first paint (offline-first)
        const labelId = options?.labelIds?.[0];
        if (labelId && !options?.query) {
          getCachedThreads(labelId).then((idbThreads) => {
            if (idbThreads.length > 0 && threads.length === 0) {
              setThreads(idbThreads as unknown as ThreadListItem[]);
            }
          }).catch(() => {});
        }
        setLoading(true);
      }
    } else {
      setLoading(true);
    }

    setError(undefined);
    setReconnect(false);
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
        setReconnect(!!json.reconnect);
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

      // Persist to IndexedDB for offline access
      cacheThreads(data.threads as unknown as Parameters<typeof cacheThreads>[0]).catch(() => {});

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

  // Background polling — refresh every 120s when tab is visible
  React.useEffect(() => {
    let timer: ReturnType<typeof setInterval>;

    function startPolling() {
      timer = setInterval(() => {
        if (document.visibilityState === "visible") {
          listCache.delete(cacheKey);
          fetchThreads();
        }
      }, POLL_INTERVAL);
    }

    startPolling();
    return () => clearInterval(timer);
  }, [fetchThreads, cacheKey]);

  const loadMore = React.useCallback(() => {
    if (nextPageToken) fetchThreads(nextPageToken);
  }, [nextPageToken, fetchThreads]);

  const refresh = React.useCallback(() => {
    listCache.delete(cacheKey);
    return fetchThreads();
  }, [fetchThreads, cacheKey]);

  return { threads, loading, error, reconnect, nextPageToken, loadMore, refresh, setThreads };
}

// ── Single thread — with cache ──────────────────────────────

export function useThread(threadId: string | null) {
  const [thread, setThread] = React.useState<Thread | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string>();

  React.useEffect(() => {
    if (!threadId) {
      setThread(null);
      setError(undefined);
      return;
    }

    // Serve cached immediately — show data before network, no loading spinner
    const cached = getCachedThread(threadId);
    if (cached) {
      setThread(cached);
      // If cache has full messages and is fresh, skip network entirely
      if (cached.messages?.length > 0) {
        const entry = threadCache.get(threadId);
        if (entry && Date.now() - entry.ts < CACHE_TTL) {
          return;
        }
      }
      // Revalidate in background — don't show loading since we already have data
    } else {
      setLoading(true);
    }
    setError(undefined);
    fetch(`/api/email/threads/${threadId}`)
      .then(async (r) => {
        const json = await r.json();
        if (!r.ok) {
          setError(json.error ?? "Failed to load thread");
          // Try IndexedDB fallback for offline
          getCachedMessages(threadId).then((msgs) => {
            if (msgs.length > 0) {
              const cached = getCachedThread(threadId);
              if (cached) {
                setThread({ ...cached, messages: msgs as unknown as Thread["messages"] });
              }
            } else {
              setThread(null);
            }
          }).catch(() => setThread(null));
          return;
        }
        const data = json.data ?? null;
        setThread(data);
        if (data) {
          setCachedThread(threadId, data);
          // Persist messages to IDB for offline reading
          if (data.messages?.length > 0) {
            cacheFullThread(threadId, data.messages).catch(() => {});
          }
        }
      })
      .catch(() => {
        setError("Network error");
        // Try IndexedDB fallback for offline
        getCachedMessages(threadId).then((msgs) => {
          if (msgs.length > 0) {
            const cached = getCachedThread(threadId);
            if (cached) {
              setThread({ ...cached, messages: msgs as unknown as Thread["messages"] });
            }
          } else {
            setThread(null);
          }
        }).catch(() => setThread(null));
      })
      .finally(() => setLoading(false));
  }, [threadId]);

  return { thread, loading, error, setThread };
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

/** Prefetch first N threads on list load for instant navigation */
export function useBatchPrefetch(threads: { id: string }[]) {
  const prefetchedRef = React.useRef(new Set<string>());
  const threadsRef = React.useRef(threads);
  threadsRef.current = threads;

  const depKey = threads.slice(0, PREFETCH_BATCH).map((t) => t.id).join(",");

  React.useEffect(() => {
    const current = threadsRef.current;
    if (current.length === 0) return;

    const toPrefetch = current
      .slice(0, PREFETCH_BATCH)
      .filter((t) => {
        if (prefetchedRef.current.has(t.id)) return false;
        const entry = threadCache.get(t.id);
        return !(entry && entry.data.messages?.length > 0 && Date.now() - entry.ts < CACHE_TTL);
      });

    // Stagger prefetches to avoid request burst
    const timers: ReturnType<typeof setTimeout>[] = [];
    toPrefetch.forEach((t, i) => {
      timers.push(setTimeout(() => {
        prefetchedRef.current.add(t.id);
        fetch(`/api/email/threads/${t.id}`)
          .then((r) => r.json())
          .then((json) => {
            if (json.data) setCachedThread(t.id, json.data);
          })
          .catch(() => {});
      }, i * 200));
    });

    return () => { timers.forEach(clearTimeout); };
  }, [depKey]); // eslint-disable-line react-hooks/exhaustive-deps
}

// ── Labels ──────────────────────────────────────────────────

export function useLabels() {
  const [labels, setLabels] = React.useState<Label[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string>();

  React.useEffect(() => {
    fetch("/api/email/labels")
      .then(async (r) => {
        const json = await r.json();
        if (!r.ok) {
          setError(json.error ?? "Failed to load labels");
          return;
        }
        setLabels(json.data ?? []);
      })
      .catch(() => {
        setError("Network error");
      })
      .finally(() => setLoading(false));
  }, []);

  return { labels, loading, error };
}

// ── Split inbox categorization ──────────────────────────────

// Gmail category label IDs
const CATEGORY_MAP: Record<string, InboxCategory> = {
  "CATEGORY_PERSONAL": "vip",
  "CATEGORY_SOCIAL": "fyi",
  "CATEGORY_PROMOTIONS": "newsletter",
  "CATEGORY_UPDATES": "fyi",
  "CATEGORY_FORUMS": "other",
};

// Heuristic: categorize based on labels and sender patterns
export function categorizeThread(thread: ThreadListItem): InboxCategory {
  // Check Gmail category labels first
  for (const labelId of thread.labelIds) {
    const cat = CATEGORY_MAP[labelId];
    if (cat) return cat;
  }

  // Heuristic: noreply/notifications → fyi
  const senderEmail = thread.from[0]?.email ?? "";
  if (
    senderEmail.includes("noreply") || senderEmail.includes("no-reply") ||
    senderEmail.includes("notifications") || senderEmail.includes("notify") ||
    senderEmail.includes("mailer-daemon") || senderEmail.includes("digest") ||
    senderEmail.includes("updates@")
  ) return "fyi";

  // Heuristic: newsletter/marketing patterns → newsletter
  if (
    senderEmail.includes("newsletter") || senderEmail.includes("marketing") ||
    senderEmail.includes("promo") || senderEmail.includes("info@")
  ) return "newsletter";

  // Default: assume direct emails need action
  return "action_required";
}

// ── AI-powered categorization ───────────────────────────────

const aiCategoryCache = new Map<string, InboxCategory>();

export function useAICategories(threads: ThreadListItem[]) {
  const [categories, setCategories] = React.useState<Map<string, InboxCategory>>(new Map());
  const fetchedRef = React.useRef(new Set<string>());

  React.useEffect(() => {
    // Find threads not yet categorized by AI
    const uncategorized = threads.filter(t => !aiCategoryCache.has(t.id) && !fetchedRef.current.has(t.id));
    if (uncategorized.length === 0) {
      // Return cached results
      const cached = new Map<string, InboxCategory>();
      for (const t of threads) {
        const cat = aiCategoryCache.get(t.id);
        if (cat) cached.set(t.id, cat);
      }
      if (cached.size > 0) setCategories(cached);
      return;
    }

    // Mark as in-flight
    for (const t of uncategorized) fetchedRef.current.add(t.id);

    // Batch up to 20
    const batch = uncategorized.slice(0, 20).map(t => ({
      id: t.id,
      subject: t.subject,
      snippet: t.snippet,
      from: t.from[0]?.email ?? "",
    }));

    fetch("/api/email/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "categorize", threads: batch }),
    })
      .then(r => r.json())
      .then(json => {
        const cats = json.data?.categories ?? {};
        setCategories(prev => {
          const updated = new Map(prev);
          for (const [id, cat] of Object.entries(cats)) {
            aiCategoryCache.set(id, cat as InboxCategory);
            updated.set(id, cat as InboxCategory);
          }
          return updated;
        });
      })
      .catch(() => {});
  }, [threads]);

  return categories;
}

export function useSplitInbox(threads: ThreadListItem[], aiCategories?: Map<string, InboxCategory>) {
  return React.useMemo(() => {
    const split: Record<InboxCategory, ThreadListItem[]> = {
      vip: [], action_required: [], fyi: [], newsletter: [], other: [],
    };
    const counts: Record<InboxCategory, number> = {
      vip: 0, action_required: 0, fyi: 0, newsletter: 0, other: 0,
    };

    for (const thread of threads) {
      const cat = aiCategories?.get(thread.id) ?? categorizeThread(thread);
      split[cat].push(thread);
      if (thread.isUnread) counts[cat]++;
    }

    return { split, counts };
  }, [threads, aiCategories]);
}

// ── Gmail Pub/Sub push notifications ────────────────────────

export function useGmailPush(onNewMail: () => void) {
  React.useEffect(() => {
    // Register watch on mount (fire-and-forget)
    fetch("/api/email/watch", { method: "POST" }).catch(() => {});

    // Subscribe to Realtime push events via Supabase
    const supabase = createClient();
    if (!supabase) return;

    const channel = supabase
      .channel("gmail-push")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "crm_email_push_events" },
        () => {
          onNewMail();
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [onNewMail]);
}

// ── Thread actions (optimistic) ─────────────────────────────

export function useEmailActions(
  setThreads: React.Dispatch<React.SetStateAction<ThreadListItem[]>>
) {
  // Undo support — use ref to avoid dependency loop in performAction
  const [undoAction, setUndoAction] = React.useState<{
    threadId: string;
    action: string;
    undo: () => void;
    timer: ReturnType<typeof setTimeout>;
  } | null>(null);
  const undoActionRef = React.useRef(undoAction);
  undoActionRef.current = undoAction;

  const performAction = React.useCallback(
    async (threadId: string, action: string, extraIn?: Record<string, unknown>) => {
      let extra = extraIn;
      // Optimistic update
      if (action === "archive" || action === "trash") {
        let removedThread: ThreadListItem | undefined;
        setThreads((prev) => {
          removedThread = prev.find((t) => t.id === threadId);
          return prev.filter((t) => t.id !== threadId);
        });

        // Undo support — 5 second window
        if (removedThread) {
          if (undoActionRef.current) {
            clearTimeout(undoActionRef.current.timer);
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
        // Track current state before optimistic toggle so server can skip the extra GET
        let currentlyStarred = false;
        setThreads((prev) =>
          prev.map((t) => {
            if (t.id === threadId) {
              currentlyStarred = t.isStarred;
              return { ...t, isStarred: !t.isStarred };
            }
            return t;
          })
        );
        extra = { ...extra, currentlyStarred };
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

      // Fire-and-forget for non-destructive actions — UI already updated optimistically
      fetch(`/api/email/threads/${threadId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      }).catch(() => {});
    },
    [setThreads]
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
  onToggleSelect?: () => void;
  onSelectAll?: () => void;
  onDeselectAll?: () => void;
  // Vim-style g-chord navigation
  onGoInbox?: () => void;
  onGoStarred?: () => void;
  onGoSent?: () => void;
  onGoDrafts?: () => void;
  onGoAll?: () => void;
  onShowHelp?: () => void;
  onCommandPalette?: () => void;
};

export function useEmailKeyboard(actions: KeyboardActions, enabled = true) {
  // Track g-chord state (vim-style two-key combos)
  const gPendingRef = React.useRef(false);
  const gTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

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
          actions.onCommandPalette?.();
          return;
        }
        if (e.key === "Enter" && actions.onSendAndArchive) {
          e.preventDefault();
          actions.onSendAndArchive();
          return;
        }
        return;
      }

      // Handle g-chord (vim: gi=inbox, gs=starred, gt=sent, gd=drafts, ga=all)
      if (gPendingRef.current) {
        gPendingRef.current = false;
        if (gTimerRef.current) clearTimeout(gTimerRef.current);
        e.preventDefault();
        switch (e.key) {
          case "i": actions.onGoInbox?.(); return;
          case "s": actions.onGoStarred?.(); return;
          case "t": actions.onGoSent?.(); return;
          case "d": actions.onGoDrafts?.(); return;
          case "a": actions.onGoAll?.(); return;
        }
        return;
      }

      if (e.key === "g") {
        gPendingRef.current = true;
        // Auto-cancel after 500ms
        gTimerRef.current = setTimeout(() => { gPendingRef.current = false; }, 500);
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
        case "d":
          e.preventDefault();
          actions.onTrash();
          break;
        case "x":
          e.preventDefault();
          actions.onToggleSelect?.();
          break;
        case "?":
          e.preventDefault();
          actions.onShowHelp?.();
          break;
      }

      // Shift combos
      if (e.shiftKey && e.key === "A") {
        e.preventDefault();
        actions.onSelectAll?.();
      }
    }

    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("keydown", handleKey);
      if (gTimerRef.current) clearTimeout(gTimerRef.current);
    };
  }, [actions, enabled]);
}
