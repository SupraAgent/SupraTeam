"use client";

import React from "react";
import { WorkflowBuilder } from "@supra/loop-builder";
import type {
  FlowChatRequest,
  FlowChatResponse,
  LLMExecuteRequest,
  LLMExecuteResponse,
} from "@supra/loop-builder";
import type { Node, Edge } from "@xyflow/react";
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

async function handleLLMExecute(req: LLMExecuteRequest): Promise<LLMExecuteResponse> {
  if (req.stream) {
    const res = await fetch("/api/loop/flow-execute-llm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    });
    if (!res.ok) {
      const err = await res.json();
      return { content: "", error: err.error || "Request failed" };
    }
    const reader = res.body?.getReader();
    if (!reader) return { content: "", error: "Streaming not supported" };

    const decoder = new TextDecoder();
    let finalContent = "";
    let usage: { input_tokens?: number; output_tokens?: number } | undefined;

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
                  finalContent += event.text;
                  controller.enqueue(event.text);
                } else if (event.type === "done") {
                  usage = event.usage;
                } else if (event.type === "error") {
                  controller.error(new Error(event.error));
                  return;
                }
              } catch { /* skip malformed */ }
            }
          }
        } finally {
          reader.releaseLock();
          controller.close();
        }
      },
    });
    return { content: finalContent, stream: textStream, usage };
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

