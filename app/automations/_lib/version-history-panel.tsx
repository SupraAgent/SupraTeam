"use client";

import * as React from "react";
import { Clock, RotateCcw, X } from "lucide-react";
import { timeAgo } from "@/lib/utils";

interface Revision {
  id: string;
  version: number;
  created_at: string;
  note: string | null;
  saved_by: string | null;
  nodes: unknown[];
  edges: unknown[];
}

interface VersionHistoryPanelProps {
  workflowId: string;
  currentNodeCount: number;
  currentEdgeCount: number;
  onRestore: (nodes: unknown[], edges: unknown[]) => void;
  onClose: () => void;
}

export function VersionHistoryPanel({
  workflowId,
  currentNodeCount,
  currentEdgeCount,
  onRestore,
  onClose,
}: VersionHistoryPanelProps) {
  const [revisions, setRevisions] = React.useState<Revision[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [restoring, setRestoring] = React.useState<string | null>(null);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  const fetchRevisions = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/loop/workflows/${workflowId}/revisions`);
      if (res.ok) {
        const data = await res.json();
        setRevisions(data.revisions ?? []);
      }
    } catch {
      /* ignore */
    }
    setLoading(false);
  }, [workflowId]);

  React.useEffect(() => {
    fetchRevisions();
  }, [fetchRevisions]);

  const handleRestore = React.useCallback(
    async (revision: Revision) => {
      if (!window.confirm(`Restore to version ${revision.version}? The current state will be saved as a revision first.`)) {
        return;
      }
      setRestoring(revision.id);
      try {
        const res = await fetch(`/api/loop/workflows/${workflowId}/revisions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ revision_id: revision.id }),
        });
        if (res.ok) {
          onRestore(revision.nodes, revision.edges);
          await fetchRevisions();
        }
      } catch {
        /* ignore */
      }
      setRestoring(null);
    },
    [workflowId, onRestore, fetchRevisions]
  );

  function diffSummary(rev: Revision): string {
    const nodeDiff = (rev.nodes?.length ?? 0) - currentNodeCount;
    const edgeDiff = (rev.edges?.length ?? 0) - currentEdgeCount;
    const parts: string[] = [];
    if (nodeDiff > 0) parts.push(`+${nodeDiff} nodes`);
    else if (nodeDiff < 0) parts.push(`${nodeDiff} nodes`);
    if (edgeDiff > 0) parts.push(`+${edgeDiff} edges`);
    else if (edgeDiff < 0) parts.push(`${edgeDiff} edges`);
    if (parts.length === 0) return `${rev.nodes?.length ?? 0} nodes, ${rev.edges?.length ?? 0} edges`;
    return parts.join(", ");
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />
      <div className="fixed right-0 top-0 bottom-0 w-96 z-50 bg-background border-l border-white/10 shadow-2xl overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-background border-b border-white/10 px-4 py-3 flex items-center justify-between z-10">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold text-foreground">Version History</h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchRevisions()}
              className="text-[10px] text-muted-foreground hover:text-foreground transition"
              title="Refresh"
            >
              &#x21bb;
            </button>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-xs">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Current state indicator */}
        <div className="px-4 py-3 border-b border-white/5">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-400" />
            <span className="text-xs font-medium text-foreground">Current</span>
            <span className="text-[10px] text-muted-foreground ml-auto">
              {currentNodeCount} nodes, {currentEdgeCount} edges
            </span>
          </div>
        </div>

        {/* Revisions list */}
        {loading ? (
          <div className="px-4 py-8 text-xs text-muted-foreground text-center animate-pulse">
            Loading revisions...
          </div>
        ) : revisions.length === 0 ? (
          <div className="px-4 py-8 text-xs text-muted-foreground text-center">
            No previous versions yet. Versions are saved automatically when you edit the workflow.
          </div>
        ) : (
          revisions.map((rev) => (
            <div
              key={rev.id}
              className={`border-b border-white/5 transition ${
                selectedId === rev.id ? "bg-white/5" : ""
              }`}
            >
              <button
                onClick={() => setSelectedId(selectedId === rev.id ? null : rev.id)}
                className="w-full text-left px-4 py-3 hover:bg-white/5 transition"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-foreground">v{rev.version}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {timeAgo(rev.created_at)}
                    </span>
                  </div>
                  <span className="text-[10px] text-muted-foreground/60">
                    {diffSummary(rev)}
                  </span>
                </div>
                {rev.note && (
                  <div className="text-[11px] text-muted-foreground mt-1 truncate">{rev.note}</div>
                )}
              </button>

              {/* Expanded detail + restore */}
              {selectedId === rev.id && (
                <div className="px-4 pb-3 flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground">
                    {rev.nodes?.length ?? 0} nodes, {rev.edges?.length ?? 0} edges
                  </span>
                  <span className="text-[10px] text-muted-foreground/50 ml-auto">
                    {new Date(rev.created_at).toLocaleString()}
                  </span>
                  <button
                    onClick={() => handleRestore(rev)}
                    disabled={restoring === rev.id}
                    className="flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded bg-primary/10 text-primary hover:bg-primary/20 transition disabled:opacity-50"
                  >
                    <RotateCcw className="w-3 h-3" />
                    {restoring === rev.id ? "Restoring..." : "Restore"}
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </>
  );
}
