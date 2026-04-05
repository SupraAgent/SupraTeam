"use client";

import * as React from "react";
import { cn, timeAgo } from "@/lib/utils";
import {
  ExternalLink, TrendingUp, TrendingDown, Minus, Clock, X,
  ChevronRight, StickyNote, Plus, Trophy, XCircle, AlarmClock, Send,
} from "lucide-react";
import { toast } from "sonner";

interface Deal {
  id: string;
  deal_name: string;
  board_type: string;
  stage: { name: string; color: string } | null;
  stage_id?: string | null;
  assigned_to: string | null;
  contact: { id: string; name: string } | null;
  value?: number | null;
  probability?: number | null;
  health_score?: number | null;
  ai_summary?: string | null;
  ai_sentiment?: { momentum?: string; overall_sentiment?: string } | null;
  awaiting_response_since?: string | null;
  updated_at?: string;
}

interface Stage {
  id: string;
  name: string;
  position: number;
  color: string;
}

interface DealContextSidebarProps {
  deals: Deal[];
  chatId: number;
  onClose: () => void;
  onDealUpdated?: () => void;
}

function DealActions({ deal, onDealUpdated }: { deal: Deal; onDealUpdated?: () => void }) {
  const [stages, setStages] = React.useState<Stage[]>([]);
  const [showStages, setShowStages] = React.useState(false);
  const [movingStage, setMovingStage] = React.useState(false);
  const [showNote, setShowNote] = React.useState(false);
  const [noteText, setNoteText] = React.useState("");
  const [sendingNote, setSendingNote] = React.useState(false);
  const [showTask, setShowTask] = React.useState(false);
  const [taskMsg, setTaskMsg] = React.useState("");
  const [taskDue, setTaskDue] = React.useState("");
  const [creatingTask, setCreatingTask] = React.useState(false);

  const [confirmOutcome, setConfirmOutcome] = React.useState<"won" | "lost" | null>(null);

  // Prefetch stages on mount for "next stage" button
  React.useEffect(() => {
    fetch(`/api/pipeline?board_type=${deal.board_type}`)
      .then((r) => r.json())
      .then((d) => setStages(d.stages ?? []))
      .catch(() => {});
  }, [deal.board_type]);

  const nextStage = React.useMemo(() => {
    if (!deal.stage_id || stages.length === 0) return null;
    const currentIdx = stages.findIndex((s) => s.id === deal.stage_id);
    if (currentIdx < 0 || currentIdx >= stages.length - 1) return null;
    return stages[currentIdx + 1];
  }, [stages, deal.stage_id]);

  async function handleStageMove(newStageId: string) {
    if (movingStage) return;
    setMovingStage(true);
    try {
      const res = await fetch(`/api/deals/${deal.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage_id: newStageId }),
      });
      if (res.ok) {
        const stage = stages.find((s) => s.id === newStageId);
        toast.success(`Moved to ${stage?.name ?? "new stage"}`);
        setShowStages(false);
        onDealUpdated?.();
      } else {
        toast.error("Failed to move stage");
      }
    } catch {
      toast.error("Network error");
    } finally {
      setMovingStage(false);
    }
  }

  async function handleAddNote() {
    if (!noteText.trim()) return;
    setSendingNote(true);
    try {
      const res = await fetch(`/api/deals/${deal.id}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: noteText }),
      });
      if (res.ok) {
        toast.success("Note added");
        setNoteText("");
        setShowNote(false);
      } else {
        toast.error("Failed to add note");
      }
    } finally {
      setSendingNote(false);
    }
  }

  async function handleCreateTask(e: React.FormEvent) {
    e.preventDefault();
    if (!taskMsg.trim()) return;
    setCreatingTask(true);
    try {
      const res = await fetch("/api/reminders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: taskMsg.trim(),
          deal_id: deal.id,
          due_at: taskDue ? new Date(taskDue).toISOString() : undefined,
        }),
      });
      if (res.ok) {
        toast.success("Task created");
        setTaskMsg("");
        setTaskDue("");
        setShowTask(false);
      } else {
        toast.error("Failed to create task");
      }
    } finally {
      setCreatingTask(false);
    }
  }

  async function handleOutcome(outcome: "won" | "lost") {
    if (confirmOutcome !== outcome) {
      setConfirmOutcome(outcome);
      return;
    }
    setConfirmOutcome(null);
    const res = await fetch(`/api/deals/${deal.id}/outcome`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ outcome }),
    });
    if (res.ok) {
      toast.success(`Deal marked as ${outcome}`);
      onDealUpdated?.();
    } else {
      toast.error("Failed to update outcome");
    }
  }

  return (
    <div className="space-y-1.5 pt-1">
      {/* Quick advance button */}
      {nextStage && (
        <button
          onClick={() => handleStageMove(nextStage.id)}
          disabled={movingStage}
          className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded bg-primary/10 text-primary text-[10px] font-medium hover:bg-primary/20 disabled:opacity-50 transition-colors"
        >
          <ChevronRight className="h-3 w-3" />
          {movingStage ? "Moving..." : `Advance to ${nextStage.name}`}
        </button>
      )}

      {/* Action buttons row */}
      <div className="flex items-center gap-1">
        <button
          onClick={() => { setShowStages(!showStages); setShowNote(false); setShowTask(false); }}
          className={cn(
            "flex-1 flex items-center justify-center gap-1 px-1.5 py-1 rounded text-[10px] font-medium transition-colors",
            showStages ? "bg-primary/20 text-primary" : "bg-white/[0.04] text-muted-foreground hover:bg-white/[0.08] hover:text-foreground"
          )}
          title="Move stage"
        >
          <ChevronRight className="h-2.5 w-2.5" />
          Stage
        </button>
        <button
          onClick={() => { setShowNote(!showNote); setShowStages(false); setShowTask(false); }}
          className={cn(
            "flex-1 flex items-center justify-center gap-1 px-1.5 py-1 rounded text-[10px] font-medium transition-colors",
            showNote ? "bg-primary/20 text-primary" : "bg-white/[0.04] text-muted-foreground hover:bg-white/[0.08] hover:text-foreground"
          )}
          title="Add note"
        >
          <StickyNote className="h-2.5 w-2.5" />
          Note
        </button>
        <button
          onClick={() => { setShowTask(!showTask); setShowStages(false); setShowNote(false); }}
          className={cn(
            "flex-1 flex items-center justify-center gap-1 px-1.5 py-1 rounded text-[10px] font-medium transition-colors",
            showTask ? "bg-primary/20 text-primary" : "bg-white/[0.04] text-muted-foreground hover:bg-white/[0.08] hover:text-foreground"
          )}
          title="Create task"
        >
          <AlarmClock className="h-2.5 w-2.5" />
          Task
        </button>
      </div>

      {/* Outcome buttons (double-click to confirm) */}
      <div className="flex items-center gap-1">
        <button
          onClick={() => handleOutcome("won")}
          onBlur={() => setConfirmOutcome(null)}
          className={cn(
            "flex-1 flex items-center justify-center gap-1 px-1.5 py-1 rounded text-[10px] font-medium transition-colors",
            confirmOutcome === "won"
              ? "bg-emerald-500/30 text-emerald-300 ring-1 ring-emerald-500/50"
              : "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
          )}
        >
          <Trophy className="h-2.5 w-2.5" />
          {confirmOutcome === "won" ? "Confirm Won?" : "Won"}
        </button>
        <button
          onClick={() => handleOutcome("lost")}
          onBlur={() => setConfirmOutcome(null)}
          className={cn(
            "flex-1 flex items-center justify-center gap-1 px-1.5 py-1 rounded text-[10px] font-medium transition-colors",
            confirmOutcome === "lost"
              ? "bg-red-500/30 text-red-300 ring-1 ring-red-500/50"
              : "bg-red-500/10 text-red-400 hover:bg-red-500/20"
          )}
        >
          <XCircle className="h-2.5 w-2.5" />
          {confirmOutcome === "lost" ? "Confirm Lost?" : "Lost"}
        </button>
      </div>

      {/* Stage picker */}
      {showStages && (
        <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-1.5 space-y-0.5">
          {stages.length === 0 ? (
            <p className="text-[10px] text-muted-foreground/50 text-center py-1">Loading...</p>
          ) : (
            stages.map((s) => (
              <button
                key={s.id}
                disabled={movingStage || s.id === deal.stage_id}
                onClick={() => handleStageMove(s.id)}
                className={cn(
                  "w-full flex items-center gap-1.5 px-2 py-1 rounded text-[10px] transition-colors",
                  s.id === deal.stage_id
                    ? "bg-white/[0.06] text-foreground font-medium"
                    : "text-muted-foreground hover:bg-white/[0.06] hover:text-foreground"
                )}
              >
                <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                {s.name}
                {s.id === deal.stage_id && <span className="ml-auto text-[9px] text-muted-foreground/50">current</span>}
              </button>
            ))
          )}
        </div>
      )}

      {/* Note form */}
      {showNote && (
        <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-1.5">
          <textarea
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            placeholder="Add a note..."
            className="w-full bg-transparent text-[11px] text-foreground placeholder:text-muted-foreground/40 resize-none outline-none min-h-[48px]"
            rows={2}
          />
          <div className="flex justify-end mt-1">
            <button
              disabled={sendingNote || !noteText.trim()}
              onClick={handleAddNote}
              className="flex items-center gap-1 px-2 py-0.5 rounded bg-primary/20 text-primary text-[10px] font-medium hover:bg-primary/30 disabled:opacity-50 transition-colors"
            >
              <Send className="h-2.5 w-2.5" />
              {sendingNote ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      )}

      {/* Task form */}
      {showTask && (
        <form onSubmit={handleCreateTask} className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-1.5 space-y-1">
          <input
            type="text"
            value={taskMsg}
            onChange={(e) => setTaskMsg(e.target.value)}
            placeholder="Task description..."
            className="w-full bg-transparent text-[11px] text-foreground placeholder:text-muted-foreground/40 outline-none px-1 py-0.5"
          />
          <input
            type="datetime-local"
            value={taskDue}
            onChange={(e) => setTaskDue(e.target.value)}
            className="w-full bg-transparent text-[10px] text-muted-foreground outline-none px-1 py-0.5"
          />
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={creatingTask || !taskMsg.trim()}
              className="flex items-center gap-1 px-2 py-0.5 rounded bg-primary/20 text-primary text-[10px] font-medium hover:bg-primary/30 disabled:opacity-50 transition-colors"
            >
              <Plus className="h-2.5 w-2.5" />
              {creatingTask ? "Creating..." : "Create"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

export function DealContextSidebar({ deals, onClose, onDealUpdated }: DealContextSidebarProps) {
  if (deals.length === 0) {
    return (
      <div className="w-[260px] shrink-0 border-l border-white/[0.06] bg-white/[0.01] flex flex-col">
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/[0.06]">
          <span className="text-xs font-medium text-muted-foreground">Deal Context</span>
          <button onClick={onClose} className="h-6 w-6 flex items-center justify-center rounded hover:bg-white/[0.06]">
            <X className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        </div>
        <div className="flex-1 flex items-center justify-center p-4">
          <p className="text-xs text-muted-foreground/50 text-center">No linked deals.<br />Create one from the pipeline.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-[260px] shrink-0 border-l border-white/[0.06] bg-white/[0.01] flex flex-col overflow-y-auto">
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/[0.06]">
        <span className="text-xs font-medium text-muted-foreground">
          {deals.length === 1 ? "Linked Deal" : `${deals.length} Linked Deals`}
        </span>
        <button onClick={onClose} className="h-6 w-6 flex items-center justify-center rounded hover:bg-white/[0.06]">
          <X className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </div>

      {deals.map((deal) => (
        <div key={deal.id} className="border-b border-white/[0.04] p-3 space-y-2">
          {/* Deal name + link */}
          <div className="flex items-center gap-2">
            <a
              href={`/pipeline?highlight=${deal.id}`}
              className="text-sm font-medium text-foreground hover:text-primary truncate flex-1"
            >
              {deal.deal_name}
            </a>
            <a
              href={`/pipeline?highlight=${deal.id}`}
              className="shrink-0 text-muted-foreground hover:text-primary"
            >
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>

          {/* Stage + Board */}
          <div className="flex items-center gap-2">
            {deal.stage && (
              <span
                className="text-[10px] flex items-center gap-1 font-medium"
                style={{ color: deal.stage.color }}
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: deal.stage.color }} />
                {deal.stage.name}
              </span>
            )}
            <span className={cn(
              "text-[10px] font-medium",
              deal.board_type === "BD" ? "text-blue-400" :
              deal.board_type === "Marketing" ? "text-purple-400" : "text-orange-400"
            )}>
              {deal.board_type}
            </span>
          </div>

          {/* Health score */}
          {deal.health_score != null && (
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground">Health</span>
              <span className={cn(
                "text-xs font-bold",
                deal.health_score >= 70 ? "text-green-400" :
                deal.health_score >= 40 ? "text-amber-400" : "text-red-400"
              )}>
                {deal.health_score}%
              </span>
            </div>
          )}

          {/* Value + Probability */}
          <div className="flex items-center gap-3">
            {deal.value != null && deal.value > 0 && (
              <span className="text-[10px] text-muted-foreground">
                ${Number(deal.value).toLocaleString()}
              </span>
            )}
            {deal.probability != null && deal.probability > 0 && (
              <span className="text-[10px] text-muted-foreground">
                {deal.probability}% prob
              </span>
            )}
          </div>

          {/* Sentiment momentum */}
          {deal.ai_sentiment?.momentum && (
            <div className="flex items-center gap-1.5">
              {deal.ai_sentiment.momentum === "accelerating" ? (
                <TrendingUp className="h-3 w-3 text-emerald-400" />
              ) : deal.ai_sentiment.momentum === "declining" || deal.ai_sentiment.momentum === "stalling" ? (
                <TrendingDown className="h-3 w-3 text-red-400" />
              ) : (
                <Minus className="h-3 w-3 text-muted-foreground/50" />
              )}
              <span className="text-[10px] text-muted-foreground capitalize">
                {deal.ai_sentiment.momentum}
              </span>
            </div>
          )}

          {/* Awaiting response */}
          {deal.awaiting_response_since && (
            <div className="flex items-center gap-1 text-[10px] text-amber-400">
              <Clock className="h-2.5 w-2.5" />
              Awaiting reply {timeAgo(deal.awaiting_response_since)}
            </div>
          )}

          {/* AI Summary */}
          {deal.ai_summary && (
            <div className="rounded-lg bg-purple-500/5 border border-purple-500/10 p-2">
              <p className="text-[10px] text-purple-400 font-medium mb-0.5">AI Summary</p>
              <p className="text-[10px] text-foreground/70 leading-relaxed line-clamp-3">
                {deal.ai_summary}
              </p>
            </div>
          )}

          {/* Contact */}
          {deal.contact && (
            <div className="text-[10px] text-muted-foreground">
              Contact: <span className="text-foreground/70">{deal.contact.name}</span>
            </div>
          )}

          {/* Inline actions */}
          <DealActions deal={deal} onDealUpdated={onDealUpdated} />
        </div>
      ))}
    </div>
  );
}
