"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  Play,
  Pause,
  ChevronDown,
  ChevronUp,
  Send,
  Clock,
  Users,
  MessageCircle,
  ArrowRight,
  GitBranch,
  Timer,
  Copy,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { timeAgo } from "@/lib/utils";
import { toast } from "sonner";
import type { Sequence, Step } from "./types";

interface SequenceListProps {
  sequences: Sequence[];
  onStatusChange: (id: string, status: string) => void;
  onDelete: (id: string) => void;
  onClone: (id: string) => void;
}

export function SequenceList({ sequences, onStatusChange, onDelete, onClone }: SequenceListProps) {
  const [expanded, setExpanded] = React.useState<string | null>(null);
  const [steps, setSteps] = React.useState<Step[]>([]);
  const [stepsLoading, setStepsLoading] = React.useState(false);

  const statusColors: Record<string, { bg: string; text: string }> = {
    draft: { bg: "bg-white/10", text: "text-muted-foreground" },
    active: { bg: "bg-emerald-500/10", text: "text-emerald-400" },
    paused: { bg: "bg-yellow-500/10", text: "text-yellow-400" },
    completed: { bg: "bg-blue-500/10", text: "text-blue-400" },
  };

  async function fetchSteps(sequenceId: string) {
    if (expanded === sequenceId) {
      setExpanded(null);
      return;
    }
    setExpanded(sequenceId);
    setStepsLoading(true);
    try {
      const res = await fetch(`/api/outreach/steps?sequence_id=${sequenceId}`);
      if (res.ok) {
        const data = await res.json();
        setSteps(data.steps ?? []);
      }
    } finally {
      setStepsLoading(false);
    }
  }

  async function handleClone(id: string) {
    const res = await fetch("/api/outreach/sequences/clone", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sequence_id: id }),
    });
    if (res.ok) {
      toast.success("Sequence cloned");
      onClone(id);
    } else {
      const data = await res.json();
      toast.error(data.error ?? "Clone failed");
    }
  }

  return (
    <div className="space-y-2">
      {sequences.map((seq) => {
        const sc = statusColors[seq.status] ?? statusColors.draft;
        const isExpanded = expanded === seq.id;
        const stats = seq.enrollment_stats;

        return (
          <div
            key={seq.id}
            className={cn(
              "rounded-xl border bg-white/[0.035] transition-colors",
              seq.status === "active" ? "border-emerald-500/20" : "border-white/10"
            )}
          >
            <div className="flex items-center gap-3 px-4 py-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-foreground">{seq.name}</p>
                  <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium capitalize", sc.bg, sc.text)}>
                    {seq.status}
                  </span>
                  {seq.board_type && (
                    <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      {seq.board_type}
                    </span>
                  )}
                  {seq.tone && seq.tone !== "professional" && (
                    <span className={cn(
                      "rounded px-1.5 py-0.5 text-[10px]",
                      seq.tone === "casual" ? "bg-blue-500/10 text-blue-400" :
                      seq.tone === "web3_native" ? "bg-purple-500/10 text-purple-400" :
                      seq.tone === "formal" ? "bg-slate-500/10 text-slate-400" :
                      "bg-white/5 text-muted-foreground"
                    )}>
                      {seq.tone === "web3_native" ? "Web3" : seq.tone}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 text-[10px] text-muted-foreground mt-0.5">
                  <span className="flex items-center gap-1">
                    <MessageCircle className="h-3 w-3" />
                    {seq.step_count} steps
                  </span>
                  <span className="flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    {stats.total} enrolled
                  </span>
                  {stats.active > 0 && (
                    <span className="text-emerald-400">{stats.active} active</span>
                  )}
                  {stats.completed > 0 && (
                    <span className="text-blue-400">{stats.completed} completed</span>
                  )}
                  {stats.replied > 0 && (
                    <span className="text-purple-400">{stats.replied} replied</span>
                  )}
                  <span>Created {timeAgo(seq.created_at)}</span>
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                {seq.status === "draft" || seq.status === "paused" ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs text-emerald-400"
                    onClick={() => onStatusChange(seq.id, "active")}
                  >
                    <Play className="mr-1 h-3 w-3" />
                    Activate
                  </Button>
                ) : seq.status === "active" ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs text-yellow-400"
                    onClick={() => onStatusChange(seq.id, "paused")}
                  >
                    <Pause className="mr-1 h-3 w-3" />
                    Pause
                  </Button>
                ) : null}

                <button
                  onClick={() => fetchSteps(seq.id)}
                  className="text-muted-foreground hover:text-foreground p-1"
                >
                  {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>

                <button
                  onClick={() => handleClone(seq.id)}
                  className="text-muted-foreground hover:text-primary p-1"
                  title="Duplicate sequence"
                >
                  <Copy className="h-4 w-4" />
                </button>

                <button
                  onClick={() => onDelete(seq.id)}
                  className="text-muted-foreground hover:text-red-400 p-1"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Expanded: steps timeline */}
            {isExpanded && (
              <div className="border-t border-white/5 px-4 py-3">
                {stepsLoading ? (
                  <div className="h-20 rounded-lg bg-white/[0.02] animate-pulse" />
                ) : steps.length === 0 ? (
                  <p className="text-xs text-muted-foreground/50">No steps configured.</p>
                ) : (
                  <div className="space-y-0">
                    {steps.map((step, i) => (
                      <div key={step.id} className="flex items-start gap-3">
                        {/* Timeline line */}
                        <div className="flex flex-col items-center shrink-0">
                          <div className={cn(
                            "flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold",
                            step.step_type === "condition" ? "bg-yellow-500/20 text-yellow-400" :
                            step.step_type === "wait" ? "bg-white/10 text-muted-foreground" :
                            "bg-primary/20 text-primary"
                          )}>
                            {step.step_number}
                          </div>
                          {i < steps.length - 1 && (
                            <div className="w-px h-8 bg-white/10 my-1" />
                          )}
                        </div>
                        <div className="flex-1 pb-3">
                          <div className="flex items-center gap-2 mb-1">
                            {step.step_number > 1 && step.delay_hours > 0 && (
                              <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                <Clock className="h-3 w-3" />
                                Wait {step.delay_hours}h
                                <ArrowRight className="h-3 w-3" />
                              </span>
                            )}
                            {step.step_type === "message" && (
                              <span className="flex items-center gap-1 text-[10px] text-primary">
                                <Send className="h-3 w-3" />
                                Send message
                              </span>
                            )}
                            {step.step_type === "condition" && (
                              <span className="flex items-center gap-1 text-[10px] text-yellow-400">
                                <GitBranch className="h-3 w-3" />
                                {step.condition_type === "reply_received" ? "If reply received"
                                  : step.condition_type === "no_reply_timeout" ? "If no reply (timeout)"
                                  : step.condition_type === "engagement_score" ? `If engagement \u2265 ${step.condition_config?.threshold ?? 50}`
                                  : step.condition_type === "deal_stage" ? "If deal in target stage"
                                  : step.condition_type === "message_keyword" ? `If message contains: ${((step.condition_config?.keywords as string[]) ?? []).join(", ")}`
                                  : step.condition_type === "days_since_enroll" ? `If ${step.condition_config?.days ?? 7}+ days since enrollment`
                                  : step.condition_type === "ab_split" ? `A/B Split (${step.split_percentage ?? 50}% / ${100 - (step.split_percentage ?? 50)}%)`
                                  : step.condition_type}
                              </span>
                            )}
                            {step.step_type === "wait" && (
                              <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                <Timer className="h-3 w-3" />
                                Wait step
                              </span>
                            )}
                          </div>

                          {step.step_type === "message" && (
                            <pre className="rounded-lg bg-white/[0.03] border border-white/5 p-2 text-[10px] font-mono text-muted-foreground whitespace-pre-wrap">
                              {step.message_template}
                            </pre>
                          )}

                          {step.step_type === "condition" && (
                            <div className="rounded-lg bg-yellow-500/5 border border-yellow-500/10 p-2 space-y-1">
                              <div className="flex items-center gap-1.5 text-[10px]">
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                                <span className="text-emerald-400">YES &rarr;</span>
                                <span className="text-muted-foreground">
                                  {step.on_true_step ? `Go to step ${step.on_true_step}` : "End sequence"}
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5 text-[10px]">
                                <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
                                <span className="text-red-400">NO &rarr;</span>
                                <span className="text-muted-foreground">
                                  {step.on_false_step ? `Go to step ${step.on_false_step}` : "End sequence"}
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {sequences.length === 0 && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-8 text-center">
          <Send className="mx-auto h-8 w-8 text-muted-foreground/30" />
          <p className="mt-2 text-sm text-muted-foreground">
            No outreach sequences. Create one to automate multi-step Telegram campaigns.
          </p>
        </div>
      )}
    </div>
  );
}
