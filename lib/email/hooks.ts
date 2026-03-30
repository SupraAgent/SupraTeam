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
const THREAD_CACHE_MAX = 500;
const LIST_CACHE_MAX = 50;
const AI_CATEGORY_CACHE_MAX = 1000;

function evictIfNeeded<V>(map: Map<string, V>, maxSize: number) {
  if (map.size <= maxSize) return;
  const toDelete = map.size - maxSize;
  let i = 0;
  for (const key of map.keys()) {
    if (i++ >= toDelete) break;
    map.delete(key);
  }
}

function getCachedThread(id: string, connectionId?: string): Thread | null {
  const key = `${connectionId ?? "default"}:${id}`;
  const entry = threadCache.get(key);
  if (!entry) return null;
  return entry.data;
}

function setCachedThread(id: string, data: Thread, connectionId?: string) {
  const key = `${connectionId ?? "default"}:${id}`;
  threadCache.set(key, { data, ts: Date.now() });
  evictIfNeeded(threadCache, THREAD_CACHE_MAX);
}

function isCacheStale(key: string, cache: Map<string, { ts: number }>): boolean {
  const entry = cache.get(key);
  if (!entry) return true;
  return Date.now() - entry.ts > CACHE_TTL;
}

function getListCacheKey(labelIds?: string[], query?: string, connectionId?: string): string {
  return `${connectionId ?? "default"}|${labelIds?.join(",") ?? ""}|${query ?? ""}`;
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
  connectionId?: string;
}) {
  const [threads, setThreads] = React.useState<ThreadListItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [nextPageToken, setNextPageToken] = React.useState<string>();
  const [error, setError] = React.useState<string>();
  const [reconnect, setReconnect] = React.useState(false);

  const cacheKey = getListCacheKey(options?.labelIds, options?.query, options?.connectionId);

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
        // IDB is not scoped by connectionId — only use for default connection
        const labelId = options?.labelIds?.[0];
        if (labelId && !options?.query && !options?.connectionId) {
          getCachedThreads(labelId).then((idbThreads) => {
            if (idbThreads.length > 0) {
              // Use functional update to avoid stale closure over threads
              setThreads((prev) => prev.length === 0 ? idbThreads as unknown as ThreadListItem[] : prev);
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
      if (options?.connectionId) params.set("connectionId", options.connectionId);
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
          evictIfNeeded(listCache, LIST_CACHE_MAX);
          return merged;
        });
      } else {
        setThreads(data.threads);
        listCache.set(cacheKey, { data: data.threads, ts: Date.now(), nextPageToken: data.nextPageToken });
          evictIfNeeded(listCache, LIST_CACHE_MAX);
      }
      setNextPageToken(data.nextPageToken);

      // Persist to IndexedDB for offline access
      cacheThreads(data.threads as unknown as Parameters<typeof cacheThreads>[0]).catch(() => {});

      // Pre-warm thread cache with list items (snippet data)
      for (const t of data.threads) {
        const threadCacheKey = `${options?.connectionId ?? "default"}:${t.id}`;
        if (!threadCache.has(threadCacheKey)) {
          // Store partial data for instant thread preview
          threadCache.set(threadCacheKey, {
            data: { ...t, messages: [] } as unknown as Thread,
            ts: 0, // Mark as stale so full fetch happens
          });
        }
      }
      evictIfNeeded(threadCache, THREAD_CACHE_MAX);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, [options?.labelIds?.join(","), options?.query, options?.maxResults, options?.connectionId, cacheKey]);

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

export function useThread(threadId: string | null, connectionId?: string) {
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
    const cached = getCachedThread(threadId, connectionId);
    if (cached) {
      setThread(cached);
      // If cache has full messages and is fresh, skip network entirely
      if (cached.messages?.length > 0) {
        const cacheKey = `${connectionId ?? "default"}:${threadId}`;
        const entry = threadCache.get(cacheKey);
        if (entry && Date.now() - entry.ts < CACHE_TTL) {
          return;
        }
      }
      // Revalidate in background — don't show loading since we already have data
    } else {
      setLoading(true);
    }
    setError(undefined);
    const threadUrl = connectionId
      ? `/api/email/threads/${threadId}?connection_id=${connectionId}`
      : `/api/email/threads/${threadId}`;
    fetch(threadUrl)
      .then(async (r) => {
        const json = await r.json();
        if (!r.ok) {
          setError(json.error ?? "Failed to load thread");
          // Try IndexedDB fallback for offline
          getCachedMessages(threadId).then((msgs) => {
            if (msgs.length > 0) {
              const cached = getCachedThread(threadId, connectionId);
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
          setCachedThread(threadId, data, connectionId);
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
            const cached = getCachedThread(threadId, connectionId);
            if (cached) {
              setThread({ ...cached, messages: msgs as unknown as Thread["messages"] });
            }
          } else {
            setThread(null);
          }
        }).catch(() => setThread(null));
      })
      .finally(() => setLoading(false));
  }, [threadId, connectionId]);

  return { thread, loading, error, setThread };
}

