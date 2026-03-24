"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FlowCanvas, BuilderProvider } from "../../../packages/automation-builder/dist/index";
import "@xyflow/react/dist/style.css";
import { CRM_REGISTRY, CRM_ICON_MAP } from "@/lib/workflow-registry";
import {
  ArrowLeft,
  Zap,
  ZapOff,
  Play,
  Loader2,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  XCircle,
  PauseCircle,
  Clock,
  BookmarkPlus,
  X,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { timeAgo } from "@/lib/utils";
import type { Workflow, WorkflowRun } from "@/lib/workflow-db-types";
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

  // Run state
  const [running, setRunning] = React.useState(false);
  const [runMsg, setRunMsg] = React.useState("");
  const [showRuns, setShowRuns] = React.useState(false);
  const [runs, setRuns] = React.useState<WorkflowRun[]>([]);
  const [expandedRun, setExpandedRun] = React.useState<string | null>(null);

  // Save as template state
  const [showSaveTemplate, setShowSaveTemplate] = React.useState(false);
  const [templateName, setTemplateName] = React.useState("");
  const [templateDesc, setTemplateDesc] = React.useState("");
  const [templateTags, setTemplateTags] = React.useState("");
  const [savingTemplate, setSavingTemplate] = React.useState(false);

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

  async function handleRun() {
    setRunning(true);
    setRunMsg("");
    try {
      const res = await fetch(`/api/workflows/${id}/run`, { method: "POST" });
      const data = await res.json();
      if (data.ok) {
        setRunMsg(`Run ${data.status} (${data.run_id.slice(0, 8)})`);
        // Refresh runs if panel is open
        if (showRuns) fetchRuns();
        // Update run count
        setWorkflow((prev) => prev ? { ...prev, run_count: prev.run_count + 1, last_run_at: new Date().toISOString() } : prev);
      } else {
        setRunMsg(`Failed: ${data.error}`);
      }
    } catch (err) {
      setRunMsg("Run failed");
    } finally {
      setRunning(false);
      setTimeout(() => setRunMsg(""), 4000);
    }
  }

  async function fetchRuns() {
    const res = await fetch(`/api/workflows/${id}/runs`);
    if (res.ok) {
      const data = await res.json();
      setRuns(data.runs ?? []);
    }
  }

  function toggleRuns() {
    if (!showRuns) fetchRuns();
    setShowRuns(!showRuns);
  }

  function openSaveTemplate() {
    setTemplateName(workflow?.name ?? "");
    setTemplateDesc("");
    setTemplateTags("");
    setShowSaveTemplate(true);
  }

  async function handleSaveTemplate() {
    if (!templateName.trim()) return;
    setSavingTemplate(true);
    try {
      // Get current canvas state
      const canvasState = (window as unknown as Record<string, unknown>).__supracrm_canvas_state as
        | { nodes: unknown[]; edges: unknown[] }
        | undefined;
      if (!canvasState) {
        setRunMsg("No canvas data available");
        setTimeout(() => setRunMsg(""), 3000);
        return;
      }

      const tags = templateTags
        .split(",")
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean);

      const triggerNode = (canvasState.nodes as { type?: string; data?: { triggerType?: string } }[])
        .find((n) => n.type === "trigger");

      const res = await fetch("/api/workflow-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: templateName.trim(),
          description: templateDesc.trim() || null,
          tags,
          nodes: canvasState.nodes,
          edges: canvasState.edges,
          trigger_type: triggerNode?.data?.triggerType ?? null,
        }),
      });

      if (res.ok) {
        setRunMsg("Template saved!");
        setShowSaveTemplate(false);
      } else {
        const data = await res.json();
        setRunMsg(`Error: ${data.error}`);
      }
    } finally {
      setSavingTemplate(false);
      setTimeout(() => setRunMsg(""), 3000);
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
          {/* Run message */}
          {runMsg && (
            <span className="text-[10px] text-primary">{runMsg}</span>
          )}

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

          {/* Save as template */}
          <button
            onClick={openSaveTemplate}
            className="h-8 px-2.5 rounded-lg text-[11px] text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors flex items-center gap-1"
            title="Save as template"
          >
            <BookmarkPlus className="h-3 w-3" />
            Template
          </button>

          {/* Runs toggle */}
          <button
            onClick={toggleRuns}
            className="h-8 px-2.5 rounded-lg text-[11px] text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors flex items-center gap-1"
          >
            <Clock className="h-3 w-3" />
            Runs
            {workflow.run_count > 0 && (
              <span className="text-[9px] bg-white/10 px-1.5 py-0.5 rounded">{workflow.run_count}</span>
            )}
          </button>

          {/* Run button */}
          <Button
            size="sm"
            onClick={handleRun}
            disabled={running}
            className="h-8 gap-1.5"
          >
            {running ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Play className="h-3.5 w-3.5" />
            )}
            Run
          </Button>

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

      {/* Save as template form */}
      {showSaveTemplate && (
        <div className="px-4 py-3 border-b border-primary/20 bg-primary/5 shrink-0">
          <div className="flex items-start gap-3">
            <div className="flex-1 space-y-2">
              <div className="flex items-center gap-2">
                <Input
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  placeholder="Template name"
                  className="text-sm h-8 flex-1"
                  autoFocus
                  onKeyDown={(e) => e.key === "Enter" && handleSaveTemplate()}
                />
                <Input
                  value={templateTags}
                  onChange={(e) => setTemplateTags(e.target.value)}
                  placeholder="Tags (comma-separated)"
                  className="text-sm h-8 w-48"
                />
              </div>
              <Input
                value={templateDesc}
                onChange={(e) => setTemplateDesc(e.target.value)}
                placeholder="Description (optional)"
                className="text-sm h-8"
              />
            </div>
            <div className="flex items-center gap-1.5 pt-0.5">
              <Button
                size="sm"
                className="h-8 gap-1"
                onClick={handleSaveTemplate}
                disabled={!templateName.trim() || savingTemplate}
              >
                {savingTemplate ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                Save
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 w-8 p-0"
                onClick={() => setShowSaveTemplate(false)}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Canvas + optional runs panel */}
      <div className="flex-1 relative flex">
        <div className="flex-1">
          <BuilderProvider registry={CRM_REGISTRY} iconMap={CRM_ICON_MAP}>
            <FlowCanvas
              initialNodes={(workflow.nodes ?? []) as Node[]}
              initialEdges={(workflow.edges ?? []) as Edge[]}
              onSave={handleSave}
              saving={saving}
            />
          </BuilderProvider>
        </div>

        {/* Runs history panel */}
        {showRuns && (
          <div className="w-80 shrink-0 border-l border-white/10 bg-white/[0.02] overflow-y-auto">
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
              <p className="text-xs font-semibold text-foreground">Execution History</p>
              <button
                onClick={fetchRuns}
                className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
              >
                Refresh
              </button>
            </div>

            {runs.length === 0 ? (
              <div className="p-4 text-center">
                <p className="text-xs text-muted-foreground/50">No runs yet</p>
              </div>
            ) : (
              <div className="divide-y divide-white/5">
                {runs.map((run) => (
                  <div key={run.id} className="px-4 py-2.5">
                    <button
                      onClick={() => setExpandedRun(expandedRun === run.id ? null : run.id)}
                      className="w-full flex items-center gap-2 text-left"
                    >
                      <RunStatusIcon status={run.status} />
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-medium text-foreground">
                          {run.status.charAt(0).toUpperCase() + run.status.slice(1)}
                        </p>
                        <p className="text-[9px] text-muted-foreground/50">
                          {timeAgo(run.started_at)}
                          {run.completed_at && ` · ${getDuration(run.started_at, run.completed_at)}`}
                        </p>
                      </div>
                      {expandedRun === run.id ? (
                        <ChevronUp className="h-3 w-3 text-muted-foreground/30" />
                      ) : (
                        <ChevronDown className="h-3 w-3 text-muted-foreground/30" />
                      )}
                    </button>

                    {expandedRun === run.id && (
                      <div className="mt-2 space-y-2">
                        {run.error && (
                          <div className="rounded-lg bg-red-500/5 border border-red-500/10 px-2.5 py-1.5">
                            <p className="text-[10px] text-red-400">{run.error}</p>
                          </div>
                        )}

                        {run.trigger_event && (
                          <div className="space-y-1">
                            <p className="text-[9px] text-muted-foreground/50 uppercase tracking-wider">Trigger</p>
                            <p className="text-[10px] text-muted-foreground">
                              {(run.trigger_event as Record<string, unknown>).type as string ?? "manual"}
                            </p>
                          </div>
                        )}

                        {run.node_outputs && Object.keys(run.node_outputs).length > 0 && (
                          <div className="space-y-1">
                            <p className="text-[9px] text-muted-foreground/50 uppercase tracking-wider">Node Outputs</p>
                            <pre className="text-[9px] text-muted-foreground/70 bg-white/[0.03] rounded-lg p-2 overflow-x-auto whitespace-pre-wrap max-h-40">
                              {JSON.stringify(
                                filterInternalKeys(run.node_outputs),
                                null,
                                2
                              )}
                            </pre>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function RunStatusIcon({ status }: { status: string }) {
  switch (status) {
    case "completed":
      return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />;
    case "failed":
      return <XCircle className="h-3.5 w-3.5 text-red-400 shrink-0" />;
    case "paused":
      return <PauseCircle className="h-3.5 w-3.5 text-yellow-400 shrink-0" />;
    case "running":
      return <Loader2 className="h-3.5 w-3.5 text-blue-400 animate-spin shrink-0" />;
    default:
      return <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />;
  }
}

function getDuration(start: string, end: string): string {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms / 60000)}m`;
}

function filterInternalKeys(obj: Record<string, unknown>): Record<string, unknown> {
  const filtered: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (!k.startsWith("_")) filtered[k] = v;
  }
  return filtered;
}
