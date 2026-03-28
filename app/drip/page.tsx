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
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { timeAgo } from "@/lib/utils";
import { toast } from "sonner";

interface EnrollmentStats { total: number; active: number; completed: number }

interface Sequence {
  id: string;
  name: string;
  description: string | null;
  trigger_event: string;
  trigger_config: Record<string, unknown>;
  status: string;
  board_type: string | null;
  step_count: number;
  enrollment_stats: EnrollmentStats;
  created_at: string;
  updated_at: string;
}

interface Step {
  id: string;
  step_number: number;
  delay_hours: number;
  message_template: string;
  step_type: string;
  condition_type: string | null;
  condition_config: Record<string, unknown> | null;
  on_true_step: number | null;
  on_false_step: number | null;
}

const TRIGGER_EVENTS = [
  { value: "group_join", label: "User joins group", desc: "Fires when a new user joins a TG group" },
  { value: "first_message", label: "First message", desc: "Fires on a user's first message in a group" },
  { value: "keyword_match", label: "Keyword match", desc: "Fires when a message contains specific keywords" },
  { value: "silence_48h", label: "48h silence", desc: "Fires when a user is silent for 48h (cron)" },
  { value: "engagement_drop", label: "Engagement drop", desc: "Fires when engagement score drops below threshold (cron)" },
] as const;

const TRIGGER_LABELS: Record<string, string> = Object.fromEntries(TRIGGER_EVENTS.map((t) => [t.value, t.label]));

type NewStep = {
  message_template: string;
  delay_hours: number;
  step_type: string;
  condition_type: string;
  condition_config: Record<string, unknown>;
  on_true_step: number | null;
  on_false_step: number | null;
};

function createDefaultSteps(): NewStep[] {
  return [
    { message_template: "", delay_hours: 0, step_type: "message", condition_type: "", condition_config: {}, on_true_step: null, on_false_step: null },
    { message_template: "", delay_hours: 24, step_type: "message", condition_type: "", condition_config: {}, on_true_step: null, on_false_step: null },
  ];
}

