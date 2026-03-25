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
  Trash2,
  RotateCcw,
  Copy,
  Search,
  Star,
  Bell,
  BellOff,
  Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { timeAgo } from "@/lib/utils";
import type { Workflow, WorkflowRun, WorkflowAlert } from "@/lib/workflow-db-types";
import type { Node, Edge } from "@xyflow/react";

type StatusFilter = "all" | "completed" | "failed" | "running" | "paused";

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

  // Enhanced sidebar state
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>("all");
  const [searchQuery, setSearchQuery] = React.useState("");
  const [showSearch, setShowSearch] = React.useState(false);
  const [pinnedRuns, setPinnedRuns] = React.useState<Set<string>>(() => {
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem(`pinned-runs-${id}`);
        return stored ? new Set(JSON.parse(stored)) : new Set();
      } catch { return new Set(); }
    }
    return new Set();
  });
  const [confirmDelete, setConfirmDelete] = React.useState<string | null>(null);
  const [confirmBulkDelete, setConfirmBulkDelete] = React.useState<"all" | "failed" | null>(null);
  const [expandedNodes, setExpandedNodes] = React.useState<Set<string>>(new Set());
  const [copiedId, setCopiedId] = React.useState<string | null>(null);

  // Save as template state
  const [showSaveTemplate, setShowSaveTemplate] = React.useState(false);
  const [templateName, setTemplateName] = React.useState("");
  const [templateDesc, setTemplateDesc] = React.useState("");
  const [templateTags, setTemplateTags] = React.useState("");
  const [savingTemplate, setSavingTemplate] = React.useState(false);

  // Alerts state
  const [alerts, setAlerts] = React.useState<WorkflowAlert[]>([]);
  const [showAlerts, setShowAlerts] = React.useState(false);
  const [newAlertType, setNewAlertType] = React.useState<string>("failure");
  const [newAlertChannel, setNewAlertChannel] = React.useState<string>("in_app");

  // Auto-refresh polling ref
  const pollRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  // Persist pinned runs
  React.useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem(`pinned-runs-${id}`, JSON.stringify([...pinnedRuns]));
    }
  }, [pinnedRuns, id]);

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

  // Auto-refresh: poll every 2s when any run is "running"
  React.useEffect(() => {
    const hasRunning = runs.some((r) => r.status === "running");
    if (hasRunning && showRuns) {
      pollRef.current = setInterval(() => {
        fetchRuns();
      }, 2000);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runs, showRuns]);

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

  async function handleRun(triggerEvent?: Record<string, unknown>) {
    setRunning(true);
    setRunMsg("");
    try {
      const res = await fetch(`/api/workflows/${id}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(triggerEvent ?? {}),
      });
      const data = await res.json();
      if (data.ok) {
        setRunMsg(`Run ${data.status} (${data.run_id.slice(0, 8)})`);
        if (showRuns) fetchRuns();
        setWorkflow((prev) => prev ? { ...prev, run_count: prev.run_count + 1, last_run_at: new Date().toISOString() } : prev);
      } else {
        setRunMsg(`Failed: ${data.error}`);
      }
    } catch {
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
    if (!showRuns) { fetchRuns(); fetchAlerts(); }
    setShowRuns(!showRuns);
  }

  async function fetchAlerts() {
    const res = await fetch(`/api/workflows/alerts?workflow_id=${id}`);
    if (res.ok) {
      const data = await res.json();
      setAlerts(data.alerts ?? []);
    }
  }

  async function createAlert() {
    const res = await fetch("/api/workflows/alerts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workflow_id: id, alert_type: newAlertType, channel: newAlertChannel }),
    });
    if (res.ok) {
      fetchAlerts();
      setShowAlerts(false);
    }
  }

  async function deleteAlert(alertId: string) {
    const res = await fetch(`/api/workflows/alerts?id=${alertId}`, { method: "DELETE" });
    if (res.ok) {
      setAlerts((prev) => prev.filter((a) => a.id !== alertId));
    }
  }

  async function deleteRun(runId: string) {
    const res = await fetch(`/api/workflows/${id}/runs?run_id=${runId}`, { method: "DELETE" });
    if (res.ok) {
      setRuns((prev) => prev.filter((r) => r.id !== runId));
      setConfirmDelete(null);
      setPinnedRuns((prev) => { const next = new Set(prev); next.delete(runId); return next; });
    }
  }

  async function bulkDelete(mode: "all" | "failed") {
    const res = await fetch(`/api/workflows/${id}/runs?mode=${mode}`, { method: "DELETE" });
    if (res.ok) {
      if (mode === "all") {
        setRuns([]);
        setPinnedRuns(new Set());
      } else {
        setRuns((prev) => prev.filter((r) => r.status !== "failed"));
      }
      setConfirmBulkDelete(null);
    }
  }

  function rerunFromHistory(run: WorkflowRun) {
    const triggerEvent = run.trigger_event as Record<string, unknown> | null;
    handleRun(triggerEvent ? { deal_id: triggerEvent.dealId } : undefined);
  }

  function togglePin(runId: string) {
    setPinnedRuns((prev) => {
      const next = new Set(prev);
      if (next.has(runId)) next.delete(runId);
      else next.add(runId);
      return next;
    });
  }

  function toggleNodeExpand(nodeKey: string) {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(nodeKey)) next.delete(nodeKey);
      else next.add(nodeKey);
      return next;
    });
  }

  async function copyToClipboard(text: string, id: string) {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  }

  // Filter and search runs
  const filteredRuns = React.useMemo(() => {
    let result = runs;
    if (statusFilter !== "all") {
      result = result.filter((r) => r.status === statusFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((r) => {
        if (r.error?.toLowerCase().includes(q)) return true;
        if (r.id.toLowerCase().includes(q)) return true;
        const te = r.trigger_event as Record<string, unknown> | null;
        if (te && JSON.stringify(te).toLowerCase().includes(q)) return true;
        if (r.node_outputs && JSON.stringify(r.node_outputs).toLowerCase().includes(q)) return true;
        return false;
      });
    }
    // Sort pinned first
    return result.sort((a, b) => {
      const ap = pinnedRuns.has(a.id) ? 0 : 1;
      const bp = pinnedRuns.has(b.id) ? 0 : 1;
      if (ap !== bp) return ap - bp;
      return 0; // preserve existing order (by started_at desc from API)
    });
  }, [runs, statusFilter, searchQuery, pinnedRuns]);

  // Status counts for filter chips
  const statusCounts = React.useMemo(() => {
    const counts: Record<string, number> = { all: runs.length, completed: 0, failed: 0, running: 0, paused: 0 };
    for (const r of runs) {
      if (counts[r.status] !== undefined) counts[r.status]++;
    }
    return counts;
  }, [runs]);

  // Duration stats for sparkline
  const durationData = React.useMemo(() => {
    return runs
      .filter((r) => r.completed_at && r.started_at)
      .slice(0, 20)
      .reverse()
      .map((r) => ({
        id: r.id,
        ms: new Date(r.completed_at!).getTime() - new Date(r.started_at).getTime(),
        status: r.status,
      }));
  }, [runs]);

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
          {runMsg && (
            <span className="text-[10px] text-primary">{runMsg}</span>
          )}

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

          <button
            onClick={openSaveTemplate}
            className="h-8 px-2.5 rounded-lg text-[11px] text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors flex items-center gap-1"
            title="Save as template"
          >
            <BookmarkPlus className="h-3 w-3" />
            Template
          </button>

          <button
            onClick={toggleRuns}
            className={cn(
              "h-8 px-2.5 rounded-lg text-[11px] transition-colors flex items-center gap-1",
              showRuns
                ? "text-primary bg-primary/10"
                : "text-muted-foreground hover:text-foreground hover:bg-white/5"
            )}
          >
            <Clock className="h-3 w-3" />
            Runs
            {workflow.run_count > 0 && (
              <span className="text-[9px] bg-white/10 px-1.5 py-0.5 rounded">{workflow.run_count}</span>
            )}
          </button>

          <Button
            size="sm"
            onClick={() => handleRun()}
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
          <div className="w-96 shrink-0 border-l border-white/10 bg-white/[0.02] flex flex-col overflow-hidden">
            {/* Header */}
            <div className="px-4 py-3 border-b border-white/10 shrink-0">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-foreground">Execution History</p>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setShowSearch(!showSearch)}
                    className={cn(
                      "h-6 w-6 rounded flex items-center justify-center transition-colors",
                      showSearch ? "bg-white/10 text-foreground" : "text-muted-foreground/50 hover:text-foreground"
                    )}
                    title="Search runs"
                  >
                    <Search className="h-3 w-3" />
                  </button>
                  <button
                    onClick={fetchRuns}
                    className="text-[10px] text-muted-foreground hover:text-foreground transition-colors px-1.5"
                  >
                    Refresh
                  </button>
                </div>
              </div>

              {/* Search bar */}
              {showSearch && (
                <div className="mb-2">
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search errors, IDs, outputs..."
                    className="text-[11px] h-7"
                    autoFocus
                  />
                </div>
              )}

              {/* Filter chips */}
              <div className="flex items-center gap-1 flex-wrap">
                {(["all", "completed", "failed", "running", "paused"] as StatusFilter[]).map((s) => (
                  <button
                    key={s}
                    onClick={() => setStatusFilter(s)}
                    className={cn(
                      "px-2 py-0.5 rounded-full text-[9px] font-medium transition-colors",
                      statusFilter === s
                        ? s === "all" ? "bg-white/15 text-foreground"
                        : s === "completed" ? "bg-emerald-500/20 text-emerald-400"
                        : s === "failed" ? "bg-red-500/20 text-red-400"
                        : s === "running" ? "bg-blue-500/20 text-blue-400"
                        : "bg-yellow-500/20 text-yellow-400"
                        : "bg-white/5 text-muted-foreground/50 hover:bg-white/10"
                    )}
                  >
                    {s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
                    {statusCounts[s] > 0 && (
                      <span className="ml-1 opacity-60">{statusCounts[s]}</span>
                    )}
                  </button>
                ))}
              </div>

              {/* Bulk actions */}
              {runs.length > 0 && (
                <div className="flex items-center gap-2 mt-2 pt-2 border-t border-white/5">
                  {confirmBulkDelete ? (
                    <div className="flex items-center gap-1.5 text-[10px]">
                      <span className="text-red-400">
                        Delete {confirmBulkDelete === "all" ? "all" : "failed"} runs?
                      </span>
                      <button
                        onClick={() => bulkDelete(confirmBulkDelete)}
                        className="px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 hover:bg-red-500/30"
                      >
                        Yes
                      </button>
                      <button
                        onClick={() => setConfirmBulkDelete(null)}
                        className="px-1.5 py-0.5 rounded bg-white/5 text-muted-foreground hover:bg-white/10"
                      >
                        No
                      </button>
                    </div>
                  ) : (
                    <>
                      <button
                        onClick={() => setConfirmBulkDelete("all")}
                        className="text-[9px] text-muted-foreground/40 hover:text-red-400 transition-colors"
                      >
                        Clear All
                      </button>
                      {statusCounts.failed > 0 && (
                        <button
                          onClick={() => setConfirmBulkDelete("failed")}
                          className="text-[9px] text-muted-foreground/40 hover:text-red-400 transition-colors"
                        >
                          Clear Failed ({statusCounts.failed})
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Duration sparkline */}
            {durationData.length >= 3 && (
              <div className="px-4 py-2 border-b border-white/5 shrink-0">
                <p className="text-[9px] text-muted-foreground/40 uppercase tracking-wider mb-1.5">
                  Duration Trend (last {durationData.length})
                </p>
                <DurationSparkline data={durationData} />
              </div>
            )}

            {/* Runs list */}
            <div className="flex-1 overflow-y-auto">
              {filteredRuns.length === 0 ? (
                <div className="p-4 text-center">
                  <p className="text-xs text-muted-foreground/50">
                    {runs.length === 0 ? "No runs yet" : "No matching runs"}
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-white/5">
                  {filteredRuns.map((run) => (
                    <RunCard
                      key={run.id}
                      run={run}
                      expanded={expandedRun === run.id}
                      pinned={pinnedRuns.has(run.id)}
                      confirmingDelete={confirmDelete === run.id}
                      expandedNodes={expandedNodes}
                      copiedId={copiedId}
                      onToggleExpand={() => setExpandedRun(expandedRun === run.id ? null : run.id)}
                      onTogglePin={() => togglePin(run.id)}
                      onDelete={() => deleteRun(run.id)}
                      onConfirmDelete={() => setConfirmDelete(run.id)}
                      onCancelDelete={() => setConfirmDelete(null)}
                      onRerun={() => rerunFromHistory(run)}
                      onToggleNode={toggleNodeExpand}
                      onCopy={copyToClipboard}
                    />
                  ))}
                </div>
              )}

              {/* Alerts section */}
              <div className="border-t border-white/10 shrink-0">
                <button
                  onClick={() => { setShowAlerts(!showAlerts); if (!showAlerts) fetchAlerts(); }}
                  className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-white/[0.02] transition-colors"
                >
                  <div className="flex items-center gap-1.5">
                    <Bell className="h-3 w-3 text-muted-foreground/50" />
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Alerts</span>
                    {alerts.length > 0 && (
                      <span className="text-[9px] bg-white/10 px-1.5 py-0.5 rounded">{alerts.length}</span>
                    )}
                  </div>
                  {showAlerts ? <ChevronUp className="h-3 w-3 text-muted-foreground/30" /> : <ChevronDown className="h-3 w-3 text-muted-foreground/30" />}
                </button>
                {showAlerts && (
                  <div className="px-4 pb-3 space-y-2">
                    {alerts.map((alert) => (
                      <div key={alert.id} className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-white/[0.03] text-[10px]">
                        <div className="flex items-center gap-1.5">
                          {alert.is_active ? <Bell className="h-3 w-3 text-primary" /> : <BellOff className="h-3 w-3 text-muted-foreground/30" />}
                          <span className="text-muted-foreground">
                            {alert.alert_type === "failure" ? "On failure" : alert.alert_type === "slow_run" ? "Slow run" : "Consecutive failures"}
                          </span>
                          <span className="text-muted-foreground/50">via {alert.channel}</span>
                        </div>
                        <button onClick={() => deleteAlert(alert.id)} className="text-muted-foreground/30 hover:text-red-400 transition-colors">
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                    {/* Add alert form */}
                    <div className="flex items-center gap-1.5">
                      <select
                        value={newAlertType}
                        onChange={(e) => setNewAlertType(e.target.value)}
                        className="h-6 rounded bg-white/5 border border-white/10 text-[9px] text-muted-foreground px-1"
                      >
                        <option value="failure">On failure</option>
                        <option value="slow_run">Slow run</option>
                        <option value="consecutive_failures">3x failures</option>
                      </select>
                      <select
                        value={newAlertChannel}
                        onChange={(e) => setNewAlertChannel(e.target.value)}
                        className="h-6 rounded bg-white/5 border border-white/10 text-[9px] text-muted-foreground px-1"
                      >
                        <option value="in_app">In-app</option>
                        <option value="telegram">Telegram</option>
                        <option value="slack">Slack</option>
                      </select>
                      <button
                        onClick={createAlert}
                        className="h-6 px-2 rounded bg-primary/20 text-primary text-[9px] hover:bg-primary/30 transition-colors flex items-center gap-0.5"
                      >
                        <Plus className="h-2.5 w-2.5" /> Add
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Run Card ──────────────────────────────────────────── */

interface RunCardProps {
  run: WorkflowRun;
  expanded: boolean;
  pinned: boolean;
  confirmingDelete: boolean;
  expandedNodes: Set<string>;
  copiedId: string | null;
  onToggleExpand: () => void;
  onTogglePin: () => void;
  onDelete: () => void;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
  onRerun: () => void;
  onToggleNode: (key: string) => void;
  onCopy: (text: string, id: string) => void;
}

function RunCard({
  run, expanded, pinned, confirmingDelete, expandedNodes, copiedId,
  onToggleExpand, onTogglePin, onDelete, onConfirmDelete, onCancelDelete, onRerun, onToggleNode, onCopy,
}: RunCardProps) {
  const nodeOutputs = run.node_outputs ? filterInternalKeys(run.node_outputs) : null;
  const nodeEntries = nodeOutputs ? Object.entries(nodeOutputs) : [];

  return (
    <div className={cn("px-4 py-2.5 group", pinned && "bg-yellow-500/[0.03]")}>
      {/* Header row */}
      <div className="flex items-center gap-2">
        <button onClick={onToggleExpand} className="flex items-center gap-2 flex-1 min-w-0 text-left">
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
          {expanded ? (
            <ChevronUp className="h-3 w-3 text-muted-foreground/30" />
          ) : (
            <ChevronDown className="h-3 w-3 text-muted-foreground/30" />
          )}
        </button>

        {/* Action buttons (visible on hover or when expanded) */}
        <div className={cn(
          "flex items-center gap-0.5 transition-opacity",
          expanded ? "opacity-100" : "opacity-0 group-hover:opacity-100"
        )}>
          <button
            onClick={onTogglePin}
            className={cn(
              "h-5 w-5 rounded flex items-center justify-center transition-colors",
              pinned ? "text-yellow-400" : "text-muted-foreground/30 hover:text-yellow-400"
            )}
            title={pinned ? "Unpin" : "Pin"}
          >
            <Star className={cn("h-3 w-3", pinned && "fill-current")} />
          </button>
          <button
            onClick={onRerun}
            className="h-5 w-5 rounded flex items-center justify-center text-muted-foreground/30 hover:text-blue-400 transition-colors"
            title="Re-run with same trigger"
          >
            <RotateCcw className="h-3 w-3" />
          </button>
          <button
            onClick={() => onCopy(run.id, `run-${run.id}`)}
            className="h-5 w-5 rounded flex items-center justify-center text-muted-foreground/30 hover:text-foreground transition-colors"
            title="Copy run ID"
          >
            {copiedId === `run-${run.id}` ? (
              <Check className="h-3 w-3 text-emerald-400" />
            ) : (
              <Copy className="h-3 w-3" />
            )}
          </button>
          {confirmingDelete ? (
            <div className="flex items-center gap-0.5 ml-0.5">
              <button
                onClick={onDelete}
                className="h-5 px-1 rounded bg-red-500/20 text-[8px] text-red-400 hover:bg-red-500/30"
              >
                Yes
              </button>
              <button
                onClick={onCancelDelete}
                className="h-5 px-1 rounded bg-white/5 text-[8px] text-muted-foreground hover:bg-white/10"
              >
                No
              </button>
            </div>
          ) : (
            <button
              onClick={onConfirmDelete}
              className="h-5 w-5 rounded flex items-center justify-center text-muted-foreground/30 hover:text-red-400 transition-colors"
              title="Delete run"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="mt-2.5 space-y-2.5 pl-5">
          {/* Run ID */}
          <div className="flex items-center gap-1.5">
            <p className="text-[9px] text-muted-foreground/40 font-mono">{run.id.slice(0, 12)}…</p>
            <button
              onClick={() => onCopy(run.id, `id-${run.id}`)}
              className="text-muted-foreground/30 hover:text-foreground transition-colors"
            >
              {copiedId === `id-${run.id}` ? (
                <Check className="h-2.5 w-2.5 text-emerald-400" />
              ) : (
                <Copy className="h-2.5 w-2.5" />
              )}
            </button>
          </div>

          {/* Error */}
          {run.error && (
            <div className="rounded-lg bg-red-500/5 border border-red-500/10 px-2.5 py-1.5">
              <p className="text-[10px] text-red-400">{run.error}</p>
            </div>
          )}

          {/* Trigger */}
          {run.trigger_event && (
            <div className="space-y-1">
              <p className="text-[9px] text-muted-foreground/50 uppercase tracking-wider">Trigger</p>
              <p className="text-[10px] text-muted-foreground">
                {(run.trigger_event as Record<string, unknown>).type as string ?? "manual"}
              </p>
            </div>
          )}

          {/* Node-by-node timeline */}
          {nodeEntries.length > 0 && (
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <p className="text-[9px] text-muted-foreground/50 uppercase tracking-wider">Node Outputs</p>
                <button
                  onClick={() => onCopy(JSON.stringify(nodeOutputs, null, 2), `outputs-${run.id}`)}
                  className="text-muted-foreground/30 hover:text-foreground transition-colors"
                  title="Copy all outputs"
                >
                  {copiedId === `outputs-${run.id}` ? (
                    <Check className="h-2.5 w-2.5 text-emerald-400" />
                  ) : (
                    <Copy className="h-2.5 w-2.5" />
                  )}
                </button>
              </div>
              <div className="space-y-0.5">
                {nodeEntries.map(([nodeKey, nodeValue], idx) => {
                  const nodeData = nodeValue as Record<string, unknown>;
                  const nodeStatus = getNodeStatus(nodeData);
                  const isExpanded = expandedNodes.has(`${run.id}-${nodeKey}`);
                  const shortKey = nodeKey.length > 24 ? nodeKey.slice(0, 24) + "…" : nodeKey;

                  return (
                    <div key={nodeKey} className="relative">
                      {/* Timeline connector */}
                      {idx < nodeEntries.length - 1 && (
                        <div className="absolute left-[5px] top-5 bottom-0 w-px bg-white/5" />
                      )}
                      <button
                        onClick={() => onToggleNode(`${run.id}-${nodeKey}`)}
                        className="w-full flex items-center gap-2 py-1 text-left hover:bg-white/[0.02] rounded px-1 -mx-1"
                      >
                        <NodeStatusDot status={nodeStatus} />
                        <span className="text-[10px] text-muted-foreground font-mono flex-1 truncate">
                          {nodeData.type ? String(nodeData.type) : shortKey}
                        </span>
                        {nodeData.success === false && (
                          <span className="text-[8px] text-red-400 bg-red-500/10 px-1 rounded">err</span>
                        )}
                        {isExpanded ? (
                          <ChevronUp className="h-2.5 w-2.5 text-muted-foreground/20" />
                        ) : (
                          <ChevronDown className="h-2.5 w-2.5 text-muted-foreground/20" />
                        )}
                      </button>
                      {isExpanded && (
                        <div className="ml-4 mt-0.5 mb-1">
                          <pre className="text-[9px] text-muted-foreground/60 bg-white/[0.03] rounded-lg p-2 overflow-x-auto whitespace-pre-wrap max-h-32">
                            {JSON.stringify(nodeData, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Duration Sparkline ────────────────────────────────── */

function DurationSparkline({ data }: { data: { id: string; ms: number; status: string }[] }) {
  const maxMs = Math.max(...data.map((d) => d.ms), 1);
  const avgMs = data.reduce((sum, d) => sum + d.ms, 0) / data.length;

  return (
    <div className="flex items-end gap-px h-8">
      {data.map((d) => {
        const heightPct = Math.max((d.ms / maxMs) * 100, 4);
        return (
          <div
            key={d.id}
            className="flex-1 rounded-t-sm transition-all"
            style={{ height: `${heightPct}%` }}
            title={`${getDuration("1970-01-01T00:00:00Z", new Date(d.ms).toISOString())} — ${d.status}`}
          >
            <div
              className={cn(
                "w-full h-full rounded-t-sm",
                d.status === "completed" ? "bg-emerald-500/40" :
                d.status === "failed" ? "bg-red-500/40" : "bg-blue-500/40"
              )}
            />
          </div>
        );
      })}
      <div className="ml-2 shrink-0 text-[8px] text-muted-foreground/30 self-center">
        avg {formatMs(avgMs)}
      </div>
    </div>
  );
}

/* ─── Helpers ───────────────────────────────────────────── */

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

function NodeStatusDot({ status }: { status: "success" | "error" | "neutral" }) {
  return (
    <div className={cn(
      "h-2.5 w-2.5 rounded-full shrink-0 border",
      status === "success" ? "bg-emerald-500/30 border-emerald-500/50" :
      status === "error" ? "bg-red-500/30 border-red-500/50" :
      "bg-white/10 border-white/20"
    )} />
  );
}

function getNodeStatus(data: Record<string, unknown>): "success" | "error" | "neutral" {
  if (data.success === true || data.triggered === true) return "success";
  if (data.success === false || data.error) return "error";
  return "neutral";
}

function getDuration(start: string, end: string): string {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  return formatMs(ms);
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
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
