"use client";

import * as React from "react";

// ---------------------------------------------------------------------------
// Module-level cache: threadId -> draft text
// Persists across re-renders / re-mounts within the same session.
// ---------------------------------------------------------------------------
const draftCache = new Map<string, string>();

// ---------------------------------------------------------------------------
// Hook: useAutoDraft
// ---------------------------------------------------------------------------
export function useAutoDraft(threadId: string | null) {
  const [draft, setDraft] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Track the latest threadId so stale responses are discarded.
  const activeThreadRef = React.useRef<string | null>(null);
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchDraft = React.useCallback(
    async (tid: string, skipCache = false) => {
      // Return cached result if available and not forcing refresh
      if (!skipCache && draftCache.has(tid)) {
        setDraft(draftCache.get(tid)!);
        setLoading(false);
        setError(null);
        return;
      }

      setLoading(true);
      setError(null);
      setDraft(null);

      try {
        const res = await fetch("/api/email/ai", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "draft", threadId: tid }),
        });

        // Guard against stale responses (user switched threads)
        if (activeThreadRef.current !== tid) return;

        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error ?? `Request failed (${res.status})`);
        }

        const body = await res.json();
        const text: string = body.data?.draft ?? body.draft ?? "";

        if (!text) {
          throw new Error("Empty draft returned");
        }

        draftCache.set(tid, text);
        setDraft(text);
      } catch (err: unknown) {
        if (activeThreadRef.current !== tid) return;
        setError(err instanceof Error ? err.message : "Failed to generate draft");
      } finally {
        if (activeThreadRef.current === tid) {
          setLoading(false);
        }
      }
    },
    [],
  );

  // When threadId changes, debounce the fetch by 500ms.
  React.useEffect(() => {
    // Clear previous debounce
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }

    activeThreadRef.current = threadId;

    if (!threadId) {
      setDraft(null);
      setLoading(false);
      setError(null);
      return;
    }

    // If cached, show immediately (no debounce needed)
    if (draftCache.has(threadId)) {
      setDraft(draftCache.get(threadId)!);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);

    debounceRef.current = setTimeout(() => {
      fetchDraft(threadId);
    }, 500);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [threadId, fetchDraft]);

  const refresh = React.useCallback(() => {
    if (!threadId) return;
    fetchDraft(threadId, true);
  }, [threadId, fetchDraft]);

  return { draft, loading, error, refresh };
}

// ---------------------------------------------------------------------------
// Component: AutoDraftBanner
// ---------------------------------------------------------------------------
type AutoDraftBannerProps = {
  threadId: string | null;
  onUseDraft: (text: string) => void;
};

export function AutoDraftBanner({ threadId, onUseDraft }: AutoDraftBannerProps) {
  const { draft, loading, error, refresh } = useAutoDraft(threadId);
  const [dismissed, setDismissed] = React.useState(false);

  // Reset dismissed state when thread changes
  React.useEffect(() => {
    setDismissed(false);
  }, [threadId]);

  // Nothing to show
  if (dismissed || (!loading && !draft && !error)) return null;

  // Error state -- silent, just offer retry
  if (error) {
    return (
      <div className="border-t border-white/10 bg-primary/5 px-4 py-2 flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          Draft generation failed
        </span>
        <div className="flex items-center gap-3">
          <button
            onClick={refresh}
            className="text-primary text-xs hover:underline"
          >
            Retry
          </button>
          <button
            onClick={() => setDismissed(true)}
            className="text-muted-foreground text-xs hover:underline"
          >
            Dismiss
          </button>
        </div>
      </div>
    );
  }

  // Loading state
  if (loading) {
    return (
      <div className="border-t border-white/10 bg-primary/5 px-4 py-2 flex items-center gap-2">
        {/* Pulsing dot */}
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
        </span>
        <span className="text-xs text-muted-foreground">
          AI is drafting a reply...
        </span>
      </div>
    );
  }

  // Draft ready
  if (!draft) return null;

  const preview =
    draft.length > 80 ? draft.slice(0, 80).trimEnd() + "\u2026" : draft;

  return (
    <div className="border-t border-white/10 bg-primary/5 px-4 py-2 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 min-w-0">
        {/* Sparkle icon */}
        <svg
          className="shrink-0 h-3.5 w-3.5 text-primary"
          viewBox="0 0 16 16"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M8 0l1.5 5.5L16 8l-6.5 2.5L8 16l-1.5-5.5L0 8l6.5-2.5z" />
        </svg>
        <span className="text-xs text-foreground/70 truncate">{preview}</span>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <button
          onClick={() => onUseDraft(draft)}
          className="text-primary text-xs font-medium hover:underline"
        >
          Use this draft
        </button>
        <button
          onClick={refresh}
          className="text-muted-foreground text-xs hover:underline"
        >
          Regenerate
        </button>
        <button
          onClick={() => setDismissed(true)}
          className="text-muted-foreground text-xs hover:underline"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
