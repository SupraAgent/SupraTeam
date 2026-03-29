"use client";

import * as React from "react";
import {
  WorkflowBuilder,
  configureBuilder,
} from "@supra/loop-builder";
import type {
  FlowChatRequest,
  FlowChatResponse,
  LLMExecuteRequest,
  LLMExecuteResponse,
} from "@supra/loop-builder";
import type { Node, Edge } from "@xyflow/react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CRM_NODE_TYPES } from "./_lib/crm-node-types";
import { CRM_PALETTE_ITEMS, CRM_NODE_TYPE_INFO } from "./_lib/crm-palette-items";
import { CRM_NODE_EDITORS } from "./_lib/crm-node-editors";

// ── AI Handlers ─────────────────────────────────────────────

async function handleChat(req: FlowChatRequest): Promise<FlowChatResponse> {
  const res = await fetch("/api/loop/flow-chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Request failed" }));
    return { message: "", error: err.error || "Request failed" };
  }
  return res.json();
}

async function handleLLMExecute(
  req: LLMExecuteRequest
): Promise<LLMExecuteResponse> {
  if (req.stream) {
    const res = await fetch("/api/loop/flow-execute-llm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Request failed" }));
      return { content: "", error: err.error || "Request failed" };
    }
    const reader = res.body?.getReader();
    if (!reader) return { content: "", error: "Streaming not supported" };

    const decoder = new TextDecoder();
    const result: LLMExecuteResponse = { content: "", stream: undefined, usage: undefined };

    const textStream = new ReadableStream<string>({
      async start(controller) {
        let buffer = "";
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n\n");
            buffer = lines.pop() || "";
            for (const line of lines) {
              const dataLine = line.replace(/^data: /, "").trim();
              if (!dataLine) continue;
              try {
                const event = JSON.parse(dataLine);
                if (event.type === "text") {
                  result.content += event.text;
                  controller.enqueue(event.text);
                } else if (event.type === "done") {
                  result.usage = event.usage;
                } else if (event.type === "error") {
                  controller.error(new Error(event.error));
                  return;
                }
              } catch {
                /* skip malformed */
              }
            }
          }
        } finally {
          reader.releaseLock();
          controller.close();
        }
      },
    });
    result.stream = textStream;
    return result;
  }

  const res = await fetch("/api/loop/flow-execute-llm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Request failed" }));
    return { content: "", error: err.error || "Request failed" };
  }
  return res.json();
}

// ── Types ──────────────────────────────────────────────────

interface ReplayRun {
  id: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  error: string | null;
  failure_type: string | null;
  node_outputs: Record<string, unknown>;
  trigger_event: Record<string, unknown> | null;
}

interface WorkflowTemplate {
  id: string;
  name: string;
  description: string | null;
  category: string;
  trigger_type: string | null;
  nodes: unknown[];
  edges: unknown[];
}

interface DbWorkflow {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  trigger_type: string | null;
  run_count: number;
  last_run_at: string | null;
  updated_at: string;
}

// ── Workflow Manager Panel ──────────────────────────────────

