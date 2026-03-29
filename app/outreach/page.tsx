"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Plus,
  Trash2,
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
  BarChart3,
  TrendingUp,
  FlaskConical,
  Sparkles,
  AlertTriangle,
  X,
  Wand2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { timeAgo } from "@/lib/utils";
import { toast } from "sonner";

type EnrollmentStats = { total: number; active: number; completed: number; replied: number };

type Sequence = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  board_type: string | null;
  tone: string | null;
  step_count: number;
  enrollment_stats: EnrollmentStats;
  created_at: string;
  updated_at: string;
};

type OutreachAlert = {
  id: string;
  sequence_id: string;
  alert_type: string;
  message: string;
  created_at: string;
  sequence_name: string;
};

type Step = {
  id: string;
  step_number: number;
  delay_hours: number;
  message_template: string;
  variant_b_template: string | null;
  variant_c_template: string | null;
  ab_split_pct: number | null;
  variant_b_delay_hours: number | null;
  step_type: string;
  step_label: string | null;
  condition_type: string | null;
  condition_config: Record<string, unknown> | null;
  on_true_step: number | null;
  on_false_step: number | null;
  split_percentage: number | null;
};

type SequenceAnalytics = {
  id: string;
  name: string;
  status: string;
  step_count: number;
  total: number;
  active: number;
  completed: number;
  replied: number;
  paused: number;
  reply_rate: number;
  completion_rate: number;
};

type ABStats = {
  variant_a: { total: number; replied: number; reply_rate: number };
  variant_b: { total: number; replied: number; reply_rate: number };
  variant_c?: { total: number; replied: number; reply_rate: number };
  step_variants: Record<string, { a_sent: number; b_sent: number; c_sent?: number }>;
  significance: { z_score: number; significant: boolean; min_sample: boolean } | null;
};

type StepStat = {
  step_number: number;
  step_label: string;
  step_type: string;
  delay_hours: number;
  sent: number;
  preview: string;
  ab: { a_sent: number; b_sent: number; a_reply_rate: number; b_reply_rate: number; c_sent?: number; c_reply_rate?: number } | null;
};

type SequenceDetail = {
  sequence: { id: string; name: string; status: string } | null;
  total: number;
  replied: number;
  reply_rate: number;
  completion_rate: number;
  status_counts: Record<string, number>;
  step_stats: StepStat[];
  ab_stats: ABStats | null;
  daily_enrollments: Array<{ date: string; count: number }>;
};