// ── Prefetch thread on hover ────────────────────────────────

export function usePrefetchThread(connectionId?: string) {
  const prefetch = React.useCallback((threadId: string) => {
    const cacheKey = `${connectionId ?? "default"}:${threadId}`;
    const entry = threadCache.get(cacheKey);
    // Only prefetch if we don't have full data
    if (entry && entry.data.messages?.length > 0 && Date.now() - entry.ts < CACHE_TTL) {
      return;
    }
    const url = connectionId
      ? `/api/email/threads/${threadId}?connection_id=${connectionId}`
      : `/api/email/threads/${threadId}`;
    fetch(url)
      .then((r) => r.json())
      .then((json) => {
        if (json.data) setCachedThread(threadId, json.data, connectionId);
      })
      .catch(() => {});
  }, [connectionId]);

  return prefetch;
}

/** Prefetch first N threads on list load for instant navigation */
export function useBatchPrefetch(threads: { id: string }[], connectionId?: string) {
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
        const cacheKey = `${connectionId ?? "default"}:${t.id}`;
        const entry = threadCache.get(cacheKey);
        return !(entry && entry.data.messages?.length > 0 && Date.now() - entry.ts < CACHE_TTL);
      });

    // Stagger prefetches to avoid request burst
    const timers: ReturnType<typeof setTimeout>[] = [];
    toPrefetch.forEach((t, i) => {
      timers.push(setTimeout(() => {
        prefetchedRef.current.add(t.id);
        const url = connectionId
          ? `/api/email/threads/${t.id}?connection_id=${connectionId}`
          : `/api/email/threads/${t.id}`;
        fetch(url)
          .then((r) => r.json())
          .then((json) => {
            if (json.data) setCachedThread(t.id, json.data, connectionId);
          })
          .catch(() => {});
      }, i * 200));
    });

    return () => { timers.forEach(clearTimeout); };
  }, [depKey, connectionId]); // eslint-disable-line react-hooks/exhaustive-deps
}

// ── Labels ──────────────────────────────────────────────────