function WorkflowManagerPanel({
  onLoad,
  onDelete,
  activeWorkflowId,
  activeWorkflowName,
  isSaving,
  saveError,
  lastSaved,
  isActive,
  onToggleActive,
  onNewWorkflow,
  onRunWorkflow,
  onShowTestModal,
  onOpenReplay,
  onOpenTemplates,
  isRunning,
  lastRunStatus,
}: {
  onLoad: (id: string) => void;
  onDelete: (id: string) => void;
  activeWorkflowId: string | null;
  activeWorkflowName: string;
  isSaving: boolean;
  saveError: string | null;
  lastSaved: string | null;
  isActive: boolean;
  onToggleActive: () => void;
  onNewWorkflow: () => void;
  onRunWorkflow: (testMode: boolean, dealId?: string) => void;
  onShowTestModal: () => void;
  onOpenReplay: () => void;
  onOpenTemplates: () => void;
  isRunning: boolean;
  lastRunStatus: string | null;
}) {
  const [workflows, setWorkflows] = React.useState<DbWorkflow[]>([]);
  const [showList, setShowList] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  const fetchWorkflows = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/loop/workflows");
      if (res.ok) {
        const data = await res.json();
        setWorkflows(data.workflows ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (showList) fetchWorkflows();
  }, [showList, fetchWorkflows]);

  return (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2">
      {/* Workflow name + status */}
      <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-background/95 backdrop-blur-sm px-3 py-1.5 shadow-lg">
        <button
          onClick={() => setShowList(!showList)}
          className="flex items-center gap-1.5 text-xs font-medium text-foreground hover:text-primary transition"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
          </svg>
          {activeWorkflowId ? activeWorkflowName : "Unsaved Workflow"}
        </button>

        {activeWorkflowId && (
          <>
            <div className="w-px h-4 bg-white/10" />
            <button
              onClick={onToggleActive}
              className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                isActive
                  ? "bg-emerald-500/20 text-emerald-400"
                  : "bg-white/5 text-muted-foreground"
              }`}
            >
              {isActive ? "Active" : "Inactive"}
            </button>
          </>
        )}

        {isSaving && (
          <span className="text-[10px] text-muted-foreground animate-pulse">Saving...</span>
        )}
        {!isSaving && saveError && (
          <span className="text-[10px] text-red-400" title={saveError}>Save failed</span>
        )}
        {!isSaving && !saveError && lastSaved && (
          <span className="text-[10px] text-muted-foreground">Saved</span>
        )}
      </div>

      {/* Run controls */}
      {activeWorkflowId && (
        <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-background/95 backdrop-blur-sm px-2 py-1.5 shadow-lg">
          <button
            onClick={() => onRunWorkflow(true, undefined)}
            disabled={isRunning}
            className="text-[10px] font-medium px-2 py-1 rounded bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 transition disabled:opacity-50"
            title="Dry run — evaluates without side effects"
          >
            Test
          </button>
          <button
            onClick={() => onShowTestModal()}
            disabled={isRunning}
            className="text-[10px] font-medium px-2 py-1 rounded bg-violet-500/10 text-violet-400 hover:bg-violet-500/20 transition disabled:opacity-50"
            title="Test with a sample deal from the database"
          >
            Test w/ Deal
          </button>
          <button
            onClick={() => onRunWorkflow(false, undefined)}
            disabled={isRunning}
            className="text-[10px] font-medium px-2 py-1 rounded bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition disabled:opacity-50"
          >
            {isRunning ? "Running..." : "Run"}
          </button>
          {lastRunStatus && (
            <span className={`text-[10px] font-medium ${
              lastRunStatus === "completed" ? "text-emerald-400"
              : lastRunStatus === "failed" ? "text-red-400"
              : "text-muted-foreground"
            }`}>
              {lastRunStatus}
            </span>
          )}
        </div>
      )}

      {/* Runs & replay */}
      {activeWorkflowId && (
        <button
          onClick={() => onOpenReplay()}
          className="rounded-lg border border-white/10 bg-background/95 backdrop-blur-sm px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-white/5 shadow-lg transition"
          title="View execution history for this workflow"
        >
          History
        </button>
      )}
      <Link
        href="/automations2/runs"
        className="rounded-lg border border-white/10 bg-background/95 backdrop-blur-sm px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-white/5 shadow-lg transition"
        title="View all workflow runs"
      >
        Runs
      </Link>

      {/* Templates */}
      <button
        onClick={() => onOpenTemplates()}
        className="rounded-lg border border-white/10 bg-background/95 backdrop-blur-sm px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-white/5 shadow-lg transition"
        title="Load from template library"
      >
        Templates
      </button>

      {/* New workflow button */}
      <button
        onClick={onNewWorkflow}
        className="rounded-lg border border-white/10 bg-background/95 backdrop-blur-sm px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-white/5 shadow-lg transition"
        title="New workflow"
      >
        +
      </button>

      {/* Workflow list dropdown */}
      {showList && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setShowList(false)} />
          <div className="absolute top-full left-0 mt-1 w-80 max-h-96 overflow-y-auto rounded-xl border border-white/10 bg-background/95 backdrop-blur-sm shadow-2xl z-20">
            <div className="px-3 py-2 border-b border-white/10 text-xs font-semibold text-muted-foreground">
              Saved Workflows {loading && "(loading...)"}
            </div>
            {workflows.length === 0 && !loading && (
              <div className="px-3 py-4 text-xs text-muted-foreground text-center">
                No saved workflows yet. Click Save to persist your first workflow.
              </div>
            )}
            {workflows.map((wf) => (
              <div
                key={wf.id}
                className={`flex items-center gap-2 px-3 py-2 hover:bg-white/5 transition ${
                  wf.id === activeWorkflowId ? "bg-primary/5 border-l-2 border-primary" : ""
                }`}
              >
                <button
                  onClick={() => { onLoad(wf.id); setShowList(false); }}
                  className="flex-1 min-w-0 text-left"
                >
                  <div className="text-xs font-medium text-foreground truncate">{wf.name}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {wf.trigger_type || "No trigger"} · {wf.run_count} runs
                    {wf.is_active && <span className="ml-1 text-emerald-400">● active</span>}
                  </div>
                </button>
                <button
                  onClick={async (e) => {
                    e.stopPropagation();
                    if (!window.confirm(`Delete "${wf.name}"? This cannot be undone.`)) return;
                    await onDelete(wf.id);
                    await fetchWorkflows();
                  }}
                  className="shrink-0 p-1 text-muted-foreground hover:text-red-400 transition"
                  title="Delete workflow"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Main Page ───────────────────────────────────────────────

export default function Automations2Page() {
  const searchParams = useSearchParams();
  const [activeWorkflowId, setActiveWorkflowId] = React.useState<string | null>(null);
  const [activeWorkflowName, setActiveWorkflowName] = React.useState("New Workflow");
  const [isActive, setIsActive] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [lastSaved, setLastSaved] = React.useState<string | null>(null);
  const [isRunning, setIsRunning] = React.useState(false);
  const [lastRunStatus, setLastRunStatus] = React.useState<string | null>(null);
  const [showNameInput, setShowNameInput] = React.useState(false);
  const [pendingName, setPendingName] = React.useState("");
  const [showTestModal, setShowTestModal] = React.useState(false);
  const [testDeals, setTestDeals] = React.useState<Array<{ value: string; label: string; meta?: Record<string, unknown> }>>([]);
  const [testDealSearch, setTestDealSearch] = React.useState("");
  const [lastRunError, setLastRunError] = React.useState<string | null>(null);
  const [showReplayPanel, setShowReplayPanel] = React.useState(false);
  const [replayRuns, setReplayRuns] = React.useState<ReplayRun[]>([]);
  const [selectedRunId, setSelectedRunId] = React.useState<string | null>(null);
  const [showTemplateModal, setShowTemplateModal] = React.useState(false);
  const [templates, setTemplates] = React.useState<WorkflowTemplate[]>([]);
  const [builderKey, setBuilderKey] = React.useState(0);

  // Track current canvas state for save
  const nodesRef = React.useRef<Node[]>([]);
  const edgesRef = React.useRef<Edge[]>([]);

  // Configure builder on mount
  React.useEffect(() => {
    configureBuilder({
      storagePrefix: "suprateam",
      idbName: "suprateam-automations",
      logPrefix: "@suprateam/automations",
      commitMessagePrefix: "Workflow",
    });
  }, []);

  // Unsaved-changes guard — warn if saving in progress or debounce timer pending
  React.useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      const hasPendingSave = !!saveTimerRef.current;
      if (isSaving || hasPendingSave || (nodesRef.current.length > 0 && !activeWorkflowId && !lastSaved)) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isSaving, activeWorkflowId, lastSaved]);

  /** Detect trigger type from CRM trigger nodes in the canvas */
  function detectTriggerType(nodes: Node[]): string | null {
    const triggerNode = nodes.find((n) => n.type === "crmTriggerNode");
    if (!triggerNode) return null;
    return (triggerNode.data as Record<string, unknown>).crmTrigger as string || null;
  }

  /** Auto-save to DB (debounced by onNodesChange/onEdgesChange) */
  const saveToDb = React.useCallback(async (nodes: Node[], edges: Edge[]) => {
    if (!activeWorkflowId) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(`/api/loop/workflows/${activeWorkflowId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nodes,
          edges,
          trigger_type: detectTriggerType(nodes),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Save failed" }));
        setSaveError(err.error || "Save failed");
      } else {
        setLastSaved(new Date().toISOString());
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Network error");
    } finally {
      setIsSaving(false);
    }
  }, [activeWorkflowId]);

  /** Save handler — creates new workflow or updates existing */
  const handleSave = React.useCallback(async (nodes: Node[], edges: Edge[]) => {
    if (activeWorkflowId) {
      await saveToDb(nodes, edges);
      return;
    }
    // Show inline name input for new workflows
    nodesRef.current = nodes;
    edgesRef.current = edges;
    setPendingName(activeWorkflowName);
    setShowNameInput(true);
  }, [activeWorkflowId, activeWorkflowName, saveToDb]);

  /** Confirm new workflow creation with the entered name */
  const confirmCreateWorkflow = React.useCallback(async () => {
    const name = pendingName.trim();
    if (!name) return;
    setShowNameInput(false);
    setIsSaving(true);
    setSaveError(null);
    try {
      const res = await fetch("/api/loop/workflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          nodes: nodesRef.current,
          edges: edgesRef.current,
          trigger_type: detectTriggerType(nodesRef.current),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setActiveWorkflowId(data.workflow.id);
        setActiveWorkflowName(data.workflow.name);
        setLastSaved(new Date().toISOString());
      } else {
        const err = await res.json().catch(() => ({ error: "Create failed" }));
        setSaveError(err.error || "Create failed");
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Network error");
    } finally {
      setIsSaving(false);
    }
  }, [pendingName]);

  /** Load a workflow from DB */
  const handleLoad = React.useCallback(async (id: string) => {
    // Clear pending auto-save from previous workflow
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    try {
      const res = await fetch(`/api/loop/workflows/${id}`);
      if (!res.ok) {
        setSaveError("Failed to load workflow");
        return;
      }
      const data = await res.json();
      const wf = data.workflow;

      setActiveWorkflowId(wf.id);
      setActiveWorkflowName(wf.name);
      setIsActive(wf.is_active);
      nodesRef.current = wf.nodes ?? [];
      edgesRef.current = wf.edges ?? [];
      setLastSaved(wf.updated_at);
      setLastRunStatus(null);
      setLastRunError(null);
      setSaveError(null);

      // Force re-render with loaded data
      setBuilderKey((k) => k + 1);
    } catch {
      setSaveError("Network error loading workflow");
    }
  }, []);

  // Auto-load workflow from URL query param (?workflow=uuid)
  const loadedFromUrl = React.useRef(false);
  React.useEffect(() => {
    const workflowId = searchParams.get("workflow");
    if (workflowId && !loadedFromUrl.current) {
      loadedFromUrl.current = true;
      handleLoad(workflowId);
    }
  }, [searchParams, handleLoad]);

  /** Toggle workflow active state */
  const handleToggleActive = React.useCallback(async () => {
    if (!activeWorkflowId) return;
    const newActive = !isActive;
    try {
      const res = await fetch(`/api/loop/workflows/${activeWorkflowId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: newActive }),
      });
      if (res.ok) setIsActive(newActive);
      else setSaveError("Failed to toggle workflow status");
    } catch {
      setSaveError("Network error toggling status");
    }
  }, [activeWorkflowId, isActive]);

  /** Delete a workflow */
  const handleDeleteWorkflow = React.useCallback(async (id: string) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    try {
      const res = await fetch(`/api/loop/workflows/${id}`, { method: "DELETE" });
      if (!res.ok) {
        setSaveError("Failed to delete workflow");
        return;
      }
    } catch {
      setSaveError("Network error deleting workflow");
      return;
    }
    if (id === activeWorkflowId) {
      setActiveWorkflowId(null);
      setActiveWorkflowName("New Workflow");
      setIsActive(false);
      setLastSaved(null);
      setLastRunStatus(null);
      setLastRunError(null);
      nodesRef.current = [];
      edgesRef.current = [];
      setBuilderKey((k) => k + 1);
    }
  }, [activeWorkflowId]);

  /** New workflow */
  const handleNewWorkflow = React.useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    setActiveWorkflowId(null);
    setActiveWorkflowName("New Workflow");
    setIsActive(false);
    setLastSaved(null);
    setLastRunStatus(null);
    setLastRunError(null);
    nodesRef.current = [];
    edgesRef.current = [];
    setBuilderKey((k) => k + 1);
  }, []);

  /** Run workflow server-side */
  const handleRunWorkflow = React.useCallback(async (testMode: boolean, dealId?: string) => {
    if (!activeWorkflowId) return;
    setIsRunning(true);
    setLastRunStatus(null);
    setLastRunError(null);
    try {
      const body: Record<string, unknown> = { test_mode: testMode };
      if (dealId) body.deal_id = dealId;
      const res = await fetch(`/api/loop/workflows/${activeWorkflowId}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      const status = data.status || (data.ok ? "completed" : "failed");
      setLastRunStatus(status);
      if (status === "failed" && data.error) {
        setLastRunError(data.error);
      }
    } catch {
      setLastRunStatus("failed");
      setLastRunError("Network error — could not reach server");
    } finally {
      setIsRunning(false);
    }
  }, [activeWorkflowId]);

  /** Validate & Run — triggered by WorkflowBuilder's onRun prop (toolbar button) */
  const handleValidateAndRun = React.useCallback(async () => {
    if (!activeWorkflowId) {
      // Save first if there are nodes (opens name modal for new workflows)
      if (nodesRef.current.length > 0) await handleSave(nodesRef.current, edgesRef.current);
      return;
    }
    // Save latest, then execute
    await saveToDb(nodesRef.current, edgesRef.current);
    await handleRunWorkflow(false);
  }, [activeWorkflowId, handleSave, saveToDb, handleRunWorkflow]);

  /** Show test-with-deal modal and fetch deals */
  const handleShowTestModal = React.useCallback(async () => {
    setShowTestModal(true);
    setTestDealSearch("");
    try {
      const res = await fetch("/api/loop/crm-options?type=deals");
      if (res.ok) {
        const data = await res.json();
        setTestDeals(data.options ?? []);
      }
    } catch { /* ignore */ }
  }, []);

  /** Search deals in test modal (debounced) */
  const dealSearchTimerRef = React.useRef<ReturnType<typeof setTimeout>>(undefined);
  const searchTestDeals = React.useCallback((query: string) => {
    setTestDealSearch(query);
    if (dealSearchTimerRef.current) clearTimeout(dealSearchTimerRef.current);
    dealSearchTimerRef.current = setTimeout(async () => {
      try {
        const qs = new URLSearchParams({ type: "deals", search: query });
        const res = await fetch(`/api/loop/crm-options?${qs}`);
        if (res.ok) {
          const data = await res.json();
          setTestDeals(data.options ?? []);
        }
      } catch { /* ignore */ }
    }, 300);
  }, []);

  // Debounced auto-save when canvas changes
  const saveTimerRef = React.useRef<ReturnType<typeof setTimeout>>(undefined);
  const handleNodesChange = React.useCallback((nodes: Node[]) => {
    nodesRef.current = nodes;
    if (!activeWorkflowId) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveToDb(nodes, edgesRef.current);
    }, 2000);
  }, [activeWorkflowId, saveToDb]);

  const handleEdgesChange = React.useCallback((edges: Edge[]) => {
    edgesRef.current = edges;
    if (!activeWorkflowId) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveToDb(nodesRef.current, edges);
    }, 2000);
  }, [activeWorkflowId, saveToDb]);

  /** Open replay panel and fetch runs */
  const handleOpenReplay = React.useCallback(async () => {
    if (!activeWorkflowId) return;
    setShowReplayPanel(true);
    try {
      const res = await fetch(`/api/workflows/${activeWorkflowId}/runs`);
      if (res.ok) {
        const data = await res.json();
        setReplayRuns(data.runs ?? []);
      }
    } catch { /* ignore */ }
  }, [activeWorkflowId]);

  /** Open template modal and fetch templates */
  const handleOpenTemplates = React.useCallback(async () => {
    setShowTemplateModal(true);
    try {
      const res = await fetch("/api/workflow-templates");
      if (res.ok) {
        const data = await res.json();
        setTemplates(data.templates ?? []);
      }
    } catch { /* ignore */ }
  }, []);

  /** Load a template into the canvas */
  const handleLoadTemplate = React.useCallback((tmpl: WorkflowTemplate) => {
    nodesRef.current = tmpl.nodes as Node[];
    edgesRef.current = tmpl.edges as Edge[];
    setActiveWorkflowId(null);
    setActiveWorkflowName(tmpl.name);
    setIsActive(false);
    setLastSaved(null);
    setShowTemplateModal(false);
    setBuilderKey((k) => k + 1);
  }, []);

  // Cleanup timers on unmount
  React.useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (dealSearchTimerRef.current) clearTimeout(dealSearchTimerRef.current);
    };
  }, []);

  return (
    <div className="relative h-full">
      <WorkflowManagerPanel
        onLoad={handleLoad}
        onDelete={handleDeleteWorkflow}
        activeWorkflowId={activeWorkflowId}
        activeWorkflowName={activeWorkflowName}
        isSaving={isSaving}
        saveError={saveError}
        lastSaved={lastSaved}
        isActive={isActive}
        onToggleActive={handleToggleActive}
        onNewWorkflow={handleNewWorkflow}
        onRunWorkflow={handleRunWorkflow}
        onShowTestModal={handleShowTestModal}
        onOpenReplay={handleOpenReplay}
        onOpenTemplates={handleOpenTemplates}
        isRunning={isRunning}
        lastRunStatus={lastRunStatus}
      />

      {/* Failure alert banner */}
      {lastRunError && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-30 max-w-md w-full">
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 backdrop-blur-sm px-4 py-2 shadow-lg flex items-start gap-2">
            <span className="text-red-400 text-xs shrink-0 mt-0.5">&#x26A0;</span>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-red-400">Workflow failed</div>
              <div className="text-[11px] text-red-300/80 mt-0.5 break-words">{lastRunError}</div>
            </div>
            <button onClick={() => setLastRunError(null)} className="text-red-400/60 hover:text-red-400 text-xs shrink-0">&#x2715;</button>
          </div>
        </div>
      )}

      {/* Test with deal modal */}
      {showTestModal && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="rounded-xl border border-white/10 bg-background p-4 shadow-2xl w-96">
            <div className="text-sm font-semibold text-foreground mb-2">Test with Sample Deal</div>
            <p className="text-[11px] text-muted-foreground mb-3">Select a deal to use as context during the dry run. The workflow will evaluate with this deal&apos;s data.</p>
            <input
              autoFocus
              className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none mb-2"
              value={testDealSearch}
              onChange={(e) => searchTestDeals(e.target.value)}
              placeholder="Search deals..."
            />
            <div className="max-h-48 overflow-y-auto rounded-md border border-white/10 bg-white/5">
              {testDeals.length === 0 && (
                <div className="px-3 py-4 text-xs text-muted-foreground text-center">No deals found</div>
              )}
              {testDeals.map((deal) => (
                <button
                  key={deal.value}
                  onClick={() => {
                    setShowTestModal(false);
                    handleRunWorkflow(true, deal.value);
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-white/5 transition border-b border-white/5 last:border-0"
                >
                  <div className="text-xs font-medium text-foreground">{deal.label}</div>
                  {deal.meta && (
                    <div className="text-[10px] text-muted-foreground">
                      {deal.meta.board as string} {deal.meta.value ? `· $${deal.meta.value}` : ""}
                    </div>
                  )}
                </button>
              ))}
            </div>
            <div className="flex justify-end gap-2 mt-3">
              <button onClick={() => setShowTestModal(false)} className="text-xs px-3 py-1.5 text-muted-foreground hover:text-foreground transition">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Inline name input modal */}
      {showNameInput && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="rounded-xl border border-white/10 bg-background p-4 shadow-2xl w-80">
            <div className="text-sm font-semibold text-foreground mb-2">Save Workflow</div>
            <input
              autoFocus
              className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none"
              value={pendingName}
              onChange={(e) => setPendingName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") confirmCreateWorkflow(); if (e.key === "Escape") setShowNameInput(false); }}
              placeholder="Workflow name"
            />
            <div className="flex justify-end gap-2 mt-3">
              <button onClick={() => setShowNameInput(false)} className="text-xs px-3 py-1.5 text-muted-foreground hover:text-foreground transition">Cancel</button>
              <button onClick={confirmCreateWorkflow} className="text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition">Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Execution Replay Panel (slide-out) */}
      {showReplayPanel && (
        <>
          <div className="fixed inset-0 z-40 bg-black/30" onClick={() => setShowReplayPanel(false)} />
          <div className="fixed right-0 top-0 bottom-0 w-96 z-50 bg-background border-l border-white/10 shadow-2xl overflow-y-auto">
            <div className="sticky top-0 bg-background border-b border-white/10 px-4 py-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">Execution History</h3>
              <button onClick={() => setShowReplayPanel(false)} className="text-muted-foreground hover:text-foreground text-xs">&#x2715;</button>
            </div>
            {replayRuns.length === 0 && (
              <div className="px-4 py-8 text-xs text-muted-foreground text-center">No runs yet. Execute the workflow to see results here.</div>
            )}
            {replayRuns.map((run) => (
              <div key={run.id} className="border-b border-white/5">
                <button
                  onClick={() => setSelectedRunId(selectedRunId === run.id ? null : run.id)}
                  className="w-full text-left px-4 py-3 hover:bg-white/5 transition"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                        run.status === "completed" ? "bg-emerald-500/20 text-emerald-400"
                        : run.status === "failed" ? "bg-red-500/20 text-red-400"
                        : run.status === "paused" ? "bg-amber-500/20 text-amber-400"
                        : "bg-blue-500/20 text-blue-400"
                      }`}>
                        {run.status}
                      </span>
                      {run.failure_type && (
                        <span className="text-[10px] text-red-400/60 px-1 py-0.5 rounded bg-red-500/10">{run.failure_type}</span>
                      )}
                      {run.duration_ms != null && (
                        <span className="text-[10px] text-muted-foreground">{run.duration_ms < 1000 ? `${run.duration_ms}ms` : `${(run.duration_ms / 1000).toFixed(1)}s`}</span>
                      )}
                    </div>
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(run.started_at).toLocaleString()}
                    </span>
                  </div>
                  {run.error && (
                    <div className="text-[11px] text-red-400/80 mt-1 truncate">{run.error}</div>
                  )}
                </button>
                {/* Step-by-step replay view */}
                {selectedRunId === run.id && run.node_outputs && (
                  <div className="px-4 pb-3 space-y-1.5">
                    {Object.entries(run.node_outputs)
                      .filter(([k]) => !k.startsWith("_"))
                      .map(([nodeId, output]) => {
                        const o = output as Record<string, unknown>;
                        const ok = o.success !== false && !o.error;
                        return (
                          <div key={nodeId} className={`rounded-md border px-3 py-2 text-[11px] ${
                            ok ? "border-emerald-500/20 bg-emerald-500/5" : "border-red-500/20 bg-red-500/5"
                          }`}>
                            <div className="flex items-center gap-1.5">
                              <span className={ok ? "text-emerald-400" : "text-red-400"}>{ok ? "✓" : "✗"}</span>
                              <span className="font-medium text-foreground font-mono">{nodeId.slice(0, 12)}</span>
                              {o.duration_ms != null && (
                                <span className="text-muted-foreground ml-auto">{String(o.duration_ms)}ms</span>
                              )}
                            </div>
                            {o.error ? <div className="text-red-400/80 mt-1">{String(o.error)}</div> : null}
                            {o.output != null && (
                              <pre className="text-muted-foreground mt-1 text-[10px] max-h-24 overflow-auto whitespace-pre-wrap">
                                {JSON.stringify(o.output, null, 2)}
                              </pre>
                            )}
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {/* Template Library Modal */}
      {showTemplateModal && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="rounded-xl border border-white/10 bg-background p-4 shadow-2xl w-[500px] max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-semibold text-foreground">Workflow Templates</div>
              <button onClick={() => setShowTemplateModal(false)} className="text-muted-foreground hover:text-foreground text-xs">&#x2715;</button>
            </div>
            <p className="text-[11px] text-muted-foreground mb-3">Load a pre-built workflow template. This will replace the current canvas.</p>
            {templates.length === 0 && (
              <div className="px-3 py-8 text-xs text-muted-foreground text-center">No templates available</div>
            )}
            <div className="space-y-2">
              {templates.map((tmpl) => (
                <button
                  key={tmpl.id}
                  onClick={() => handleLoadTemplate(tmpl)}
                  className="w-full text-left rounded-lg border border-white/10 px-3 py-3 hover:bg-white/5 transition"
                >
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-medium text-foreground">{tmpl.name}</div>
                    <span className="text-[10px] text-muted-foreground px-1.5 py-0.5 rounded bg-white/5">{tmpl.category}</span>
                  </div>
                  {tmpl.description && (
                    <div className="text-[11px] text-muted-foreground mt-1">{tmpl.description}</div>
                  )}
                  {tmpl.trigger_type && (
                    <div className="text-[10px] text-primary/60 mt-1">Trigger: {tmpl.trigger_type}</div>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <WorkflowBuilder
        key={builderKey}
        initialNodes={nodesRef.current}
        initialEdges={edgesRef.current}
        category="workflow"
        storageKeyPrefix="suprateam"
        customNodeTypes={CRM_NODE_TYPES as Record<string, React.ComponentType<unknown>>}
        customPaletteItems={CRM_PALETTE_ITEMS}
        customNodeTypeInfo={CRM_NODE_TYPE_INFO}
        customNodeEditors={CRM_NODE_EDITORS}
        onChat={handleChat}
        onLLMExecute={handleLLMExecute}
        onSave={handleSave}
        onRun={handleValidateAndRun}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        showExecutionPanel={!!activeWorkflowId}
        title="Automations"
        subtitle="Build CRM automation workflows with drag & drop"
        showAIChat
        className="h-full"
      />
    </div>
  );
}