export default function DripPage() {
  const [sequences, setSequences] = React.useState<Sequence[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [expanded, setExpanded] = React.useState<string | null>(null);
  const [steps, setSteps] = React.useState<Step[]>([]);
  const [stepsLoading, setStepsLoading] = React.useState(false);
  const [showCreate, setShowCreate] = React.useState(false);

  // Create form
  const [newName, setNewName] = React.useState("");
  const [newDesc, setNewDesc] = React.useState("");
  const [newTrigger, setNewTrigger] = React.useState("group_join");
  const [newTriggerConfig, setNewTriggerConfig] = React.useState<Record<string, unknown>>({});
  const [newBoard, setNewBoard] = React.useState("");
  const [newSteps, setNewSteps] = React.useState<NewStep[]>(createDefaultSteps());

  React.useEffect(() => {
    fetchSequences();
  }, []);

  async function fetchSequences() {
    try {
      const res = await fetch("/api/drip/sequences");
      if (res.ok) {
        const data = await res.json();
        setSequences(data.sequences ?? []);
      }
    } finally {
      setLoading(false);
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
      const res = await fetch(`/api/drip/steps?sequence_id=${sequenceId}`);
      if (res.ok) {
        const data = await res.json();
        setSteps(data.steps ?? []);
      }
    } finally {
      setStepsLoading(false);
    }
  }

  async function handleCreate() {
    if (!newName.trim()) return;
    const validSteps = newSteps.filter((s) => s.step_type !== "message" || s.message_template.trim());
    if (validSteps.length === 0 || !validSteps.some((s) => s.step_type === "message")) {
      toast.error("Add at least one message step");
      return;
    }

    const res = await fetch("/api/drip/sequences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newName.trim(),
        description: newDesc || undefined,
        trigger_event: newTrigger,
        trigger_config: newTriggerConfig,
        board_type: newBoard || undefined,
        steps: validSteps,
      }),
    });

    if (res.ok) {
      toast.success("Drip sequence created");
      setShowCreate(false);
      setNewName("");
      setNewDesc("");
      setNewTrigger("group_join");
      setNewTriggerConfig({});
      setNewBoard("");
      setNewSteps(createDefaultSteps());
      fetchSequences();
    } else {
      const data = await res.json();
      toast.error(data.error ?? "Failed to create");
    }
  }

  async function updateStatus(id: string, status: string) {
    await fetch("/api/drip/sequences", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    setSequences((prev) => prev.map((s) => (s.id === id ? { ...s, status } : s)));
    toast.success(`Sequence ${status}`);
  }

  async function deleteSequence(id: string) {
    await fetch("/api/drip/sequences", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setSequences((prev) => prev.filter((s) => s.id !== id));
    toast.success("Sequence deleted");
  }

  function addStep(type: string = "message") {
    setNewSteps([...newSteps, {
      message_template: "",
      delay_hours: type === "wait" ? 24 : 0,
      step_type: type,
      condition_type: type === "condition" ? "reply_received" : "",
      condition_config: {},
      on_true_step: null,
      on_false_step: null,
    }]);
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
          <h1 className="text-xl font-semibold text-foreground">Drip Sequences</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Event-triggered automated messaging. Fires on TG events like group joins, keywords, or inactivity.
          </p>
        </div>
        <Button size="sm" onClick={() => setShowCreate(!showCreate)}>
          <Plus className="mr-1 h-3.5 w-3.5" />
          New Drip
        </Button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-3">
          <h3 className="text-sm font-medium text-foreground">New Drip Sequence</h3>

          <div className="grid grid-cols-2 gap-3">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Sequence name (e.g. Welcome Drip)"
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
          </div>

          <Input
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            placeholder="Description (optional)"
            className="text-xs"
          />

          {/* Trigger event selector */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Trigger Event</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {TRIGGER_EVENTS.map((t) => (
                <button
                  key={t.value}
                  onClick={() => {
                    setNewTrigger(t.value);
                    setNewTriggerConfig({});
                  }}
                  className={cn(
                    "rounded-lg border p-2.5 text-left transition-colors",
                    newTrigger === t.value
                      ? "border-primary/40 bg-primary/10"
                      : "border-white/10 bg-white/[0.02] hover:border-white/20"
                  )}
                >
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <Zap className={cn("h-3 w-3", newTrigger === t.value ? "text-primary" : "text-muted-foreground")} />
                    <span className={cn("text-xs font-medium", newTrigger === t.value ? "text-foreground" : "text-muted-foreground")}>{t.label}</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground/70">{t.desc}</p>
                </button>
              ))}
            </div>

            {/* Trigger config */}
            {newTrigger === "keyword_match" && (
              <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
                <label className="text-[10px] text-muted-foreground block mb-1">
                  Keywords (comma-separated)
                </label>
                <Input
                  value={((newTriggerConfig.keywords as string[]) ?? []).join(", ")}
                  onChange={(e) => setNewTriggerConfig({
                    ...newTriggerConfig,
                    keywords: e.target.value.split(",").map((k) => k.trim()).filter(Boolean),
                  })}
                  placeholder="pricing, demo, partnership"
                  className="text-xs"
                />
              </div>
            )}

            {newTrigger === "engagement_drop" && (
              <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
                <label className="text-[10px] text-muted-foreground block mb-1">
                  Score threshold (trigger when drops below)
                </label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={(newTriggerConfig.threshold as number) ?? 30}
                  onChange={(e) => setNewTriggerConfig({
                    ...newTriggerConfig,
                    threshold: Number(e.target.value),
                  })}
                  className="text-xs w-24"
                />
              </div>
            )}
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
                  <textarea
                    value={step.message_template}
                    onChange={(e) => updateStep(i, "message_template", e.target.value)}
                    placeholder={`Step ${i + 1} message. Use {{contact_name}}, {{deal_name}}, {{stage}}.`}
                    rows={2}
                    className="w-full rounded-lg border border-white/10 bg-transparent px-2 py-1.5 text-xs font-mono resize-none"
                  />
                )}

                {step.step_type === "condition" && (
                  <div className="space-y-2 pl-7">
                    <div className="flex items-center gap-2 flex-wrap">
                      <GitBranch className="h-3.5 w-3.5 text-yellow-400 shrink-0" />
                      <select
                        value={step.condition_type}
                        onChange={(e) => {
                          setNewSteps((prev) => prev.map((s, idx) => idx === i
                            ? { ...s, condition_type: e.target.value, condition_config: {} }
                            : s));
                        }}
                        className="rounded border border-white/10 bg-transparent px-2 py-1 text-xs"
                      >
                        <option value="reply_received">Reply received</option>
                        <option value="no_reply_timeout">No reply (timeout)</option>
                        <option value="engagement_score">Engagement score ≥</option>
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
              <button onClick={() => addStep("message")} className="text-xs text-primary hover:underline flex items-center gap-1">
                <Plus className="h-3 w-3" /> Message
              </button>
              <button onClick={() => addStep("condition")} className="text-xs text-yellow-400 hover:underline flex items-center gap-1">
                <GitBranch className="h-3 w-3" /> Condition
              </button>
              <button onClick={() => addStep("wait")} className="text-xs text-muted-foreground hover:underline flex items-center gap-1">
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
              Create Drip
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
                    <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary flex items-center gap-1">
                      <Zap className="h-2.5 w-2.5" />
                      {TRIGGER_LABELS[seq.trigger_event] ?? seq.trigger_event}
                    </span>
                    {seq.board_type && (
                      <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        {seq.board_type}
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
                    {seq.description && (
                      <span className="text-muted-foreground/50 truncate max-w-[200px]">{seq.description}</span>
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
                              {step.delay_hours > 0 && (
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
            <Zap className="mx-auto h-8 w-8 text-muted-foreground/30" />
            <p className="mt-2 text-sm text-muted-foreground">
              No drip sequences. Create one to auto-message users on Telegram events.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
