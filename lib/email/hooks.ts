"use client";

import * as React from "react";
import type { Thread, ThreadList, ThreadListItem, Label, EmailConnection } from "./types";

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

// ── Threads (inbox) ─────────────────────────────────────────

export function useThreads(options?: {
  labelIds?: string[];
  query?: string;
  maxResults?: number;
}) {
  const [threads, setThreads] = React.useState<ThreadListItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [nextPageToken, setNextPageToken] = React.useState<string>();
  const [error, setError] = React.useState<string>();

  const fetchThreads = React.useCallback(async (pageToken?: string) => {
    setLoading(true);
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
        setThreads((prev) => [...prev, ...data.threads]);
      } else {
        setThreads(data.threads);
      }
      setNextPageToken(data.nextPageToken);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, [options?.labelIds?.join(","), options?.query, options?.maxResults]);

  React.useEffect(() => { fetchThreads(); }, [fetchThreads]);

  const loadMore = React.useCallback(() => {
    if (nextPageToken) fetchThreads(nextPageToken);
  }, [nextPageToken, fetchThreads]);

  const refresh = React.useCallback(() => fetchThreads(), [fetchThreads]);

  return { threads, loading, error, nextPageToken, loadMore, refresh, setThreads };
}

// ── Single thread ───────────────────────────────────────────

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
    setLoading(true);
    setError(undefined);
    fetch(`/api/email/threads/${threadId}`)
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to load thread (${r.status})`);
        return r.json();
      })
      .then((json) => setThread(json.data ?? null))
      .catch((err) => {
        setThread(null);
        setError(err instanceof Error ? err.message : "Failed to load thread");
      })
      .finally(() => setLoading(false));
  }, [threadId]);

  return { thread, loading, error, setThread };
}

// ── Labels ──────────────────────────────────────────────────

export function useLabels() {
  const [labels, setLabels] = React.useState<Label[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string>();

  React.useEffect(() => {
    fetch("/api/email/labels")
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to load labels (${r.status})`);
        return r.json();
      })
      .then((json) => setLabels(json.data ?? []))
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load labels");
      })
      .finally(() => setLoading(false));
  }, []);

  return { labels, loading, error };
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