export default function OutreachPage() {
  const [sequences, setSequences] = React.useState<Sequence[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [expanded, setExpanded] = React.useState<string | null>(null);
  const [steps, setSteps] = React.useState<Step[]>([]);
  const [stepsLoading, setStepsLoading] = React.useState(false);
  const [showCreate, setShowCreate] = React.useState(false);
  const [showAnalytics, setShowAnalytics] = React.useState(false);
  const [analyticsData, setAnalyticsData] = React.useState<SequenceAnalytics[] | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = React.useState(false);
  const [detailData, setDetailData] = React.useState<SequenceDetail | null>(null);
  const [detailLoading, setDetailLoading] = React.useState(false);
  const [selectedSeqId, setSelectedSeqId] = React.useState<string | null>(null);

  // AI recommendations
  type AIRecommendation = { type: string; step: number | null; title: string; detail: string; suggested_change: string };
  type AIRecommendations = { summary: string; recommendations: AIRecommendation[]; ab_winner: string | null; ab_confidence: string | null };
  const [aiRecs, setAiRecs] = React.useState<AIRecommendations | null>(null);
  const [aiRecsLoading, setAiRecsLoading] = React.useState(false);

  // AI rewrite/variant states
  const [rewritingStep, setRewritingStep] = React.useState<number | null>(null);
  const [generatingVariant, setGeneratingVariant] = React.useState<number | null>(null);

  // AI Generate sequence
  const [showAIGenerate, setShowAIGenerate] = React.useState(false);
  const [aiGoal, setAiGoal] = React.useState("");
  const [aiGenBoard, setAiGenBoard] = React.useState("");
  const [aiGenTone, setAiGenTone] = React.useState("professional");
  const [aiGenSteps, setAiGenSteps] = React.useState(4);
  const [aiGenerating, setAiGenerating] = React.useState(false);

  // Alerts
  const [alerts, setAlerts] = React.useState<OutreachAlert[]>([]);

  // Create form
  const [newName, setNewName] = React.useState("");
  const [newDesc, setNewDesc] = React.useState("");
  const [newBoard, setNewBoard] = React.useState("");
  const [newTone, setNewTone] = React.useState("professional");
  const [newGoalStage, setNewGoalStage] = React.useState("");
  const [newSteps, setNewSteps] = React.useState<Array<{
    message_template: string;
    variant_b_template: string;
    variant_c_template: string;
    ab_split_pct: number;
    variant_b_delay_hours: number | null;
    delay_hours: number;
    step_type: string;
    step_label: string;
    condition_type: string;
    condition_config: Record<string, unknown>;
    on_true_step: number | null;
    on_false_step: number | null;
    split_percentage: number | null;
  }>>([
    { message_template: "", variant_b_template: "", variant_c_template: "", ab_split_pct: 50, variant_b_delay_hours: null, delay_hours: 0, step_type: "message", step_label: "", condition_type: "", condition_config: {}, on_true_step: null, on_false_step: null, split_percentage: null },
    { message_template: "", variant_b_template: "", variant_c_template: "", ab_split_pct: 50, variant_b_delay_hours: null, delay_hours: 24, step_type: "message", step_label: "", condition_type: "", condition_config: {}, on_true_step: null, on_false_step: null, split_percentage: null },
    { message_template: "", variant_b_template: "", variant_c_template: "", ab_split_pct: 50, variant_b_delay_hours: null, delay_hours: 48, step_type: "message", step_label: "", condition_type: "", condition_config: {}, on_true_step: null, on_false_step: null, split_percentage: null },
  ]);
  const [pipelineStages, setPipelineStages] = React.useState<Array<{ id: string; name: string }>>([]);

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
    await fetch("/api/outreach/alerts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  }

  async function handleAIRewrite(stepIndex: number) {
    const step = newSteps[stepIndex];
    if (!step.message_template.trim()) {
      toast.error("Write a message first before rewriting");
      return;
    }
    setRewritingStep(stepIndex);
    try {
      const res = await fetch("/api/outreach/ai-rewrite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: step.message_template,
          context: { sequence_name: newName, step_number: stepIndex + 1, board_type: newBoard || undefined },
          tone: newTone || undefined,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        updateStep(stepIndex, "message_template", data.rewritten);
        toast.success("Message rewritten");
      } else {
        toast.error("Failed to rewrite message");
      }
    } finally {
      setRewritingStep(null);
    }
  }

  async function handleAIVariant(stepIndex: number) {
    const step = newSteps[stepIndex];
    if (!step.message_template.trim()) {
      toast.error("Write a message first before generating a variant");
      return;
    }
    setGeneratingVariant(stepIndex);
    try {
      const res = await fetch("/api/outreach/ai-variant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: step.message_template,
          context: { sequence_name: newName, step_number: stepIndex + 1, board_type: newBoard || undefined },
          tone: newTone || undefined,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        updateStep(stepIndex, "variant_b_template", data.variant);
        toast.success("Variant B generated");
      } else {
        toast.error("Failed to generate variant");
      }
    } finally {
      setGeneratingVariant(null);
    }
  }

  async function handleAIGenerateSequence() {
    if (!aiGoal.trim()) {
      toast.error("Describe the goal for the sequence");
      return;
    }
    setAiGenerating(true);
    try {
      const res = await fetch("/api/outreach/ai-generate-sequence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goal: aiGoal,
          board_type: aiGenBoard || undefined,
          tone: aiGenTone,
          num_steps: aiGenSteps,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const generated = (data.steps ?? []).map((s: { message_template?: string; variant_b_template?: string; delay_hours?: number; step_type?: string; step_label?: string; condition_type?: string; condition_config?: Record<string, unknown>; on_true_step?: number | null; on_false_step?: number | null; split_percentage?: number | null }) => ({
          message_template: s.message_template ?? "",
          variant_b_template: s.variant_b_template ?? "",
          variant_c_template: "",
          ab_split_pct: 50,
          variant_b_delay_hours: null,
          delay_hours: s.delay_hours ?? 24,
          step_type: s.step_type ?? "message",
          step_label: s.step_label ?? "",
          condition_type: s.condition_type ?? "",
          condition_config: s.condition_config ?? {},
          on_true_step: s.on_true_step ?? null,
          on_false_step: s.on_false_step ?? null,
          split_percentage: s.split_percentage ?? null,
        }));
        setNewName(aiGoal.slice(0, 60));
        setNewBoard(aiGenBoard);
        setNewTone(aiGenTone);
        setNewSteps(generated);
        setShowAIGenerate(false);
        setShowCreate(true);
        setAiGoal("");
        toast.success("Sequence generated -- review and create");
      } else {
        toast.error("Failed to generate sequence");
      }
    } finally {
      setAiGenerating(false);
    }
  }

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

  async function fetchSequenceDetail(seqId: string) {
    setSelectedSeqId(seqId);
    setDetailLoading(true);
    setAiRecs(null);
    try {
      const res = await fetch(`/api/outreach/analytics?sequence_id=${seqId}`);
      if (res.ok) {
        const data = await res.json();
        setDetailData(data);
      }
    } finally {
      setDetailLoading(false);
    }
  }

  async function fetchAIRecommendations(seqId: string) {
    setAiRecsLoading(true);
    try {
      const res = await fetch("/api/outreach/ai-recommendations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sequence_id: seqId }),
      });
      if (res.ok) {
        const data = await res.json();
        setAiRecs(data.recommendations ?? null);
      } else {
        toast.error("Failed to get AI recommendations");
      }
    } finally {
      setAiRecsLoading(false);
    }
  }

  async function handleCreate() {
    if (!newName.trim()) return;
    const validSteps = newSteps.filter((s) => s.step_type !== "message" || s.message_template.trim());
    if (validSteps.length === 0 || !validSteps.some((s) => s.step_type === "message")) {
      toast.error("Add at least one message step");
      return;
    }

    const res = await fetch("/api/outreach/sequences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newName.trim(),
        description: newDesc || undefined,
        board_type: newBoard || undefined,
        goal_stage_id: newGoalStage || undefined,
        tone: newTone || "professional",
        steps: validSteps,
      }),
    });

    if (res.ok) {
      toast.success("Sequence created");
      setShowCreate(false);
      setNewName("");
      setNewDesc("");
      setNewBoard("");
      setNewTone("professional");
      setNewSteps([
        { message_template: "", variant_b_template: "", variant_c_template: "", ab_split_pct: 50, variant_b_delay_hours: null, delay_hours: 0, step_type: "message", step_label: "", condition_type: "", condition_config: {}, on_true_step: null, on_false_step: null, split_percentage: null },
        { message_template: "", variant_b_template: "", variant_c_template: "", ab_split_pct: 50, variant_b_delay_hours: null, delay_hours: 24, step_type: "message", step_label: "", condition_type: "", condition_config: {}, on_true_step: null, on_false_step: null, split_percentage: null },
        { message_template: "", variant_b_template: "", variant_c_template: "", ab_split_pct: 50, variant_b_delay_hours: null, delay_hours: 48, step_type: "message", step_label: "", condition_type: "", condition_config: {}, on_true_step: null, on_false_step: null, split_percentage: null },
      ]);
      fetchSequences();
    }
  }

  async function updateStatus(id: string, status: string) {
    await fetch("/api/outreach/sequences", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    setSequences((prev) => prev.map((s) => (s.id === id ? { ...s, status } : s)));
    toast.success(`Sequence ${status}`);
  }

  async function deleteSequence(id: string) {
    await fetch("/api/outreach/sequences", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setSequences((prev) => prev.filter((s) => s.id !== id));
    toast.success("Sequence deleted");
  }

  async function cloneSequence(id: string) {
    const res = await fetch("/api/outreach/sequences/clone", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sequence_id: id }),
    });
    if (res.ok) {
      toast.success("Sequence cloned");
      fetchSequences();
    } else {
      const data = await res.json();
      toast.error(data.error ?? "Clone failed");
    }
  }

  function addStep(type: string = "message") {
    setNewSteps([...newSteps, { message_template: "", variant_b_template: "", variant_c_template: "", ab_split_pct: 50, variant_b_delay_hours: null, delay_hours: 24, step_type: type, step_label: "", condition_type: type === "condition" ? "reply_received" : "", condition_config: {}, on_true_step: null, on_false_step: null, split_percentage: type === "condition" ? 50 : null }]);
  }

  function removeStep(index: number) {
    setNewSteps(newSteps.filter((_, i) => i !== index));
  }

  function updateStep(index: number, field: string, value: string | number | null | Record<string, unknown>) {
    setNewSteps(newSteps.map((s, i) => (i === index ? { ...s, [field]: value } : s)));
  }

  function updateStepConfig(index: number, configKey: string, configValue: unknown) {
    setNewSteps(newSteps.map((s, i) => (
      i === index ? { ...s, condition_config: { ...s.condition_config, [configKey]: configValue } } : s
    )));
  }

  const statusColors: Record<string, { bg: string; text: string }> = {
    draft: { bg: "bg-white/10", text: "text-muted-foreground" },
    active: { bg: "bg-emerald-500/10", text: "text-emerald-400" },
    paused: { bg: "bg-yellow-500/10", text: "text-yellow-400" },
    completed: { bg: "bg-blue-500/10", text: "text-blue-400" },
  };

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

      {/* Alerts banner */}
      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map((alert) => {
            const alertColors: Record<string, { border: string; bg: string; icon: string }> = {
              low_reply_rate: { border: "border-red-500/30", bg: "bg-red-500/5", icon: "text-red-400" },
              high_drop_off: { border: "border-amber-500/30", bg: "bg-amber-500/5", icon: "text-amber-400" },
              stale_sequence: { border: "border-slate-500/30", bg: "bg-slate-500/5", icon: "text-slate-400" },
            };
            const c = alertColors[alert.alert_type] ?? alertColors.stale_sequence;
            return (
              <div key={alert.id} className={cn("flex items-start gap-3 rounded-xl border p-3", c.border, c.bg)}>
                <AlertTriangle className={cn("h-4 w-4 shrink-0 mt-0.5", c.icon)} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-foreground">{alert.message}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Sequence: {alert.sequence_name}</p>
                </div>
                <button
                  onClick={() => dismissAlert(alert.id)}
                  className="text-muted-foreground hover:text-foreground shrink-0"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* AI Generate form */}
      {showAIGenerate && (
        <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Wand2 className="h-4 w-4 text-purple-400" />
              <h3 className="text-sm font-medium text-purple-400">AI Generate Sequence</h3>
            </div>
            <button onClick={() => setShowAIGenerate(false)} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
          <textarea
            value={aiGoal}
            onChange={(e) => setAiGoal(e.target.value)}
            placeholder="Describe the goal (e.g. 'Cold outreach to DeFi projects for potential integration partnerships')"
            rows={2}
            className="w-full rounded-lg border border-white/10 bg-transparent px-3 py-2 text-sm resize-none"
          />
          <div className="grid grid-cols-3 gap-3">
            <select
              value={aiGenBoard}
              onChange={(e) => setAiGenBoard(e.target.value)}
              className="rounded-lg border border-white/10 bg-transparent px-3 py-2 text-xs"
            >
              <option value="">Any board</option>
              <option value="BD">BD</option>
              <option value="Marketing">Marketing</option>
              <option value="Admin">Admin</option>
            </select>
            <select
              value={aiGenTone}
              onChange={(e) => setAiGenTone(e.target.value)}
              className="rounded-lg border border-white/10 bg-transparent px-3 py-2 text-xs"
            >
              <option value="professional">Professional</option>
              <option value="casual">Casual</option>
              <option value="web3_native">Web3 Native</option>
              <option value="formal">Formal</option>
            </select>
            <div className="flex items-center gap-2">
              <label className="text-[10px] text-muted-foreground shrink-0">Steps:</label>
              <input
                type="number"
                min={2}
                max={8}
                value={aiGenSteps}
                onChange={(e) => setAiGenSteps(Number(e.target.value))}
                className="w-14 rounded border border-white/10 bg-transparent px-2 py-1.5 text-xs text-center"
              />
            </div>
          </div>
          <div className="flex justify-end">
            <Button
              size="sm"
              onClick={handleAIGenerateSequence}
              disabled={aiGenerating || !aiGoal.trim()}
              className="bg-purple-600 hover:bg-purple-700"
            >
              <Sparkles className="mr-1 h-3.5 w-3.5" />
              {aiGenerating ? "Generating..." : "Generate Sequence"}
            </Button>
          </div>
        </div>
      )}

      {/* Analytics view */}
      {showAnalytics ? (
        <div className="space-y-4">
          {analyticsLoading || !analyticsData ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => <div key={i} className="h-24 rounded-xl bg-white/[0.02] animate-pulse" />)}
            </div>
          ) : selectedSeqId && detailData ? (
            // Detail view for selected sequence
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <button onClick={() => { setSelectedSeqId(null); setDetailData(null); setAiRecs(null); }} className="text-xs text-primary hover:underline">&larr; Back to overview</button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => fetchAIRecommendations(selectedSeqId!)}
                  disabled={aiRecsLoading}
                  className="text-purple-400 hover:text-purple-300"
                >
                  <Sparkles className="mr-1 h-3.5 w-3.5" />
                  {aiRecsLoading ? "Analyzing..." : "AI Recommendations"}
                </Button>
              </div>

              {detailLoading ? (
                <div className="h-40 rounded-xl bg-white/[0.02] animate-pulse" />
              ) : (
                <>
                  <div className="flex items-center gap-3">
                    <h3 className="text-sm font-medium text-foreground">{detailData.sequence?.name ?? "Sequence"}</h3>
                    <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] capitalize">{detailData.sequence?.status}</span>
                  </div>

                  {/* Summary cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[
                      { label: "Enrolled", value: detailData.total, color: "text-foreground" },
                      { label: "Replied", value: detailData.replied, color: "text-purple-400" },
                      { label: "Reply Rate", value: `${detailData.reply_rate}%`, color: detailData.reply_rate >= 20 ? "text-emerald-400" : "text-amber-400" },
                      { label: "Completion", value: `${detailData.completion_rate}%`, color: "text-blue-400" },
                    ].map((c) => (
                      <div key={c.label} className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{c.label}</p>
                        <p className={cn("text-xl font-semibold mt-0.5", c.color)}>{c.value}</p>
                      </div>
                    ))}
                  </div>

                  {/* Status breakdown */}
                  {Object.keys(detailData.status_counts).length > 0 && (
                    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-2">
                      <h4 className="text-xs font-medium text-muted-foreground">Enrollment Status</h4>
                      <div className="flex items-center gap-3 flex-wrap">
                        {Object.entries(detailData.status_counts).map(([status, count]) => (
                          <span key={status} className="rounded-lg bg-white/5 border border-white/10 px-3 py-1.5 text-xs">
                            <span className="text-foreground font-medium capitalize">{status}</span>
                            <span className="text-muted-foreground ml-1.5">{count}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* A/B Test Results */}
                  {detailData.ab_stats && (
                    <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <FlaskConical className="h-3.5 w-3.5 text-purple-400" />
                        <h4 className="text-xs font-medium text-purple-400">A/B{detailData.ab_stats.variant_c ? "/C" : ""} Test Results</h4>
                      </div>
                      <div className={cn("grid gap-3", detailData.ab_stats.variant_c ? "grid-cols-3" : "grid-cols-2")}>
                        {(["variant_a", "variant_b", ...(detailData.ab_stats.variant_c ? ["variant_c" as const] : [])] as const).map((variant) => {
                          const data = (detailData.ab_stats as unknown as Record<string, { total: number; replied: number; reply_rate: number }>)[variant];
                          if (!data) return null;
                          const allRates = [
                            detailData.ab_stats!.variant_a.reply_rate,
                            detailData.ab_stats!.variant_b.reply_rate,
                            ...(detailData.ab_stats!.variant_c ? [detailData.ab_stats!.variant_c.reply_rate] : []),
                          ];
                          const maxRate = Math.max(...allRates);
                          const hasVariation = new Set(allRates).size > 1;
                          const isWinner = hasVariation && data.reply_rate >= maxRate;
                          return (
                            <div key={variant} className={cn(
                              "rounded-lg border p-3 space-y-1",
                              isWinner ? "border-emerald-500/30 bg-emerald-500/5" : "border-white/10 bg-white/[0.02]"
                            )}>
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-medium text-foreground">
                                  Variant {variant === "variant_a" ? "A" : variant === "variant_b" ? "B" : "C"}
                                </span>
                                {isWinner && data.total > 0 && (
                                  <span className="rounded-full bg-emerald-500/20 px-1.5 py-0.5 text-[9px] text-emerald-400 font-medium">Winner</span>
                                )}
                              </div>
                              <p className="text-lg font-semibold text-foreground">{data.reply_rate}%</p>
                              <p className="text-[10px] text-muted-foreground">
                                {data.replied}/{data.total} replied
                              </p>
                            </div>
                          );
                        })}
                      </div>
                      {/* Statistical significance indicator */}
                      {detailData.ab_stats.significance ? (
                        <div className="text-[10px] px-1">
                          {detailData.ab_stats.significance.min_sample ? (
                            <p className="text-muted-foreground/60">Need 30+ per variant for reliable results</p>
                          ) : detailData.ab_stats.significance.significant ? (
                            <p className="text-emerald-400">Statistically significant (95% confidence, z={detailData.ab_stats.significance.z_score})</p>
                          ) : (
                            <p className="text-amber-400">Not yet significant — keep testing (z={detailData.ab_stats.significance.z_score})</p>
                          )}
                        </div>
                      ) : (
                        <p className="text-[10px] text-muted-foreground/40 px-1">Need 5+ per variant for significance testing</p>
                      )}
                    </div>
                  )}

                  {/* Step funnel */}
                  {detailData.step_stats.length > 0 && (
                    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-3">
                      <h4 className="text-xs font-medium text-muted-foreground">Step Funnel</h4>
                      <div className="space-y-2">
                        {detailData.step_stats.map((step, i) => {
                          const maxSent = Math.max(...detailData.step_stats.map((s) => s.sent), 1);
                          const pct = (step.sent / maxSent) * 100;
                          const dropoff = i > 0 && detailData.step_stats[i - 1].sent > 0
                            ? Math.round(((detailData.step_stats[i - 1].sent - step.sent) / detailData.step_stats[i - 1].sent) * 100)
                            : 0;
                          return (
                            <div key={step.step_number} className="space-y-1">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/20 text-primary text-[10px] font-bold">{step.step_number}</span>
                                  <span className="text-xs text-foreground">{step.step_label}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-muted-foreground">{step.sent} sent</span>
                                  {dropoff > 0 && <span className="text-[10px] text-red-400">-{dropoff}%</span>}
                                </div>
                              </div>
                              <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                                <div className="h-full rounded-full bg-primary/50 transition-all" style={{ width: `${Math.max(pct, 2)}%` }} />
                              </div>
                              <p className="text-[10px] text-muted-foreground/60 truncate">{step.preview}</p>
                              {step.ab && (
                                <div className="flex items-center gap-3 text-[10px] mt-0.5">
                                  <span className={cn(
                                    "font-medium",
                                    step.ab.a_reply_rate >= step.ab.b_reply_rate ? "text-emerald-400" : "text-muted-foreground"
                                  )}>
                                    A: {step.ab.a_sent} sent ({step.ab.a_reply_rate}%)
                                  </span>
                                  <span className="text-muted-foreground/30">|</span>
                                  <span className={cn(
                                    "font-medium",
                                    step.ab.b_reply_rate > step.ab.a_reply_rate ? "text-emerald-400" : "text-muted-foreground"
                                  )}>
                                    B: {step.ab.b_sent} sent ({step.ab.b_reply_rate}%)
                                  </span>
                                  {step.ab.c_sent != null && (
                                    <>
                                      <span className="text-muted-foreground/30">|</span>
                                      <span className={cn(
                                        "font-medium",
                                        (step.ab.c_reply_rate ?? 0) > Math.max(step.ab.a_reply_rate, step.ab.b_reply_rate) ? "text-emerald-400" : "text-muted-foreground"
                                      )}>
                                        C: {step.ab.c_sent} sent ({step.ab.c_reply_rate ?? 0}%)
                                      </span>
                                    </>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Daily enrollment chart */}
                  {detailData.daily_enrollments.length > 0 && (
                    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-3">
                      <h4 className="text-xs font-medium text-muted-foreground">Daily Enrollments (30d)</h4>
                      <div className="flex items-end gap-0.5 h-16">
                        {detailData.daily_enrollments.map((d) => {
                          const max = Math.max(...detailData.daily_enrollments.map((v) => v.count));
                          const height = max > 0 ? (d.count / max) * 100 : 0;
                          return (
                            <div
                              key={d.date}
                              className="flex-1 bg-primary/40 rounded-t hover:bg-primary/60 transition-colors"
                              style={{ height: `${Math.max(height, 4)}%` }}
                              title={`${d.date}: ${d.count}`}
                            />
                          );
                        })}
                      </div>
                      <div className="flex justify-between text-[9px] text-muted-foreground">
                        <span>{detailData.daily_enrollments[0]?.date}</span>
                        <span>{detailData.daily_enrollments[detailData.daily_enrollments.length - 1]?.date}</span>
                      </div>
                    </div>
                  )}

                  {/* AI Recommendations */}
                  {aiRecs && (
                    <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <Sparkles className="h-3.5 w-3.5 text-purple-400" />
                        <h4 className="text-xs font-medium text-purple-400">AI Recommendations</h4>
                      </div>
                      <p className="text-xs text-foreground">{aiRecs.summary}</p>

                      {aiRecs.ab_winner && (
                        <div className="flex items-center gap-2 rounded-lg bg-white/[0.03] px-3 py-2">
                          <FlaskConical className="h-3.5 w-3.5 text-emerald-400" />
                          <span className="text-xs text-foreground">
                            A/B Winner: <span className="font-medium text-emerald-400">Variant {aiRecs.ab_winner}</span>
                          </span>
                          {aiRecs.ab_confidence && (
                            <span className={cn(
                              "rounded-full px-1.5 py-0.5 text-[9px] font-medium",
                              aiRecs.ab_confidence === "high" ? "bg-emerald-500/20 text-emerald-400" :
                              aiRecs.ab_confidence === "medium" ? "bg-amber-500/20 text-amber-400" :
                              "bg-slate-500/20 text-slate-400"
                            )}>
                              {aiRecs.ab_confidence} confidence
                            </span>
                          )}
                        </div>
                      )}

                      <div className="space-y-2">
                        {aiRecs.recommendations.map((rec, i) => {
                          const typeColors: Record<string, string> = {
                            message: "text-blue-400 bg-blue-500/10",
                            timing: "text-amber-400 bg-amber-500/10",
                            ab_test: "text-purple-400 bg-purple-500/10",
                            structure: "text-cyan-400 bg-cyan-500/10",
                            quick_win: "text-emerald-400 bg-emerald-500/10",
                          };
                          return (
                            <div key={i} className="rounded-lg border border-white/10 bg-white/[0.02] p-3 space-y-1.5">
                              <div className="flex items-center gap-2">
                                <span className={cn("rounded-full px-1.5 py-0.5 text-[9px] font-medium capitalize", typeColors[rec.type] ?? "text-muted-foreground bg-white/5")}>
                                  {rec.type.replace("_", " ")}
                                </span>
                                {rec.step && <span className="text-[9px] text-muted-foreground">Step {rec.step}</span>}
                                <span className="text-xs font-medium text-foreground">{rec.title}</span>
                              </div>
                              <p className="text-[11px] text-muted-foreground">{rec.detail}</p>
                              {rec.suggested_change && (
                                <div className="rounded bg-white/[0.03] px-2 py-1.5 text-[11px] font-mono text-foreground/80 whitespace-pre-wrap">
                                  {rec.suggested_change}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          ) : (
            // Overview: all sequences analytics
            <div className="space-y-3">
              {analyticsData.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No sequence data yet.</p>
              ) : (
                <>
                  {/* Aggregate cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {(() => {
                      const totals = analyticsData.reduce((acc, s) => {
                        acc.total += s.total; acc.replied += s.replied; acc.completed += s.completed; acc.active += s.active;
                        return acc;
                      }, { total: 0, replied: 0, completed: 0, active: 0 });
                      const rr = totals.total > 0 ? Math.round((totals.replied / totals.total) * 100) : 0;
                      const cr = totals.total > 0 ? Math.round((totals.completed / totals.total) * 100) : 0;
                      return [
                        { label: "Total Enrolled", value: totals.total, color: "text-foreground" },
                        { label: "In Progress", value: totals.active, color: "text-blue-400" },
                        { label: "Avg Reply Rate", value: `${rr}%`, color: rr >= 20 ? "text-emerald-400" : "text-amber-400" },
                        { label: "Avg Completion", value: `${cr}%`, color: "text-muted-foreground" },
                      ];
                    })().map((c) => (
                      <div key={c.label} className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{c.label}</p>
                        <p className={cn("text-xl font-semibold mt-0.5", c.color)}>{c.value}</p>
                      </div>
                    ))}
                  </div>

                  {/* Per-sequence table */}
                  <div className="rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-white/5 text-[10px] text-muted-foreground uppercase tracking-wider">
                          <th className="text-left p-3">Sequence</th>
                          <th className="text-center p-3">Steps</th>
                          <th className="text-center p-3">Enrolled</th>
                          <th className="text-center p-3">Active</th>
                          <th className="text-center p-3">Replied</th>
                          <th className="text-center p-3">Reply Rate</th>
                          <th className="text-center p-3">Completion</th>
                          <th className="text-center p-3"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {analyticsData.map((seq) => (
                          <tr key={seq.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                            <td className="p-3">
                              <div className="flex items-center gap-2">
                                <span className="text-foreground font-medium">{seq.name}</span>
                                <span className={cn("rounded-full px-1.5 py-0.5 text-[9px] capitalize",
                                  seq.status === "active" ? "bg-emerald-500/10 text-emerald-400" :
                                  seq.status === "paused" ? "bg-yellow-500/10 text-yellow-400" :
                                  "bg-white/10 text-muted-foreground"
                                )}>{seq.status}</span>
                              </div>
                            </td>
                            <td className="text-center p-3 text-muted-foreground">{seq.step_count}</td>
                            <td className="text-center p-3 text-foreground font-medium">{seq.total}</td>
                            <td className="text-center p-3 text-blue-400">{seq.active}</td>
                            <td className="text-center p-3 text-purple-400">{seq.replied}</td>
                            <td className="text-center p-3">
                              <span className={cn("font-medium", seq.reply_rate >= 20 ? "text-emerald-400" : seq.reply_rate >= 10 ? "text-amber-400" : "text-muted-foreground")}>
                                {seq.reply_rate}%
                              </span>
                            </td>
                            <td className="text-center p-3 text-muted-foreground">{seq.completion_rate}%</td>
                            <td className="text-center p-3">
                              <button
                                onClick={() => fetchSequenceDetail(seq.id)}
                                className="text-primary hover:underline text-[10px]"
                              >
                                Details
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      ) : (
      <>
      {/* Aggregate stats */}
      {sequences.length > 0 && (() => {
        const totals = sequences.reduce((acc, s) => {
          acc.total += s.enrollment_stats.total;
          acc.active += s.enrollment_stats.active;
          acc.completed += s.enrollment_stats.completed;
          acc.replied += s.enrollment_stats.replied;
          return acc;
        }, { total: 0, active: 0, completed: 0, replied: 0 });
        const replyRate = totals.total > 0 ? Math.round((totals.replied / totals.total) * 100) : 0;
        const completionRate = totals.total > 0 ? Math.round((totals.completed / totals.total) * 100) : 0;
        const activeSeqs = sequences.filter((s) => s.status === "active").length;
        return (
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
        );
      })()}

      {/* Create form */}
      {showCreate && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-3">
          <h3 className="text-sm font-medium text-foreground">New Outreach Sequence</h3>

          <div className="grid grid-cols-3 gap-3">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Sequence name (e.g. Cold BD Follow-up)"
              className="text-sm"
            />
            <select
              value={newBoard}
              onChange={(e) => setNewBoard(e.target.value)}
              className="rounded-lg border border-white/10 bg-transparent px-3 py-2 text-sm"
            >
              <option value="">Any board</option>
              <option value="BD">BD</option>
              <option value="Marketing">Marketing</option>
              <option value="Admin">Admin</option>
            </select>
            <select
              value={newTone}
              onChange={(e) => setNewTone(e.target.value)}
              className="rounded-lg border border-white/10 bg-transparent px-3 py-2 text-sm"
            >
              <option value="professional">Professional</option>
              <option value="casual">Casual</option>
              <option value="web3_native">Web3 Native</option>
              <option value="formal">Formal</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              placeholder="Description (optional)"
              className="text-xs"
            />
            <select
              value={newGoalStage}
              onChange={(e) => setNewGoalStage(e.target.value)}
              className="rounded-lg border border-white/10 bg-transparent px-3 py-2 text-xs"
              title="Auto-complete sequence when deal reaches this stage"
            >
              <option value="">No goal stage</option>
              {pipelineStages.map((s) => (
                <option key={s.id} value={s.id}>{s.name} (auto-complete)</option>
              ))}
            </select>
          </div>

          {/* Steps */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">
              Steps ({newSteps.length})
            </p>
            {newSteps.map((step, i) => (
              <div key={i} className={cn(
                "rounded-lg border p-3 space-y-2",
                step.step_type === "condition" ? "border-yellow-500/20 bg-yellow-500/5" : "border-white/10 bg-white/[0.02]"
              )}>
                <div className="flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/20 text-primary text-[10px] font-bold shrink-0">
                    {i + 1}
                  </span>
                  <select
                    value={step.step_type}
                    onChange={(e) => updateStep(i, "step_type", e.target.value)}
                    className="rounded border border-white/10 bg-transparent px-2 py-1 text-[10px]"
                  >
                    <option value="message">Message</option>
                    <option value="wait">Wait</option>
                    <option value="condition">Condition</option>
                  </select>
                  {i > 0 && (
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3 text-muted-foreground" />
                      <Input
                        value={step.delay_hours}
                        onChange={(e) => updateStep(i, "delay_hours", Number(e.target.value))}
                        className="h-6 w-14 text-[10px] text-center"
                        type="number"
                        min={0}
                      />
                      <span className="text-[9px] text-muted-foreground">hrs</span>
                    </div>
                  )}
                  <input
                    value={step.step_label ?? ""}
                    onChange={(e) => updateStep(i, "step_label", e.target.value)}
                    placeholder="Label (optional)"
                    className="flex-1 h-6 rounded border border-white/10 bg-transparent px-2 text-[10px] text-muted-foreground"
                  />
                  {newSteps.length > 1 && (
                    <button
                      onClick={() => removeStep(i)}
                      className="text-muted-foreground hover:text-red-400 shrink-0 ml-auto"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                {step.step_type === "message" && (
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[9px] text-muted-foreground/50 uppercase tracking-wider">Variant A</span>
                      <button
                        type="button"
                        onClick={() => handleAIRewrite(i)}
                        disabled={rewritingStep === i}
                        className="flex items-center gap-0.5 text-[9px] text-purple-400 hover:underline disabled:opacity-50 disabled:no-underline"
                      >
                        <Sparkles className="h-2.5 w-2.5" />
                        {rewritingStep === i ? "Rewriting..." : "AI Rewrite"}
                      </button>
                      {!step.variant_b_template && (
                        <button
                          type="button"
                          onClick={() => updateStep(i, "variant_b_template", step.message_template || " ")}
                          className="flex items-center gap-0.5 text-[9px] text-purple-400 hover:underline ml-auto"
                        >
                          <FlaskConical className="h-2.5 w-2.5" /> Add A/B variant
                        </button>
                      )}
                      {!step.variant_b_template && (
                        <button
                          type="button"
                          onClick={() => handleAIVariant(i)}
                          disabled={generatingVariant === i}
                          className="flex items-center gap-0.5 text-[9px] text-purple-400 hover:underline disabled:opacity-50 disabled:no-underline"
                        >
                          <Sparkles className="h-2.5 w-2.5" />
                          <FlaskConical className="h-2.5 w-2.5" />
                          {generatingVariant === i ? "Generating..." : "AI Generate B"}
                        </button>
                      )}
                    </div>
                    <textarea
                      value={step.message_template}
                      onChange={(e) => updateStep(i, "message_template", e.target.value)}
                      placeholder={`Step ${i + 1} message. Use {{contact_name}}, {{deal_name}}, {{stage}}. Defaults: {{contact_first_name|there}}`}
                      rows={2}
                      className="w-full rounded-lg border border-white/10 bg-transparent px-2 py-1.5 text-xs font-mono resize-none"
                    />
                    {step.variant_b_template && (
                      <>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[9px] text-purple-400 uppercase tracking-wider">Variant B</span>
                          <span className="text-[9px] text-muted-foreground/40">
                            A: {step.ab_split_pct}% / B: {step.variant_c_template ? Math.round((100 - step.ab_split_pct) / 2) : 100 - step.ab_split_pct}%
                            {step.variant_c_template ? ` / C: ${100 - step.ab_split_pct - Math.round((100 - step.ab_split_pct) / 2)}%` : ""}
                          </span>
                          <div className="flex items-center gap-1 ml-1">
                            <input
                              type="range"
                              min={1}
                              max={99}
                              value={step.ab_split_pct}
                              onChange={(e) => updateStep(i, "ab_split_pct", Number(e.target.value))}
                              className="w-16 h-1 accent-purple-400"
                              title={`A gets ${step.ab_split_pct}%`}
                            />
                            <span className="text-[9px] text-muted-foreground/40">{step.ab_split_pct}%A</span>
                          </div>
                          {!step.variant_c_template && (
                            <button
                              type="button"
                              onClick={() => updateStep(i, "variant_c_template", step.message_template || " ")}
                              className="flex items-center gap-0.5 text-[9px] text-cyan-400 hover:underline"
                            >
                              <FlaskConical className="h-2.5 w-2.5" /> Add C
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => { updateStep(i, "variant_b_template", ""); updateStep(i, "variant_c_template", ""); }}
                            className="text-[9px] text-red-400 hover:underline ml-auto"
                          >
                            Remove B
                          </button>
                        </div>
                        <textarea
                          value={step.variant_b_template}
                          onChange={(e) => updateStep(i, "variant_b_template", e.target.value)}
                          placeholder="Variant B message..."
                          rows={2}
                          className="w-full rounded-lg border border-purple-500/20 bg-purple-500/5 px-2 py-1.5 text-xs font-mono resize-none"
                        />
                        <div className="flex items-center gap-1.5">
                          <span className="text-[9px] text-muted-foreground/40">B delay:</span>
                          <input
                            type="number"
                            min={0}
                            value={step.variant_b_delay_hours ?? ""}
                            onChange={(e) => updateStep(i, "variant_b_delay_hours", e.target.value ? Number(e.target.value) : null)}
                            placeholder="same"
                            className="w-16 h-5 rounded border border-white/10 bg-transparent px-1.5 text-[10px] text-center"
                            title="Override delay for variant B (leave empty to use same delay)"
                          />
                          <span className="text-[9px] text-muted-foreground/30">hrs (leave empty to use same delay)</span>
                        </div>
                        {step.variant_c_template && (
                          <>
                            <div className="flex items-center gap-1.5">
                              <span className="text-[9px] text-cyan-400 uppercase tracking-wider">Variant C</span>
                              <button
                                type="button"
                                onClick={() => updateStep(i, "variant_c_template", "")}
                                className="text-[9px] text-red-400 hover:underline ml-auto"
                              >
                                Remove C
                              </button>
                            </div>
                            <textarea
                              value={step.variant_c_template}
                              onChange={(e) => updateStep(i, "variant_c_template", e.target.value)}
                              placeholder="Variant C message..."
                              rows={2}
                              className="w-full rounded-lg border border-cyan-500/20 bg-cyan-500/5 px-2 py-1.5 text-xs font-mono resize-none"
                            />
                          </>
                        )}
                      </>
                    )}
                  </div>
                )}

                {step.step_type === "condition" && (
                  <div className="space-y-2 pl-7">
                    <div className="flex items-center gap-2 flex-wrap">
                      <GitBranch className="h-3.5 w-3.5 text-yellow-400 shrink-0" />
                      <select
                        value={step.condition_type}
                        onChange={(e) => {
                          setNewSteps((prev) => prev.map((s, idx) => idx === i
                            ? { ...s, condition_type: e.target.value, condition_config: {}, split_percentage: e.target.value === "ab_split" ? 50 : null }
                            : s));
                        }}
                        className="rounded border border-white/10 bg-transparent px-2 py-1 text-xs"
                      >
                        <option value="reply_received">Reply received</option>
                        <option value="no_reply_timeout">No reply (timeout)</option>
                        <option value="engagement_score">Engagement score ≥</option>
                        <option value="deal_stage">Deal in stage</option>
                        <option value="message_keyword">Message contains keyword</option>
                        <option value="days_since_enroll">Days since enrollment ≥</option>
                        <option value="ab_split">A/B Split</option>
                      </select>
                      {step.condition_type === "engagement_score" && (
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={(step.condition_config?.threshold as number) ?? 50}
                          onChange={(e) => updateStepConfig(i, "threshold", Number(e.target.value))}
                          className="w-16 rounded border border-white/10 bg-transparent px-2 py-1 text-xs"
                          placeholder="50"
                        />
                      )}
                      {step.condition_type === "deal_stage" && (
                        <select
                          value={(step.condition_config?.stage_id as string) ?? ""}
                          onChange={(e) => updateStepConfig(i, "stage_id", e.target.value)}
                          className="rounded border border-white/10 bg-transparent px-2 py-1 text-xs"
                        >
                          <option value="">Select stage</option>
                          {pipelineStages.map((s) => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                        </select>
                      )}
                      {step.condition_type === "no_reply_timeout" && (
                        <input
                          type="number"
                          min={1}
                          value={(step.condition_config?.timeout_hours as number) ?? 24}
                          onChange={(e) => updateStepConfig(i, "timeout_hours", Number(e.target.value))}
                          className="w-16 rounded border border-white/10 bg-transparent px-2 py-1 text-xs"
                          placeholder="24h"
                        />
                      )}
                      {step.condition_type === "message_keyword" && (
                        <input
                          type="text"
                          value={((step.condition_config?.keywords as string[]) ?? []).join(", ")}
                          onChange={(e) => updateStepConfig(i, "keywords", e.target.value.split(",").map((k) => k.trim()).filter(Boolean))}
                          className="flex-1 rounded border border-white/10 bg-transparent px-2 py-1 text-xs"
                          placeholder="keyword1, keyword2"
                        />
                      )}
                      {step.condition_type === "days_since_enroll" && (
                        <input
                          type="number"
                          min={1}
                          value={(step.condition_config?.days as number) ?? 7}
                          onChange={(e) => updateStepConfig(i, "days", Number(e.target.value))}
                          className="w-16 rounded border border-white/10 bg-transparent px-2 py-1 text-xs"
                          placeholder="7"
                        />
                      )}
                      {step.condition_type === "ab_split" && (
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] text-muted-foreground">A:</span>
                          <input
                            type="number"
                            min={1}
                            max={99}
                            value={step.split_percentage ?? 50}
                            onChange={(e) => updateStep(i, "split_percentage", Number(e.target.value))}
                            className="w-14 rounded border border-white/10 bg-transparent px-2 py-1 text-xs"
                          />
                          <span className="text-[10px] text-muted-foreground">% / B: {100 - (step.split_percentage ?? 50)}%</span>
                        </div>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-emerald-400 shrink-0" />
                        <span className="text-[10px] text-emerald-400 shrink-0">If YES →</span>
                        <select
                          value={step.on_true_step ?? ""}
                          onChange={(e) => updateStep(i, "on_true_step", e.target.value ? Number(e.target.value) : null)}
                          className="rounded border border-white/10 bg-transparent px-1.5 py-0.5 text-[10px] flex-1"
                        >
                          <option value="">End sequence</option>
                          {newSteps.map((_, si) => si !== i && (
                            <option key={si} value={si + 1}>Step {si + 1}</option>
                          ))}
                        </select>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-red-400 shrink-0" />
                        <span className="text-[10px] text-red-400 shrink-0">If NO →</span>
                        <select
                          value={step.on_false_step ?? ""}
                          onChange={(e) => updateStep(i, "on_false_step", e.target.value ? Number(e.target.value) : null)}
                          className="rounded border border-white/10 bg-transparent px-1.5 py-0.5 text-[10px] flex-1"
                        >
                          <option value="">End sequence</option>
                          {newSteps.map((_, si) => si !== i && (
                            <option key={si} value={si + 1}>Step {si + 1}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                )}

                {step.step_type === "wait" && (
                  <div className="pl-7 text-[10px] text-muted-foreground flex items-center gap-1">
                    <Timer className="h-3 w-3" />
                    Wait {step.delay_hours}h before next step
                  </div>
                )}
              </div>
            ))}
            <div className="flex items-center gap-2">
              <button
                onClick={() => addStep("message")}
                className="text-xs text-primary hover:underline flex items-center gap-1"
              >
                <Plus className="h-3 w-3" /> Message
              </button>
              <button
                onClick={() => addStep("condition")}
                className="text-xs text-yellow-400 hover:underline flex items-center gap-1"
              >
                <GitBranch className="h-3 w-3" /> Condition
              </button>
              <button
                onClick={() => addStep("wait")}
                className="text-xs text-muted-foreground hover:underline flex items-center gap-1"
              >
                <Clock className="h-3 w-3" /> Wait
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 justify-end">
            <Button size="sm" variant="ghost" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleCreate}
              disabled={!newName.trim() || !newSteps.some((s) => s.step_type === "message" && s.message_template.trim())}
            >
              Create Sequence
            </Button>
          </div>
        </div>
      )}

      {/* Sequences list */}
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
                      onClick={() => updateStatus(seq.id, "active")}
                    >
                      <Play className="mr-1 h-3 w-3" />
                      Activate
                    </Button>
                  ) : seq.status === "active" ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs text-yellow-400"
                      onClick={() => updateStatus(seq.id, "paused")}
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
                    onClick={() => cloneSequence(seq.id)}
                    className="text-muted-foreground hover:text-primary p-1"
                    title="Duplicate sequence"
                  >
                    <Copy className="h-4 w-4" />
                  </button>

                  <button
                    onClick={() => deleteSequence(seq.id)}
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
                                    : step.condition_type === "engagement_score" ? `If engagement ≥ ${step.condition_config?.threshold ?? 50}`
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
                                  <span className="text-emerald-400">YES →</span>
                                  <span className="text-muted-foreground">
                                    {step.on_true_step ? `Go to step ${step.on_true_step}` : "End sequence"}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1.5 text-[10px]">
                                  <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
                                  <span className="text-red-400">NO →</span>
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

        {sequences.length === 0 && !showCreate && (
          <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-8 text-center">
            <Send className="mx-auto h-8 w-8 text-muted-foreground/30" />
            <p className="mt-2 text-sm text-muted-foreground">
              No outreach sequences. Create one to automate multi-step Telegram campaigns.
            </p>
          </div>
        )}
      </div>
      </>
      )}
    </div>
  );
}
