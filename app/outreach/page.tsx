"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Plus, BarChart3, Wand2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { Sequence, SequenceAnalytics, OutreachAlert, NewStep } from "@/components/outreach/types";
import { OutreachAlerts } from "@/components/outreach/OutreachAlerts";
import { AIGeneratePanel } from "@/components/outreach/AIGeneratePanel";
import { OutreachAnalytics } from "@/components/outreach/OutreachAnalytics";
import { SequenceCreateForm } from "@/components/outreach/SequenceCreateForm";
import { SequenceList } from "@/components/outreach/SequenceList";

export default function OutreachPage() {
  const [sequences, setSequences] = React.useState<Sequence[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [showCreate, setShowCreate] = React.useState(false);
  const [showAnalytics, setShowAnalytics] = React.useState(false);
  const [analyticsData, setAnalyticsData] = React.useState<SequenceAnalytics[] | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = React.useState(false);
  const [showAIGenerate, setShowAIGenerate] = React.useState(false);
  const [alerts, setAlerts] = React.useState<OutreachAlert[]>([]);
  const [pipelineStages, setPipelineStages] = React.useState<Array<{ id: string; name: string }>>([]);

  // AI-generated sequence data to pass to create form
  const [aiGeneratedSteps, setAiGeneratedSteps] = React.useState<NewStep[] | undefined>();
  const [aiGeneratedName, setAiGeneratedName] = React.useState("");
  const [aiGeneratedBoard, setAiGeneratedBoard] = React.useState("");
  const [aiGeneratedTone, setAiGeneratedTone] = React.useState("professional");

  // Aggregate stats
  const totals = React.useMemo(() => {
    return sequences.reduce((acc, s) => {
      acc.total += s.enrollment_stats.total;
      acc.active += s.enrollment_stats.active;
      acc.completed += s.enrollment_stats.completed;
      acc.replied += s.enrollment_stats.replied;
      return acc;
    }, { total: 0, active: 0, completed: 0, replied: 0 });
  }, [sequences]);

  const replyRate = totals.total > 0 ? Math.round((totals.replied / totals.total) * 100) : 0;
  const completionRate = totals.total > 0 ? Math.round((totals.completed / totals.total) * 100) : 0;
  const activeSeqs = sequences.filter((s) => s.status === "active").length;

  React.useEffect(() => {
    fetchSequences();
    fetchAlerts();
    fetch("/api/pipeline").then((r) => r.json()).then((d) => setPipelineStages(d.stages ?? [])).catch(() => {});
  }, []);

  async function fetchSequences() {
    try {
      const res = await fetch("/api/outreach/sequences");
      if (res.ok) {
        const data = await res.json();
        setSequences(data.sequences ?? []);
      }
    } finally {
      setLoading(false);
    }
  }

  async function fetchAlerts() {
    try {
      const res = await fetch("/api/outreach/alerts");
      if (res.ok) {
        const data = await res.json();
        setAlerts(data.alerts ?? []);
      }
    } catch { /* ignore */ }
  }

  async function dismissAlert(id: string) {
    const res = await fetch("/api/outreach/alerts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (res.ok) {
      setAlerts((prev) => prev.filter((a) => a.id !== id));
    } else {
      toast.error("Failed to dismiss alert");
    }
  }

  async function fetchAnalytics() {
    setAnalyticsLoading(true);
    try {
      const res = await fetch("/api/outreach/analytics");
      if (res.ok) {
        const data = await res.json();
        setAnalyticsData(data.sequences ?? []);
      }
    } finally {
      setAnalyticsLoading(false);
    }
  }

  async function updateStatus(id: string, status: string) {
    const res = await fetch("/api/outreach/sequences", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    if (res.ok) {
      setSequences((prev) => prev.map((s) => (s.id === id ? { ...s, status } : s)));
      toast.success(`Sequence ${status}`);
    } else {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error ?? "Failed to update sequence");
    }
  }

  async function deleteSequence(id: string) {
    const res = await fetch("/api/outreach/sequences", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (res.ok) {
      setSequences((prev) => prev.filter((s) => s.id !== id));
      toast.success("Sequence deleted");
    } else {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error ?? "Failed to delete sequence");
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 rounded-lg bg-white/5 animate-pulse" />
        <div className="h-40 rounded-xl bg-white/[0.02] animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Outreach Sequences</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Multi-step automated messaging campaigns for Telegram outreach.
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setShowAnalytics(!showAnalytics);
              if (!showAnalytics && !analyticsData) fetchAnalytics();
            }}
          >
            <BarChart3 className="mr-1 h-3.5 w-3.5" />
            {showAnalytics ? "Sequences" : "Analytics"}
          </Button>
          {!showAnalytics && (
            <>
              <Button
                size="sm"
                variant="ghost"
                className="text-purple-400 hover:text-purple-300"
                onClick={() => setShowAIGenerate(!showAIGenerate)}
              >
                <Wand2 className="mr-1 h-3.5 w-3.5" />
                AI Generate
              </Button>
              <Button size="sm" onClick={() => setShowCreate(!showCreate)}>
                <Plus className="mr-1 h-3.5 w-3.5" />
                New Sequence
              </Button>
            </>
          )}
        </div>
      </div>

      <OutreachAlerts alerts={alerts} onDismiss={dismissAlert} />

      {showAIGenerate && (
        <AIGeneratePanel
          onClose={() => setShowAIGenerate(false)}
          onGenerated={(data) => {
            setAiGeneratedName(data.name);
            setAiGeneratedBoard(data.board);
            setAiGeneratedTone(data.tone);
            setAiGeneratedSteps(data.steps.map((s: Partial<NewStep>) => ({
              message_template: s.message_template ?? "",
              variant_b_template: s.variant_b_template ?? "",
              variant_c_template: s.variant_c_template ?? "",
              ab_split_pct: s.ab_split_pct ?? 100,
              variant_b_delay_hours: s.variant_b_delay_hours ?? null,
              delay_hours: s.delay_hours ?? 24,
              step_type: s.step_type ?? "message",
              step_label: s.step_label ?? "",
              condition_type: s.condition_type ?? "none",
              condition_config: s.condition_config ?? {},
              on_true_step: s.on_true_step ?? null,
              on_false_step: s.on_false_step ?? null,
              split_percentage: s.split_percentage ?? null,
              channel: s.channel ?? "telegram",
              email_subject: s.email_subject ?? "",
              email_template: s.email_template ?? "",
            })));
            setShowAIGenerate(false);
            setShowCreate(true);
            toast.success("Sequence generated -- review and create");
          }}
        />
      )}

      {showAnalytics ? (
        <OutreachAnalytics analyticsData={analyticsData} analyticsLoading={analyticsLoading} />
      ) : (
        <>
          {/* Aggregate stats */}
          {sequences.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "Total Enrollments", value: totals.total, sub: `${activeSeqs} active sequence${activeSeqs !== 1 ? "s" : ""}`, color: "text-foreground" },
                { label: "In Progress", value: totals.active, sub: "currently active", color: "text-blue-400" },
                { label: "Reply Rate", value: `${replyRate}%`, sub: `${totals.replied} replies`, color: replyRate >= 20 ? "text-emerald-400" : "text-amber-400" },
                { label: "Completion Rate", value: `${completionRate}%`, sub: `${totals.completed} completed`, color: "text-muted-foreground" },
              ].map((card) => (
                <div key={card.label} className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{card.label}</p>
                  <p className={cn("text-xl font-semibold mt-0.5", card.color ?? "text-foreground")}>{card.value}</p>
                  <p className="text-[10px] text-muted-foreground/60 mt-0.5">{card.sub}</p>
                </div>
              ))}
            </div>
          )}

          {showCreate && (
            <SequenceCreateForm
              initialSteps={aiGeneratedSteps}
              initialName={aiGeneratedName}
              initialBoard={aiGeneratedBoard}
              initialTone={aiGeneratedTone}
              pipelineStages={pipelineStages}
              onClose={() => {
                setShowCreate(false);
                setAiGeneratedSteps(undefined);
                setAiGeneratedName("");
                setAiGeneratedBoard("");
                setAiGeneratedTone("professional");
              }}
              onCreated={() => {
                setShowCreate(false);
                setAiGeneratedSteps(undefined);
                setAiGeneratedName("");
                setAiGeneratedBoard("");
                setAiGeneratedTone("professional");
                fetchSequences();
              }}
            />
          )}

          <SequenceList
            sequences={sequences}
            onStatusChange={updateStatus}
            onDelete={deleteSequence}
            onClone={() => fetchSequences()}
          />
        </>
      )}
    </div>
  );
}
