"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  GripVertical,
  Plus,
  Trash2,
  Save,
  ChevronUp,
  ChevronDown,
} from "lucide-react";

interface Stage {
  id?: string;
  name: string;
  position: number;
  color: string;
}

const STAGE_COLORS = [
  "#6366f1", "#8b5cf6", "#a855f7", "#3b82f6", "#06b6d4",
  "#10b981", "#0cce6b", "#f59e0b", "#ef4444", "#ec4899",
];

interface StageEditorProps {
  /** Hide the section header (useful when rendered inside a slide-over with its own title) */
  compact?: boolean;
}

export function StageEditor({ compact }: StageEditorProps) {
  const [stages, setStages] = React.useState<Stage[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [msg, setMsg] = React.useState("");

  React.useEffect(() => {
    fetch("/api/pipeline")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.stages) setStages(data.stages);
      })
      .finally(() => setLoading(false));
  }, []);

  function moveStage(index: number, direction: -1 | 1) {
    const newStages = [...stages];
    const target = index + direction;
    if (target < 0 || target >= newStages.length) return;
    [newStages[index], newStages[target]] = [newStages[target], newStages[index]];
    setStages(newStages.map((s, i) => ({ ...s, position: i + 1 })));
  }

  function updateStage(index: number, updates: Partial<Stage>) {
    setStages((prev) => prev.map((s, i) => (i === index ? { ...s, ...updates } : s)));
  }

  function addStage() {
    setStages((prev) => [
      ...prev,
      {
        name: "",
        position: prev.length + 1,
        color: STAGE_COLORS[prev.length % STAGE_COLORS.length],
      },
    ]);
  }

  function removeStage(index: number) {
    setStages((prev) => prev.filter((_, i) => i !== index).map((s, i) => ({ ...s, position: i + 1 })));
  }

  async function saveStages() {
    setSaving(true);
    setMsg("");
    try {
      const res = await fetch("/api/pipeline/stages", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stages }),
      });
      if (res.ok) {
        const data = await res.json();
        setStages(data.stages);
        setMsg("Stages saved");
      } else {
        setMsg("Failed to save");
      }
    } finally {
      setSaving(false);
      setTimeout(() => setMsg(""), 3000);
    }
  }

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="h-10 rounded-lg bg-white/5 animate-pulse" />
        <div className="h-10 rounded-lg bg-white/5 animate-pulse" />
        <div className="h-10 rounded-lg bg-white/5 animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {!compact && (
        <div>
          <h2 className="text-base font-medium text-foreground">Pipeline Stages</h2>
          <p className="text-xs text-muted-foreground">
            Add, remove, rename, and reorder stages. Changes apply to all boards.
          </p>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {msg && <span className="text-xs text-primary">{msg}</span>}
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={addStage}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            Add Stage
          </Button>
          <Button size="sm" onClick={saveStages} disabled={saving}>
            <Save className="mr-1 h-3.5 w-3.5" />
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        {stages.map((stage, i) => (
          <div
            key={stage.id ?? `new-${i}`}
            className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2"
          >
            <div className="flex flex-col gap-0.5">
              <button
                onClick={() => moveStage(i, -1)}
                disabled={i === 0}
                className="text-muted-foreground hover:text-foreground disabled:opacity-20"
              >
                <ChevronUp className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => moveStage(i, 1)}
                disabled={i === stages.length - 1}
                className="text-muted-foreground hover:text-foreground disabled:opacity-20"
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
            </div>

            <GripVertical className="h-4 w-4 text-muted-foreground/50" />

            <div
              className="h-4 w-4 rounded-full shrink-0 border border-white/10"
              style={{ backgroundColor: stage.color }}
            />

            <Input
              value={stage.name}
              onChange={(e) => updateStage(i, { name: e.target.value })}
              placeholder="Stage name"
              className="flex-1"
            />

            <div className="flex items-center gap-1">
              {STAGE_COLORS.slice(0, 5).map((c) => (
                <button
                  key={c}
                  onClick={() => updateStage(i, { color: c })}
                  className="h-5 w-5 rounded-full border border-white/10 transition hover:scale-110"
                  style={{
                    backgroundColor: c,
                    outline: stage.color === c ? "2px solid white" : "none",
                    outlineOffset: "1px",
                  }}
                />
              ))}
            </div>

            <span className="text-xs text-muted-foreground/50 w-6 text-center">{i + 1}</span>

            <button
              onClick={() => removeStage(i)}
              className="text-muted-foreground hover:text-red-400 transition"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}

        {stages.length === 0 && (
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-6 text-center text-sm text-muted-foreground">
            No stages defined. Add your first stage above.
          </div>
        )}
      </div>
    </div>
  );
}
