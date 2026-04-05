"use client";

import * as React from "react";
import { Zap, Inbox, Users, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { SequenceCanvas } from "@/components/telegram-sequences/sequence-canvas";
import { SequenceList } from "@/components/telegram-sequences/sequence-list";
import type { TGSequence, TriggerType } from "@/components/telegram-sequences/types";
import type { Edge, Node } from "@xyflow/react";

type ViewMode = "list" | "canvas";
type TabFilter = "all" | "outreach" | "drip";

export default function TelegramSequencesPage() {
  const [view, setView] = React.useState<ViewMode>("list");
  const [tab, setTab] = React.useState<TabFilter>("all");
  const [sequences, setSequences] = React.useState<TGSequence[]>([]);
  const [editingSequence, setEditingSequence] = React.useState<TGSequence | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [pipelineStages, setPipelineStages] = React.useState<Array<{ id: string; name: string }>>([]);

  React.useEffect(() => {
    fetchSequences();
    fetchPipelineStages();
  }, []);

  async function fetchSequences() {
    try {
      const res = await fetch("/api/telegram/sequences");
      if (res.ok) {
        const json = await res.json();
        setSequences(json.data ?? []);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  async function fetchPipelineStages() {
    try {
      const res = await fetch("/api/pipeline/stages");
      if (res.ok) {
        const json = await res.json();
        setPipelineStages(
          (json.data ?? []).map((s: Record<string, unknown>) => ({
            id: String(s.id),
            name: String(s.name),
          }))
        );
      }
    } catch {
      // ignore
    }
  }

  async function handleSave(data: {
    name: string;
    description: string;
    trigger_type: TriggerType;
    trigger_config: Record<string, unknown>;
    nodes: Node[];
    edges: Edge[];
  }) {
    setSaving(true);
    try {
      const method = editingSequence ? "PUT" : "POST";
      const body = editingSequence ? { ...data, id: editingSequence.id } : data;
      const res = await fetch("/api/telegram/sequences", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        toast.success(editingSequence ? "Sequence updated" : "Sequence created");
        await fetchSequences();
        setView("list");
        setEditingSequence(null);
      } else {
        const json = await res.json().catch(() => ({}));
        toast.error(json.error ?? "Failed to save sequence");
      }
    } catch {
      toast.error("Failed to save sequence");
    } finally {
      setSaving(false);
    }
  }

  function handleEdit(seq: TGSequence) {
    setEditingSequence(seq);
    setView("canvas");
  }

  function handleCreate() {
    setEditingSequence(null);
    setView("canvas");
  }

  async function handleDuplicate(seq: TGSequence) {
    const duplicated: TGSequence = {
      ...seq,
      id: "",
      name: `${seq.name} (copy)`,
      is_active: false,
    };
    setEditingSequence(duplicated);
    setView("canvas");
  }

  async function handleToggleActive(seq: TGSequence) {
    const res = await fetch("/api/telegram/sequences", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: seq.id,
        name: seq.name,
        description: seq.description,
        trigger_type: seq.trigger_type,
        trigger_config: seq.trigger_config,
        is_active: !seq.is_active,
        nodes: [],
        edges: [],
      }),
    });

    if (res.ok) {
      toast.success(seq.is_active ? "Sequence paused" : "Sequence activated");
      fetchSequences();
    } else {
      toast.error("Failed to update sequence status");
    }
  }

  async function handleDelete(seq: TGSequence) {
    if (!confirm(`Delete "${seq.name}"? This cannot be undone.`)) return;

    const res = await fetch(`/api/telegram/sequences?id=${seq.id}`, {
      method: "DELETE",
    });

    if (res.ok) {
      toast.success("Sequence deleted");
      fetchSequences();
    } else {
      toast.error("Failed to delete sequence");
    }
  }

  const filtered = sequences.filter((s) => {
    if (tab === "outreach") return s.trigger_type === "manual" || s.trigger_type === "keyword_match";
    if (tab === "drip") return s.trigger_type === "group_join" || s.trigger_type === "first_message";
    return true;
  });

  if (view === "canvas") {
    return (
      <div className="h-[calc(100vh-3.5rem)]">
        <SequenceCanvas
          sequence={editingSequence}
          onSave={handleSave}
          onBack={() => { setView("list"); setEditingSequence(null); }}
          saving={saving}
          pipelineStages={pipelineStages}
        />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Telegram Sequences</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Outreach and drip sequences with A/B testing and conditional branching
          </p>
        </div>
        <Button size="sm" onClick={handleCreate}>
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          New Sequence
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-white/[0.03] p-1 rounded-lg w-fit">
        {(["all", "outreach", "drip"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              tab === t
                ? "bg-white/10 text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "all" && <Zap className="h-3 w-3 inline mr-1" />}
            {t === "outreach" && <Inbox className="h-3 w-3 inline mr-1" />}
            {t === "drip" && <Users className="h-3 w-3 inline mr-1" />}
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      <SequenceList
        sequences={filtered}
        loading={loading}
        onEdit={handleEdit}
        onCreate={handleCreate}
        onDuplicate={handleDuplicate}
        onToggleActive={handleToggleActive}
        onDelete={handleDelete}
      />
    </div>
  );
}