// ── DB Workflow Type ────────────────────────────────────────

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
  activeWorkflowId,
  activeWorkflowName,
  isSaving,
  lastSaved,
  isActive,
  onToggleActive,
  onNewWorkflow,
  onRunWorkflow,
  isRunning,
  lastRunStatus,
}: {
  onLoad: (id: string) => void;
  activeWorkflowId: string | null;
  activeWorkflowName: string;
  isSaving: boolean;
  lastSaved: string | null;
  isActive: boolean;
  onToggleActive: () => void;
  onNewWorkflow: () => void;
  onRunWorkflow: (testMode: boolean) => void;
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
        {!isSaving && lastSaved && (
          <span className="text-[10px] text-muted-foreground">Saved</span>
        )}
      </div>

      {/* Run controls */}
      {activeWorkflowId && (
        <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-background/95 backdrop-blur-sm px-2 py-1.5 shadow-lg">
          <button
            onClick={() => onRunWorkflow(true)}
            disabled={isRunning}
            className="text-[10px] font-medium px-2 py-1 rounded bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 transition disabled:opacity-50"
            title="Dry run — evaluates without side effects"
          >
            Test
          </button>
          <button
            onClick={() => onRunWorkflow(false)}
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
              <button
                key={wf.id}
                onClick={() => { onLoad(wf.id); setShowList(false); }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-white/5 transition ${
                  wf.id === activeWorkflowId ? "bg-primary/5 border-l-2 border-primary" : ""
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-foreground truncate">{wf.name}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {wf.trigger_type || "No trigger"} · {wf.run_count} runs
                    {wf.is_active && <span className="ml-1 text-emerald-400">● active</span>}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Main Page ───────────────────────────────────────────────

export default function LoopBuilderPage() {
  const [activeWorkflowId, setActiveWorkflowId] = React.useState<string | null>(null);
  const [activeWorkflowName, setActiveWorkflowName] = React.useState("New Workflow");
  const [isActive, setIsActive] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  const [lastSaved, setLastSaved] = React.useState<string | null>(null);
  const [isRunning, setIsRunning] = React.useState(false);
  const [lastRunStatus, setLastRunStatus] = React.useState<string | null>(null);

  // Track current canvas state for save
  const nodesRef = React.useRef<Node[]>([]);
  const edgesRef = React.useRef<Edge[]>([]);

  /** Detect trigger type from CRM trigger nodes in the canvas */
  function detectTriggerType(nodes: Node[]): string | null {
    const triggerNode = nodes.find((n) => n.type === "crmTriggerNode");
    if (!triggerNode) return null;
    return (triggerNode.data as Record<string, unknown>).crmTrigger as string || null;
  }

  /** Auto-save to DB (debounced by WorkflowBuilder's onNodesChange) */
  const saveToDb = React.useCallback(async (nodes: Node[], edges: Edge[]) => {
    if (!activeWorkflowId) return;
    setIsSaving(true);
    try {
      await fetch(`/api/loop/workflows/${activeWorkflowId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nodes,
          edges,
          trigger_type: detectTriggerType(nodes),
        }),
      });
      setLastSaved(new Date().toISOString());
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

    // Create new workflow
    setIsSaving(true);
    try {
      const name = prompt("Workflow name:", activeWorkflowName);
      if (!name) { setIsSaving(false); return; }

      const res = await fetch("/api/loop/workflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          nodes,
          edges,
          trigger_type: detectTriggerType(nodes),
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setActiveWorkflowId(data.workflow.id);
        setActiveWorkflowName(data.workflow.name);
        setLastSaved(new Date().toISOString());
      }
    } finally {
      setIsSaving(false);
    }
  }, [activeWorkflowId, activeWorkflowName, saveToDb]);

  /** Load a workflow from DB */
  const handleLoad = React.useCallback(async (id: string) => {
    const res = await fetch(`/api/loop/workflows/${id}`);
    if (!res.ok) return;
    const data = await res.json();
    const wf = data.workflow;

    setActiveWorkflowId(wf.id);
    setActiveWorkflowName(wf.name);
    setIsActive(wf.is_active);
    nodesRef.current = wf.nodes ?? [];
    edgesRef.current = wf.edges ?? [];

    // Force re-render by setting a key
    setBuilderKey((k) => k + 1);
  }, []);

  /** Toggle workflow active state */
  const handleToggleActive = React.useCallback(async () => {
    if (!activeWorkflowId) return;
    const newActive = !isActive;
    await fetch(`/api/loop/workflows/${activeWorkflowId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: newActive }),
    });
    setIsActive(newActive);
  }, [activeWorkflowId, isActive]);

  /** New workflow */
  const handleNewWorkflow = React.useCallback(() => {
    setActiveWorkflowId(null);
    setActiveWorkflowName("New Workflow");
    setIsActive(false);
    setLastSaved(null);
    setLastRunStatus(null);
    nodesRef.current = [];
    edgesRef.current = [];
    setBuilderKey((k) => k + 1);
  }, []);

  /** Run workflow server-side */
  const handleRunWorkflow = React.useCallback(async (testMode: boolean) => {
    if (!activeWorkflowId) return;
    setIsRunning(true);
    setLastRunStatus(null);
    try {
      const res = await fetch(`/api/loop/workflows/${activeWorkflowId}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ test_mode: testMode }),
      });
      const data = await res.json();
      setLastRunStatus(data.status || (data.ok ? "completed" : "failed"));
    } catch {
      setLastRunStatus("failed");
    } finally {
      setIsRunning(false);
    }
  }, [activeWorkflowId]);

  const [builderKey, setBuilderKey] = React.useState(0);

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

  return (
    <div className="relative h-full">
      <WorkflowManagerPanel
        onLoad={handleLoad}
        activeWorkflowId={activeWorkflowId}
        activeWorkflowName={activeWorkflowName}
        isSaving={isSaving}
        lastSaved={lastSaved}
        isActive={isActive}
        onToggleActive={handleToggleActive}
        onNewWorkflow={handleNewWorkflow}
        onRunWorkflow={handleRunWorkflow}
        isRunning={isRunning}
        lastRunStatus={lastRunStatus}
      />
      <WorkflowBuilder
        key={builderKey}
        initialNodes={nodesRef.current}
        initialEdges={edgesRef.current}
        category="workflow"
        storageKeyPrefix="suprateam_loop"
        customNodeTypes={CRM_NODE_TYPES as Record<string, React.ComponentType<unknown>>}
        customPaletteItems={CRM_PALETTE_ITEMS}
        customNodeTypeInfo={CRM_NODE_TYPE_INFO}
        customNodeEditors={CRM_NODE_EDITORS}
        onChat={handleChat}
        onLLMExecute={handleLLMExecute}
        onSave={handleSave}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        title="Loop Builder"
        subtitle="Drag-and-drop automation workflows for SupraCRM"
        showAIChat
        className="h-full"
      />
    </div>
  );
}
