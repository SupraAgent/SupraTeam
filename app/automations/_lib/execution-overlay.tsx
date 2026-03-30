"use client";

import React from "react";

// ── Types ──────────────────────────────────────────────────

export interface NodeExecutionStatus {
  nodeId: string;
  status: "pending" | "running" | "completed" | "failed" | "skipped";
  durationMs: number | null;
  error: string | null;
}

interface ExecutionOverlayContextValue {
  /** Map of nodeId → execution status */
  statuses: Map<string, NodeExecutionStatus>;
  /** Whether a run is currently in progress */
  isLive: boolean;
  /** The run ID being displayed */
  activeRunId: string | null;
}

const ExecutionOverlayContext = React.createContext<ExecutionOverlayContextValue>({
  statuses: new Map(),
  isLive: false,
  activeRunId: null,
});

// ── Provider ───────────────────────────────────────────────

interface ExecutionOverlayProviderProps {
  workflowId: string | null;
  /** When a run starts, set this to the run ID to enable live polling */
  liveRunId: string | null;
  /** Replay mode: show results for a completed run without polling */
  replayRunId: string | null;
  children: React.ReactNode;
}

export function ExecutionOverlayProvider({
  workflowId,
  liveRunId,
  replayRunId,
  children,
}: ExecutionOverlayProviderProps) {
  const [statuses, setStatuses] = React.useState<Map<string, NodeExecutionStatus>>(new Map());
  const activeRunId = liveRunId || replayRunId;
  const isLive = !!liveRunId;

  // Poll for live execution updates
  React.useEffect(() => {
    if (!activeRunId) {
      setStatuses(new Map());
      return;
    }

    let cancelled = false;

    async function fetchNodeStatuses() {
      try {
        const res = await fetch(`/api/loop/runs/nodes?run_id=${activeRunId}`);
        if (!res.ok || cancelled) return;
        const data = await res.json();
        const nodes: Array<{
          node_id: string;
          status: string;
          duration_ms: number | null;
          error_message: string | null;
        }> = data.nodes ?? [];

        const map = new Map<string, NodeExecutionStatus>();
        for (const n of nodes) {
          map.set(n.node_id, {
            nodeId: n.node_id,
            status: n.status as NodeExecutionStatus["status"],
            durationMs: n.duration_ms,
            error: n.error_message,
          });
        }
        if (!cancelled) setStatuses(map);
      } catch {
        // Silently ignore — will retry on next poll
      }
    }

    // Fetch immediately
    fetchNodeStatuses();

    // Poll every 1.5s for live runs only
    let interval: ReturnType<typeof setInterval> | undefined;
    if (isLive) {
      interval = setInterval(fetchNodeStatuses, 1500);
    }

    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
    };
  }, [activeRunId, isLive]);


  const value = React.useMemo(
    () => ({ statuses, isLive, activeRunId }),
    [statuses, isLive, activeRunId]
  );

  return (
    <ExecutionOverlayContext.Provider value={value}>
      {children}
    </ExecutionOverlayContext.Provider>
  );
}

// ── Hook ───────────────────────────────────────────────────

export function useExecutionOverlay() {
  return React.useContext(ExecutionOverlayContext);
}

/**
 * Get the execution status for a specific node.
 * Returns null if no execution data is available.
 */
export function useNodeExecutionStatus(nodeId: string): NodeExecutionStatus | null {
  const { statuses } = React.useContext(ExecutionOverlayContext);
  return statuses.get(nodeId) ?? null;
}

// ── Visual Overlay Component ───────────────────────────────

const STATUS_STYLES: Record<string, { ring: string; glow: string; badge: string }> = {
  running: {
    ring: "ring-2 ring-blue-400/60 animate-pulse",
    glow: "shadow-[0_0_12px_rgba(96,165,250,0.3)]",
    badge: "bg-blue-500/20 text-blue-400",
  },
  completed: {
    ring: "ring-2 ring-emerald-400/50",
    glow: "shadow-[0_0_8px_rgba(52,211,153,0.2)]",
    badge: "bg-emerald-500/20 text-emerald-400",
  },
  failed: {
    ring: "ring-2 ring-red-400/60",
    glow: "shadow-[0_0_10px_rgba(248,113,113,0.3)]",
    badge: "bg-red-500/20 text-red-400",
  },
  skipped: {
    ring: "ring-1 ring-white/10",
    glow: "",
    badge: "bg-white/5 text-muted-foreground",
  },
  pending: {
    ring: "ring-1 ring-white/5",
    glow: "",
    badge: "bg-white/5 text-muted-foreground",
  },
};

function ErrorTooltip({ error }: { error: string }) {
  const [expanded, setExpanded] = React.useState(false);
  return (
    <div className="absolute -bottom-1 left-0 right-0 translate-y-full z-20 px-2">
      <button
        type="button"
        onClick={() => setExpanded((p) => !p)}
        className={`rounded bg-red-500/10 border border-red-500/20 px-2 py-1 text-[9px] text-red-400 text-left w-full ${expanded ? "whitespace-pre-wrap break-words max-w-[300px]" : "max-w-[200px] truncate"}`}
      >
        {error}
      </button>
    </div>
  );
}

/**
 * Wraps a CRM node to show execution status overlay.
 * Use this in each node component to add visual feedback.
 */
export function NodeExecutionOverlay({
  nodeId,
  children,
}: {
  nodeId: string;
  children: React.ReactNode;
}) {
  const status = useNodeExecutionStatus(nodeId);
  const { isLive, activeRunId } = useExecutionOverlay();

  // Don't render overlay if no execution context
  if (!activeRunId || !status) return <>{children}</>;

  const styles = STATUS_STYLES[status.status] ?? STATUS_STYLES.pending;

  return (
    <div className={`relative rounded-xl ${styles.ring} ${styles.glow} transition-all duration-300`}>
      {children}

      {/* Status badge */}
      <div className={`absolute -top-2.5 -right-2.5 flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-medium ${styles.badge}`}>
        {status.status === "running" && isLive && (
          <svg className="w-2.5 h-2.5 animate-spin" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" strokeDasharray="28" strokeDashoffset="8" />
          </svg>
        )}
        {status.status === "completed" && "✓"}
        {status.status === "failed" && "✗"}
        {status.status === "skipped" && "—"}
        {status.durationMs != null && status.status !== "running" && (
          <span>{status.durationMs < 1000 ? `${status.durationMs}ms` : `${(status.durationMs / 1000).toFixed(1)}s`}</span>
        )}
        {status.status === "running" && <span>running</span>}
      </div>

      {/* Error tooltip — click to expand */}
      {status.error && status.status === "failed" && (
        <ErrorTooltip error={status.error} />
      )}
    </div>
  );
}
