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
  CheckCircle,
  MessageCircle,
  ArrowRight,
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
  step_count: number;
  enrollment_stats: EnrollmentStats;
  created_at: string;
  updated_at: string;
};

type Step = {
  id: string;
  step_number: number;
  delay_hours: number;
  message_template: string;
  step_type: string;
};

export default function OutreachPage() {
  const [sequences, setSequences] = React.useState<Sequence[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [expanded, setExpanded] = React.useState<string | null>(null);
  const [steps, setSteps] = React.useState<Step[]>([]);
  const [stepsLoading, setStepsLoading] = React.useState(false);
  const [showCreate, setShowCreate] = React.useState(false);

  // Create form
  const [newName, setNewName] = React.useState("");
  const [newDesc, setNewDesc] = React.useState("");
  const [newBoard, setNewBoard] = React.useState("");
  const [newSteps, setNewSteps] = React.useState([
    { message_template: "", delay_hours: 0 },
    { message_template: "", delay_hours: 24 },
    { message_template: "", delay_hours: 48 },
  ]);

  React.useEffect(() => {
    fetchSequences();
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

  async function handleCreate() {
    if (!newName.trim()) return;
    const validSteps = newSteps.filter((s) => s.message_template.trim());
    if (validSteps.length === 0) {
      toast.error("Add at least one step with a message");
      return;
    }

    const res = await fetch("/api/outreach/sequences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newName.trim(),
        description: newDesc || undefined,
        board_type: newBoard || undefined,
        steps: validSteps,
      }),
    });

    if (res.ok) {
      toast.success("Sequence created");
      setShowCreate(false);
      setNewName("");
      setNewDesc("");
      setNewBoard("");
      setNewSteps([
        { message_template: "", delay_hours: 0 },
        { message_template: "", delay_hours: 24 },
        { message_template: "", delay_hours: 48 },
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

  function addStep() {
    setNewSteps([...newSteps, { message_template: "", delay_hours: 24 }]);
  }

  function removeStep(index: number) {
    setNewSteps(newSteps.filter((_, i) => i !== index));
  }

  function updateStep(index: number, field: string, value: string | number) {
    setNewSteps(newSteps.map((s, i) => (i === index ? { ...s, [field]: value } : s)));
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
        <Button size="sm" onClick={() => setShowCreate(!showCreate)}>
          <Plus className="mr-1 h-3.5 w-3.5" />
          New Sequence
        </Button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-3">
          <h3 className="text-sm font-medium text-foreground">New Outreach Sequence</h3>

          <div className="grid grid-cols-2 gap-3">
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
          </div>

          <Input
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            placeholder="Description (optional)"
            className="text-xs"
          />

          {/* Steps */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">
              Steps ({newSteps.length})
            </p>
            {newSteps.map((step, i) => (
              <div key={i} className="flex items-start gap-2 rounded-lg border border-white/10 bg-white/[0.02] p-3">
                <div className="flex items-center gap-1.5 shrink-0 pt-1">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/20 text-primary text-[10px] font-bold">
                    {i + 1}
                  </span>
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
                </div>
                <textarea
                  value={step.message_template}
                  onChange={(e) => updateStep(i, "message_template", e.target.value)}
                  placeholder={`Step ${i + 1} message. Use {{contact_name}}, {{deal_name}}, {{stage}}. Defaults: {{contact_first_name|there}}`}
                  rows={2}
                  className="flex-1 rounded-lg border border-white/10 bg-transparent px-2 py-1.5 text-xs font-mono resize-none"
                />
                {newSteps.length > 1 && (
                  <button
                    onClick={() => removeStep(i)}
                    className="text-muted-foreground hover:text-red-400 shrink-0 pt-1"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
            <button
              onClick={addStep}
              className="text-xs text-primary hover:underline flex items-center gap-1"
            >
              <Plus className="h-3 w-3" /> Add step
            </button>
          </div>

          <div className="flex items-center gap-2 justify-end">
            <Button size="sm" variant="ghost" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleCreate}
              disabled={!newName.trim() || newSteps.every((s) => !s.message_template.trim())}
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
                            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/20 text-primary text-[10px] font-bold">
                              {step.step_number}
                            </div>
                            {i < steps.length - 1 && (
                              <div className="w-px h-8 bg-white/10 my-1" />
                            )}
                          </div>
                          <div className="flex-1 pb-3">
                            <div className="flex items-center gap-2 mb-1">
                              {step.step_number > 1 && (
                                <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                  <Clock className="h-3 w-3" />
                                  Wait {step.delay_hours}h
                                  <ArrowRight className="h-3 w-3" />
                                </span>
                              )}
                              <span className="flex items-center gap-1 text-[10px] text-primary">
                                <Send className="h-3 w-3" />
                                Send message
                              </span>
                            </div>
                            <pre className="rounded-lg bg-white/[0.03] border border-white/5 p-2 text-[10px] font-mono text-muted-foreground whitespace-pre-wrap">
                              {step.message_template}
                            </pre>
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
    </div>
  );
}
