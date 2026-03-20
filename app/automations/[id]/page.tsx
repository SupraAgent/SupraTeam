"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FlowCanvas } from "@/components/workflows/flow-canvas";
import {
  ArrowLeft,
  Zap,
  ZapOff,
  Save,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Workflow } from "@/lib/workflow-types";
import type { Node, Edge } from "@xyflow/react";

export default function WorkflowEditorPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [workflow, setWorkflow] = React.useState<Workflow | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [lastSaved, setLastSaved] = React.useState<string | null>(null);
  const [editingName, setEditingName] = React.useState(false);
  const [nameValue, setNameValue] = React.useState("");

  const fetchWorkflow = React.useCallback(async () => {
    try {
      const res = await fetch(`/api/workflows/${id}`);
      if (res.ok) {
        const data = await res.json();
        setWorkflow(data.workflow);
        setNameValue(data.workflow.name);
      } else {
        router.push("/automations");
      }
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  React.useEffect(() => {
    fetchWorkflow();
  }, [fetchWorkflow]);

  const handleSave = React.useCallback(
    async (nodes: Node[], edges: Edge[]) => {
      setSaving(true);
      try {
        // Detect trigger type from nodes
        const triggerNode = nodes.find((n) => n.type === "trigger");
        const triggerType = triggerNode
          ? (triggerNode.data as unknown as { triggerType?: string }).triggerType ?? null
          : null;

        await fetch(`/api/workflows/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nodes, edges, trigger_type: triggerType }),
        });
        setLastSaved(new Date().toLocaleTimeString());
      } finally {
        setSaving(false);
      }
    },
    [id]
  );

  async function handleNameSave() {
    if (!nameValue.trim() || nameValue === workflow?.name) {
      setEditingName(false);
      return;
    }
    await fetch(`/api/workflows/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: nameValue.trim() }),
    });
    setWorkflow((prev) => prev ? { ...prev, name: nameValue.trim() } : prev);
    setEditingName(false);
  }

  async function toggleActive() {
    if (!workflow) return;
    const res = await fetch(`/api/workflows/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !workflow.is_active }),
    });
    if (res.ok) {
      setWorkflow((prev) => prev ? { ...prev, is_active: !prev.is_active } : prev);
    }
  }

  if (loading) {
    return (
      <div className="h-[calc(100vh-3.5rem)] flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground/30" />
      </div>
    );
  }

  if (!workflow) return null;

  return (
    <div className="h-[calc(100vh-3.5rem)] flex flex-col -m-4 sm:-m-6">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-white/10 bg-white/[0.02] shrink-0">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => router.push("/automations")}
          className="h-8 w-8 p-0"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>

        {editingName ? (
          <Input
            value={nameValue}
            onChange={(e) => setNameValue(e.target.value)}
            onBlur={handleNameSave}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleNameSave();
              if (e.key === "Escape") { setEditingName(false); setNameValue(workflow.name); }
            }}
            className="text-sm h-8 w-64"
            autoFocus
          />
        ) : (
          <button
            onClick={() => setEditingName(true)}
            className="text-sm font-medium text-foreground hover:text-primary transition-colors"
          >
            {workflow.name}
          </button>
        )}

        <div className="flex items-center gap-2 ml-auto">
          {/* Save status */}
          <span className="text-[10px] text-muted-foreground/40">
            {saving ? (
              <span className="flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" /> Saving…
              </span>
            ) : lastSaved ? (
              `Saved at ${lastSaved}`
            ) : (
              ""
            )}
          </span>

          {/* Active toggle */}
          <button
            onClick={toggleActive}
            className={cn(
              "h-8 px-3 rounded-lg flex items-center gap-1.5 text-xs font-medium transition-colors",
              workflow.is_active
                ? "bg-primary/20 text-primary hover:bg-primary/30"
                : "bg-white/5 text-muted-foreground hover:bg-white/10"
            )}
          >
            {workflow.is_active ? <Zap className="h-3.5 w-3.5" /> : <ZapOff className="h-3.5 w-3.5" />}
            {workflow.is_active ? "Active" : "Inactive"}
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div className="flex-1 relative">
        <FlowCanvas
          initialNodes={(workflow.nodes ?? []) as Node[]}
          initialEdges={(workflow.edges ?? []) as Edge[]}
          onSave={handleSave}
          saving={saving}
        />
      </div>
    </div>
  );
}