export function useLabels(connectionId?: string) {
  const [labels, setLabels] = React.useState<Label[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string>();

  React.useEffect(() => {
    const labelsUrl = connectionId
      ? `/api/email/labels?connectionId=${connectionId}`
      : "/api/email/labels";
    fetch(labelsUrl)
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
  }, [connectionId]);

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

  // Keep a ref to the latest threads so the effect body reads fresh data
  // while the dependency is a stable string of IDs.
  const threadsRef = React.useRef(threads);
  threadsRef.current = threads;
  const threadIdsKey = threads.map(t => t.id).join(",");

  React.useEffect(() => {
    const currentThreads = threadsRef.current;
    // Find threads not yet categorized by AI
    const uncategorized = currentThreads.filter(t => !aiCategoryCache.has(t.id) && !fetchedRef.current.has(t.id));
    if (uncategorized.length === 0) {
      // Return cached results
      const cached = new Map<string, InboxCategory>();
      for (const t of currentThreads) {
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
        // If AI returned a parse error, un-mark threads so they can be retried
        if (json.parseError) {
          for (const t of batch) fetchedRef.current.delete(t.id);
          return;
        }
        const cats = json.data?.categories ?? {};
        setCategories(prev => {
          const updated = new Map(prev);
          for (const [id, cat] of Object.entries(cats)) {
            aiCategoryCache.set(id, cat as InboxCategory);
            updated.set(id, cat as InboxCategory);
          }
          evictIfNeeded(aiCategoryCache, AI_CATEGORY_CACHE_MAX);
          return updated;
        });
      })
      .catch(() => {
        // Un-mark on network error so threads can be retried
        for (const t of batch) fetchedRef.current.delete(t.id);
      });
  }, [threadIdsKey]); // eslint-disable-line react-hooks/exhaustive-deps

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
  const onNewMailRef = React.useRef(onNewMail);
  onNewMailRef.current = onNewMail;

  React.useEffect(() => {
    // Register watch once per session — not on every mount.
    // Gmail watches last 7 days and the renew-watches cron handles renewal.
    // Firing on every mount wastes API quota on page navigation.
    if (!sessionStorage.getItem("gmail_watch_registered")) {
      fetch("/api/email/watch", { method: "POST" })
        .then((r) => {
          // Set flag on success OR non-retryable errors (4xx = not applicable / not supported).
          // Only skip setting the flag on 5xx so those get retried on next navigation.
          if (r.ok || r.status < 500) {
            sessionStorage.setItem("gmail_watch_registered", "1");
          }
        })
        .catch(() => {});
    }

    // Subscribe to Realtime push events via Supabase
    const supabase = createClient();
    if (!supabase) return;

    // Delay subscription until userId is available to prevent receiving all users' events
    let channel: ReturnType<typeof supabase.channel> | null = null;

    supabase.auth.getUser().then(({ data }) => {
      const userId = data.user?.id;
      if (!userId) return;

      channel = supabase
        .channel("gmail-push")
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "crm_email_push_events",
            filter: `user_id=eq.${userId}`,
          },
          () => {
            onNewMailRef.current();
          }
        )
        .subscribe();
    });

    return () => {
      channel?.unsubscribe();
    };
  }, []); // stable — runs once, callback accessed via ref
}

// ── Thread actions (optimistic) ─────────────────────────────

