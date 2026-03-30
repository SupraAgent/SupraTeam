"use client";

import * as React from "react";
import type { Node, Edge } from "@xyflow/react";

interface NlWorkflowDialogProps {
  open: boolean;
  onClose: () => void;
  onApply: (nodes: Node[], edges: Edge[]) => void;
}

const EXAMPLES = [
  "When a deal moves to Follow Up, send a Telegram message to the linked group",
  "When a new deal is created on the BD board, create a follow-up task in 3 days",
  "When a contact is created, add them to the outreach sequence",
  "When a deal is won, send a Telegram celebration message and update the deal tag to 'closed-won'",
  "Every Monday at 9am, send a Slack summary of stale deals",
  "When a deal value exceeds $50k, assign it to the BD lead and send an email notification",
];

export function NlWorkflowDialog({ open, onClose, onApply }: NlWorkflowDialogProps) {
  const [description, setDescription] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<{ nodes: Node[]; edges: Edge[] } | null>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  // Focus textarea when dialog opens
  React.useEffect(() => {
    if (open) {
      setDescription("");
      setError(null);
      setResult(null);
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  }, [open]);

  const handleGenerate = async () => {
    if (!description.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/loop/workflows/from-nl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: description.trim() }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Request failed" }));
        setError(data.error || "Generation failed");
        return;
      }

      const data = await res.json();
      setResult({ nodes: data.nodes, edges: data.edges });
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  };

  const handleApply = () => {
    if (!result) return;
    onApply(result.nodes, result.edges);
    onClose();
  };

  const handleChipClick = (example: string) => {
    setDescription(example);
    setResult(null);
    setError(null);
  };

  if (!open) return null;

  // Count node types in result
  const triggerCount = result?.nodes.filter((n) => n.type === "crmTriggerNode").length ?? 0;
  const actionCount = result?.nodes.filter((n) => n.type === "crmActionNode").length ?? 0;
  const conditionCount = result?.nodes.filter((n) => n.type === "crmConditionNode").length ?? 0;
  const delayCount = result?.nodes.filter((n) => n.type === "delayNode").length ?? 0;

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          className="pointer-events-auto w-full max-w-lg rounded-xl border border-white/10 bg-background shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <div className="flex items-center gap-2">
              <svg
                className="w-4 h-4 text-primary"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456Z"
                />
              </svg>
              <span className="text-sm font-semibold text-foreground">
                AI Workflow Generator
              </span>
            </div>
            <button
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground text-xs transition"
            >
              &#x2715;
            </button>
          </div>

          {/* Body */}
          <div className="p-4 space-y-3">
            <p className="text-[11px] text-muted-foreground">
              Describe your workflow in plain English and AI will generate the
              node graph for you.
            </p>

            <textarea
              ref={textareaRef}
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                setResult(null);
                setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  handleGenerate();
                }
              }}
              placeholder="e.g. When a deal moves to Follow Up, send a Telegram message..."
              className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none resize-y min-h-[80px] max-h-[200px]"
              rows={3}
            />

            {/* Example chips */}
            <div className="flex flex-wrap gap-1.5">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  onClick={() => handleChipClick(ex)}
                  className="text-[10px] text-muted-foreground bg-white/5 border border-white/10 rounded-full px-2.5 py-1 hover:bg-white/10 hover:text-foreground transition truncate max-w-[280px]"
                >
                  {ex}
                </button>
              ))}
            </div>

            {/* Error */}
            {error && (
              <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2">
                {error}
              </div>
            )}

            {/* Result preview */}
            {result && (
              <div className="rounded-md border border-emerald-500/20 bg-emerald-500/5 px-3 py-2.5">
                <div className="text-xs font-medium text-emerald-400 mb-1">
                  Generated {result.nodes.length} nodes, {result.edges.length} edges
                </div>
                <div className="flex flex-wrap gap-2 text-[10px] text-muted-foreground">
                  {triggerCount > 0 && (
                    <span className="bg-violet-500/10 border border-violet-500/20 rounded px-1.5 py-0.5">
                      {triggerCount} trigger{triggerCount > 1 ? "s" : ""}
                    </span>
                  )}
                  {actionCount > 0 && (
                    <span className="bg-blue-500/10 border border-blue-500/20 rounded px-1.5 py-0.5">
                      {actionCount} action{actionCount > 1 ? "s" : ""}
                    </span>
                  )}
                  {conditionCount > 0 && (
                    <span className="bg-yellow-500/10 border border-yellow-500/20 rounded px-1.5 py-0.5">
                      {conditionCount} condition{conditionCount > 1 ? "s" : ""}
                    </span>
                  )}
                  {delayCount > 0 && (
                    <span className="bg-orange-500/10 border border-orange-500/20 rounded px-1.5 py-0.5">
                      {delayCount} delay{delayCount > 1 ? "s" : ""}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-white/10 px-4 py-3">
            <span className="text-[10px] text-muted-foreground">
              {result ? "Review and apply to canvas" : "Cmd+Enter to generate"}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={onClose}
                className="text-xs px-3 py-1.5 text-muted-foreground hover:text-foreground transition"
              >
                Cancel
              </button>
              {result ? (
                <button
                  onClick={handleApply}
                  className="text-xs px-3 py-1.5 rounded-md bg-emerald-600 text-white hover:bg-emerald-500 transition"
                >
                  Apply to Canvas
                </button>
              ) : (
                <button
                  onClick={handleGenerate}
                  disabled={loading || !description.trim()}
                  className="text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition disabled:opacity-50 flex items-center gap-1.5"
                >
                  {loading ? (
                    <>
                      <svg
                        className="w-3 h-3 animate-spin"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                        />
                      </svg>
                      Generating...
                    </>
                  ) : (
                    "Generate"
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
