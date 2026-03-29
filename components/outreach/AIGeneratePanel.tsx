"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Wand2, X, Sparkles } from "lucide-react";

interface AIGeneratePanelProps {
  onClose: () => void;
  onGenerated: (data: {
    name: string;
    board: string;
    tone: string;
    steps: Array<{
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
    }>;
  }) => void;
}

export function AIGeneratePanel({ onClose, onGenerated }: AIGeneratePanelProps) {
  const [aiGoal, setAiGoal] = React.useState("");
  const [aiGenBoard, setAiGenBoard] = React.useState("");
  const [aiGenTone, setAiGenTone] = React.useState("professional");
  const [aiGenSteps, setAiGenSteps] = React.useState(4);
  const [aiGenerating, setAiGenerating] = React.useState(false);

  async function handleAIGenerateSequence() {
    if (!aiGoal.trim()) return;
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
        onGenerated({
          name: aiGoal.slice(0, 60),
          board: aiGenBoard,
          tone: aiGenTone,
          steps: generated,
        });
        setAiGoal("");
      }
    } finally {
      setAiGenerating(false);
    }
  }

  return (
    <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Wand2 className="h-4 w-4 text-purple-400" />
          <h3 className="text-sm font-medium text-purple-400">AI Generate Sequence</h3>
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
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
  );
}