export function useEmailActions(
  setThreads: React.Dispatch<React.SetStateAction<ThreadListItem[]>>,
  connectionId?: string
) {
  // Undo support — use ref to avoid dependency loop in performAction
  const [undoAction, setUndoAction] = React.useState<{
    threadId: string | string[];
    action: string;
    undo: () => void;
    timer: ReturnType<typeof setTimeout>;
  } | null>(null);
  const undoActionRef = React.useRef(undoAction);
  undoActionRef.current = undoAction;

  // Refs for values captured inside setThreads updaters (concurrent-mode safe)
  const removedThreadRef = React.useRef<ThreadListItem | undefined>(undefined);
  const currentlyStarredRef = React.useRef(false);

  // Flush pending undo action on unmount — ensures the API call fires
  // even if the user navigates away within the 5-second undo window.
  React.useEffect(() => {
    return () => {
      const pending = undoActionRef.current;
      if (pending) {
        clearTimeout(pending.timer);
        const ids = Array.isArray(pending.threadId) ? pending.threadId : [pending.threadId];
        for (const id of ids) {
          fetch(`/api/email/threads/${id}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: pending.action, ...(connectionId ? { connection_id: connectionId } : {}) }),
          }).catch(() => {});
        }
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // When connectionId changes (account switch), flush pending undo against the correct account
  const prevConnectionIdRef = React.useRef(connectionId);
  React.useEffect(() => {
    if (prevConnectionIdRef.current !== connectionId) {
      const pending = undoActionRef.current;
      if (pending) {
        clearTimeout(pending.timer);
        const ids = Array.isArray(pending.threadId) ? pending.threadId : [pending.threadId];
        const prevConnId = prevConnectionIdRef.current;
        for (const id of ids) {
          fetch(`/api/email/threads/${id}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: pending.action, ...(prevConnId ? { connection_id: prevConnId } : {}) }),
          }).catch(() => {});
        }
        setUndoAction(null);
      }
      prevConnectionIdRef.current = connectionId;
    }
  }, [connectionId]);

  const performAction = React.useCallback(
    async (threadId: string, action: string, extraIn?: Record<string, unknown>) => {
      let extra = extraIn;
      // Optimistic update
      if (action === "archive" || action === "trash") {
        removedThreadRef.current = undefined;
        setThreads((prev) => {
          removedThreadRef.current = prev.find((t) => t.id === threadId);
          return prev.filter((t) => t.id !== threadId);
        });

        // Undo support — 5 second window
        if (removedThreadRef.current) {
          // Execute the PREVIOUS pending undo action immediately before replacing it,
          // so rapid archive on thread A then B doesn't silently drop A's API call.
          if (undoActionRef.current) {
            clearTimeout(undoActionRef.current.timer);
            const prev = undoActionRef.current;
            fetch(`/api/email/threads/${prev.threadId}`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: prev.action, ...(connectionId ? { connection_id: connectionId } : {}) }),
            }).catch(() => {});
          }

          const timer = setTimeout(() => {
            // Actually execute
            fetch(`/api/email/threads/${threadId}`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action, ...extra, ...(connectionId ? { connection_id: connectionId } : {}) }),
            });
            setUndoAction(null);
          }, 5000);

          const captured = removedThreadRef.current;
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
        currentlyStarredRef.current = false;
        setThreads((prev) =>
          prev.map((t) => {
            if (t.id === threadId) {
              currentlyStarredRef.current = t.isStarred;
              return { ...t, isStarred: !t.isStarred };
            }
            return t;
          })
        );
        extra = { ...extra, currentlyStarred: currentlyStarredRef.current };
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

      // Optimistic update with rollback on failure
      fetch(`/api/email/threads/${threadId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra, ...(connectionId ? { connection_id: connectionId } : {}) }),
      }).then((res) => {
        if (!res.ok) {
          // Rollback: revert the optimistic update
          if (action === "star") {
            setThreads((prev) =>
              prev.map((t) => (t.id === threadId ? { ...t, isStarred: !t.isStarred } : t))
            );
          } else if (action === "read") {
            setThreads((prev) =>
              prev.map((t) => (t.id === threadId ? { ...t, isUnread: true } : t))
            );
          } else if (action === "unread") {
            setThreads((prev) =>
              prev.map((t) => (t.id === threadId ? { ...t, isUnread: false } : t))
            );
          }
        }
      }).catch(() => {
        // Network failure — rollback optimistic update
        if (action === "star") {
          setThreads((prev) =>
            prev.map((t) => (t.id === threadId ? { ...t, isStarred: !t.isStarred } : t))
          );
        } else if (action === "read") {
          setThreads((prev) =>
            prev.map((t) => (t.id === threadId ? { ...t, isUnread: true } : t))
          );
        } else if (action === "unread") {
          setThreads((prev) =>
            prev.map((t) => (t.id === threadId ? { ...t, isUnread: false } : t))
          );
        }
      });
    },
    [setThreads]
  );

  const performBulkAction = React.useCallback(
    (threadIds: string[], action: string) => {
      if (threadIds.length === 0) return;

      if (action === "archive" || action === "trash") {
        const idSet = new Set(threadIds);
        let removedThreads: ThreadListItem[] = [];
        setThreads((prev) => {
          removedThreads = prev.filter((t) => idSet.has(t.id));
          return prev.filter((t) => !idSet.has(t.id));
        });

        // Commit the PREVIOUS pending undo action before replacing
        if (undoActionRef.current) {
          clearTimeout(undoActionRef.current.timer);
          const prev = undoActionRef.current;
          const prevIds = Array.isArray(prev.threadId) ? prev.threadId : [prev.threadId];
          for (const id of prevIds) {
            fetch(`/api/email/threads/${id}`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: prev.action, ...(connectionId ? { connection_id: connectionId } : {}) }),
            }).catch(() => {});
          }
        }

        // Single undo timer for the entire batch
        const timer = setTimeout(() => {
          for (const id of threadIds) {
            fetch(`/api/email/threads/${id}`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action, ...(connectionId ? { connection_id: connectionId } : {}) }),
            });
          }
          setUndoAction(null);
        }, 5000);

        const captured = removedThreads;
        setUndoAction({
          threadId: threadIds,
          action,
          timer,
          undo: () => {
            clearTimeout(timer);
            setThreads((prev) => [...captured, ...prev]);
            setUndoAction(null);
          },
        });
        return;
      }

      // Non-undoable bulk actions (star, read, etc.) — delegate individually
      for (const id of threadIds) {
        performAction(id, action);
      }
    },
    [setThreads, performAction]
  );

  return { performAction, performBulkAction, undoAction };
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
  // Use ref to avoid re-registering listeners when actions object changes
  const actionsRef = React.useRef(actions);
  actionsRef.current = actions;

  // Track g-chord state (vim-style two-key combos)
  const gPendingRef = React.useRef(false);
  const gTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    if (!enabled) return;

    function handleKey(e: KeyboardEvent) {
      const a = actionsRef.current;
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
          a.onCommandPalette?.();
          return;
        }
        if (e.key === "Enter" && a.onSendAndArchive) {
          e.preventDefault();
          a.onSendAndArchive();
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
          case "i": a.onGoInbox?.(); return;
          case "s": a.onGoStarred?.(); return;
          case "t": a.onGoSent?.(); return;
          case "d": a.onGoDrafts?.(); return;
          case "a": a.onGoAll?.(); return;
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
          a.onNext();
          break;
        case "k":
          e.preventDefault();
          a.onPrev();
          break;
        case "Enter":
          e.preventDefault();
          a.onOpen();
          break;
        case "Escape":
          e.preventDefault();
          a.onBack();
          break;
        case "e":
          e.preventDefault();
          a.onArchive();
          break;
        case "#":
          e.preventDefault();
          a.onTrash();
          break;
        case "r":
          e.preventDefault();
          a.onReply();
          break;
        case "a":
          e.preventDefault();
          a.onReplyAll();
          break;
        case "f":
          e.preventDefault();
          a.onForward();
          break;
        case "s":
          e.preventDefault();
          a.onStar();
          break;
        case "u":
          e.preventDefault();
          a.onMarkUnread();
          break;
        case "c":
          e.preventDefault();
          a.onCompose();
          break;
        case "/":
          e.preventDefault();
          a.onSearch();
          break;
        case "[":
          e.preventDefault();
          a.onArchivePrev();
          break;
        case "]":
          e.preventDefault();
          a.onArchiveNext();
          break;
        case "h":
          e.preventDefault();
          a.onSnooze();
          break;
        case "x":
          e.preventDefault();
          a.onToggleSelect?.();
          break;
        case "?":
          e.preventDefault();
          a.onShowHelp?.();
          break;
      }

      // Shift combos
      if (e.shiftKey && e.key === "A") {
        e.preventDefault();
        a.onSelectAll?.();
      }
    }

    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("keydown", handleKey);
      if (gTimerRef.current) clearTimeout(gTimerRef.current);
    };
  }, [enabled]);
}
