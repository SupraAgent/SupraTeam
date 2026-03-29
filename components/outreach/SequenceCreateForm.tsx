"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Plus,
  Trash2,
  Clock,
  GitBranch,
  Timer,
  FlaskConical,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { NewStep } from "./types";
import { createDefaultStep } from "./types";

interface SequenceCreateFormProps {
  initialSteps?: NewStep[];
  initialName?: string;
  initialBoard?: string;
  initialTone?: string;
  pipelineStages: Array<{ id: string; name: string }>;
  onClose: () => void;
  onCreated: () => void;
}

export function SequenceCreateForm({
  initialSteps,
  initialName = "",
  initialBoard = "",
  initialTone = "professional",
  pipelineStages,
  onClose,
  onCreated,
}: SequenceCreateFormProps) {
  const [newName, setNewName] = React.useState(initialName);
  const [newDesc, setNewDesc] = React.useState("");
  const [newBoard, setNewBoard] = React.useState(initialBoard);
  const [newTone, setNewTone] = React.useState(initialTone);
  const [newGoalStage, setNewGoalStage] = React.useState("");
  const [newSteps, setNewSteps] = React.useState<NewStep[]>(
    initialSteps ?? [
      createDefaultStep({ delay_hours: 0 }),
      createDefaultStep({ delay_hours: 24 }),
      createDefaultStep({ delay_hours: 48 }),
    ]
  );

  // AI rewrite/variant states
  const [rewritingStep, setRewritingStep] = React.useState<number | null>(null);
  const [generatingVariant, setGeneratingVariant] = React.useState<number | null>(null);

  // Sync initial values when they change (from AI generate)
  React.useEffect(() => {
    if (initialName) setNewName(initialName);
  }, [initialName]);
  React.useEffect(() => {
    if (initialBoard) setNewBoard(initialBoard);
  }, [initialBoard]);
  React.useEffect(() => {
    if (initialTone) setNewTone(initialTone);
  }, [initialTone]);
  React.useEffect(() => {
    if (initialSteps) setNewSteps(initialSteps);
  }, [initialSteps]);

  function updateStep(index: number, field: string, value: string | number | null | Record<string, unknown>) {
    setNewSteps(newSteps.map((s, i) => (i === index ? { ...s, [field]: value } : s)));
  }

  function updateStepConfig(index: number, configKey: string, configValue: unknown) {
    setNewSteps(newSteps.map((s, i) => (
      i === index ? { ...s, condition_config: { ...s.condition_config, [configKey]: configValue } } : s
    )));
  }

  function addStep(type: string = "message") {
    setNewSteps([...newSteps, createDefaultStep({
      step_type: type,
      condition_type: type === "condition" ? "reply_received" : "",
      split_percentage: type === "condition" ? 50 : null,
    })]);
  }

  function removeStep(index: number) {
    setNewSteps(newSteps.filter((_, i) => i !== index));
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
      onCreated();
    } else {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error ?? "Failed to create sequence");
    }
  }

  return (
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
                    <option value="engagement_score">Engagement score &ge;</option>
                    <option value="deal_stage">Deal in stage</option>
                    <option value="message_keyword">Message contains keyword</option>
                    <option value="days_since_enroll">Days since enrollment &ge;</option>
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
                    <span className="text-[10px] text-emerald-400 shrink-0">If YES &rarr;</span>
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
                    <span className="text-[10px] text-red-400 shrink-0">If NO &rarr;</span>
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
        <Button size="sm" variant="ghost" onClick={onClose}>
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
  );
}
