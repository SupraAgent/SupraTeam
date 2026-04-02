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
import { ExecutionOverlayProvider } from "./_lib/execution-overlay";
import { VersionHistoryPanel } from "./_lib/version-history-panel";
import { NlWorkflowDialog } from "./_lib/nl-workflow-dialog";

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
  retry_count: number;
  node_outputs: Record<string, unknown>;
  trigger_event: Record<string, unknown> | null;
}

interface ReplayNodeExecution {
  id: string;
  node_id: string;
  node_type: string;
  node_label: string | null;
  output_data: Record<string, unknown> | null;
  error_message: string | null;
  status: string;
  duration_ms: number | null;
}

interface AlertRule {
  id: string;
  workflow_id: string;
  alert_type: string;
  channel: string;
  config: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
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
  onOpenAlerts,
  onSaveAsTemplate,
  onOpenVersionHistory,
  onOpenNlDialog,
  isRunning,
  lastRunStatus,
  runCount,
  lastRunAt,
  liveRunId,
  overlayReplayRunId,
  onDismissOverlay,
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
  onOpenAlerts: () => void;
  onSaveAsTemplate: () => void;
  onOpenVersionHistory: () => void;
  onOpenNlDialog: () => void;
  isRunning: boolean;
  lastRunStatus: string | null;
  runCount: number;
  lastRunAt: string | null;
  liveRunId: string | null;
  overlayReplayRunId: string | null;
  onDismissOverlay: () => void;
}) {
  const [workflows, setWorkflows] = React.useState<DbWorkflow[]>([]);
  const [showList, setShowList] = React.useState(false);
  const [showMore, setShowMore] = React.useState(false);
  const moreRef = React.useRef<HTMLDivElement>(null);
  const [loading, setLoading] = React.useState(false);

  // Close overflow menu on outside click or Escape
  React.useEffect(() => {
    if (!showMore) return;
    function handleClick(e: MouseEvent) {
      if (moreRef.current && !moreRef.current.contains(e.target as globalThis.Node)) {
        setShowMore(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setShowMore(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [showMore]);

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
    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 max-w-[calc(100vw-2rem)]">
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

        {activeWorkflowId && runCount > 0 && (
          <>
            <div className="w-px h-4 bg-white/10" />
            <span className="text-[10px] text-muted-foreground">
              {runCount} runs{lastRunAt && <> · last {new Date(lastRunAt).toLocaleDateString()}</>}
            </span>
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
          {(liveRunId || overlayReplayRunId) && (
            <button
              onClick={() => { onDismissOverlay(); }}
              className="text-[10px] text-muted-foreground hover:text-foreground transition"
              title="Clear execution overlay"
            >
              ✕ Clear
            </button>
          )}
        </div>
      )}

      {/* AI Generate — primary action */}
      <button
        onClick={() => onOpenNlDialog()}
        className="rounded-lg border border-primary/30 bg-primary/5 backdrop-blur-sm px-2.5 py-1.5 text-xs font-medium text-primary hover:bg-primary/10 shadow-lg transition flex items-center gap-1"
        title="Generate workflow from natural language"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456Z" />
        </svg>
        AI Generate
      </button>

      {/* New workflow — primary action */}
      <button
        onClick={onNewWorkflow}
        className="rounded-lg border border-white/10 bg-background/95 backdrop-blur-sm px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-white/5 shadow-lg transition"
        title="New workflow"
      >
        +
      </button>

      {/* More menu — secondary actions */}
      <div ref={moreRef} className="relative">
        <button
          onClick={() => setShowMore((v) => !v)}
          className={`rounded-lg border bg-background/95 backdrop-blur-sm px-2.5 py-1.5 text-xs font-medium shadow-lg transition flex items-center gap-1 ${
            showMore
              ? "border-white/20 bg-white/10 text-foreground"
              : "border-white/10 text-foreground hover:bg-white/5"
          }`}
          title="More actions"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 12a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0ZM12.75 12a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0ZM18.75 12a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z" />
          </svg>
          More
        </button>
        {showMore && (
          <div className="absolute right-0 top-full mt-1 w-48 rounded-xl border border-white/10 bg-background/95 shadow-xl backdrop-blur-sm py-1 z-50">
            {activeWorkflowId && (
              <button
                onClick={() => { onOpenReplay(); setShowMore(false); }}
                className="w-full text-left px-3 py-2 text-xs text-foreground hover:bg-white/5 transition"
              >
                History
              </button>
            )}
            {activeWorkflowId && (
              <button
                onClick={() => { onOpenVersionHistory(); setShowMore(false); }}
                className="w-full text-left px-3 py-2 text-xs text-foreground hover:bg-white/5 transition flex items-center gap-2"
              >
                <svg className="w-3.5 h-3.5 text-muted-foreground" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                </svg>
                Versions
              </button>
            )}
            <Link
              href="/automations/runs"
              onClick={() => setShowMore(false)}
              className="block w-full text-left px-3 py-2 text-xs text-foreground hover:bg-white/5 transition"
            >
              Runs
            </Link>
            <Link
              href="/automations/analytics"
              onClick={() => setShowMore(false)}
              className="block w-full text-left px-3 py-2 text-xs text-foreground hover:bg-white/5 transition"
            >
              Analytics
            </Link>
            {activeWorkflowId && (
              <>
                <div className="my-1 border-t border-white/10" />
                <button
                  onClick={() => { onOpenAlerts(); setShowMore(false); }}
                  className="w-full text-left px-3 py-2 text-xs text-foreground hover:bg-white/5 transition"
                >
                  Alerts
                </button>
                <button
                  onClick={() => { onSaveAsTemplate(); setShowMore(false); }}
                  className="w-full text-left px-3 py-2 text-xs text-foreground hover:bg-white/5 transition"
                >
                  Save as Template
                </button>
              </>
            )}
            <div className="my-1 border-t border-white/10" />
            <button
              onClick={() => { onOpenTemplates(); setShowMore(false); }}
              className="w-full text-left px-3 py-2 text-xs text-foreground hover:bg-white/5 transition"
            >
              Templates
            </button>
          </div>
        )}
      </div>

      {/* Workflow card grid modal */}
      {showList && (
        <>
          <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" onClick={() => setShowList(false)} />
          <div className="fixed inset-x-0 top-16 mx-auto z-50 w-full max-w-2xl max-h-[70vh] overflow-y-auto rounded-xl border border-white/10 bg-background shadow-2xl">
            <div className="sticky top-0 bg-background border-b border-white/10 px-4 py-3 flex items-center justify-between z-10">
              <span className="text-sm font-semibold text-foreground">Workflows {loading && <span className="text-muted-foreground font-normal">(loading...)</span>}</span>
              <button onClick={() => setShowList(false)} className="text-muted-foreground hover:text-foreground text-xs">&#x2715;</button>
            </div>
            {workflows.length === 0 && !loading ? (
              <div className="px-4 py-12 text-xs text-muted-foreground text-center">
                No saved workflows yet. Build a workflow on the canvas and save it.
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 p-4">
                {workflows.map((wf) => (
                  <div
                    key={wf.id}
                    className={`group relative rounded-lg border p-3 transition cursor-pointer hover:bg-white/5 ${
                      wf.id === activeWorkflowId
                        ? "border-primary/40 bg-primary/5"
                        : "border-white/10"
                    } ${!wf.is_active ? "opacity-60" : ""}`}
                    onClick={() => { onLoad(wf.id); setShowList(false); }}
                  >
                    {/* Active indicator */}
                    {wf.is_active && (
                      <div className="absolute top-2.5 right-2.5 w-2 h-2 rounded-full bg-emerald-400" title="Active" />
                    )}

                    <div className="text-xs font-medium text-foreground truncate pr-4">{wf.name}</div>
                    <div className="text-[10px] text-muted-foreground mt-1">
                      {wf.trigger_type || "No trigger"}
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-[10px] text-muted-foreground">
                        {wf.run_count} runs
                      </span>
                      <span className="text-[10px] text-muted-foreground" title={wf.updated_at}>
                        {new Date(wf.updated_at).toLocaleDateString()}
                      </span>
                    </div>

                    {/* Hover actions */}
                    <div className="absolute inset-x-0 bottom-0 rounded-b-lg bg-gradient-to-t from-background/95 to-transparent pt-4 pb-2 px-3 opacity-0 group-hover:opacity-100 transition-opacity flex justify-end gap-1">
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (!window.confirm(`Delete "${wf.name}"? This cannot be undone.`)) return;
                          await onDelete(wf.id);
                          await fetchWorkflows();
                        }}
                        className="p-1 rounded bg-red-500/10 text-red-400 hover:bg-red-500/20 transition"
                        title="Delete workflow"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
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
  const [runCount, setRunCount] = React.useState(0);
  const [lastRunAt, setLastRunAt] = React.useState<string | null>(null);
  // Alerts
  const [showAlertsPanel, setShowAlertsPanel] = React.useState(false);
  const [alerts, setAlerts] = React.useState<AlertRule[]>([]);
  const [alertsLoading, setAlertsLoading] = React.useState(false);
  // Save as template
  const [showSaveTemplateModal, setShowSaveTemplateModal] = React.useState(false);
  const [templateName, setTemplateName] = React.useState("");
  const [templateDesc, setTemplateDesc] = React.useState("");
  const [templateTags, setTemplateTags] = React.useState("");
  const [savingTemplate, setSavingTemplate] = React.useState(false);
  // Node execution detail for replay
  const [replayNodeExecs, setReplayNodeExecs] = React.useState<ReplayNodeExecution[]>([]);
  const [loadingNodeExecs, setLoadingNodeExecs] = React.useState(false);
  const [replaySearch, setReplaySearch] = React.useState("");
  // Execution overlay
  const [liveRunId, setLiveRunId] = React.useState<string | null>(null);
  const [overlayReplayRunId, setOverlayReplayRunId] = React.useState<string | null>(null);
  const [isStartingRun, setIsStartingRun] = React.useState(false);
  // Version history
  const [showVersionHistory, setShowVersionHistory] = React.useState(false);
  // NL workflow generator
  const [showNlDialog, setShowNlDialog] = React.useState(false);

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

  /** Inject webhook URL into trigger nodes and extract metadata for syncing */
  function prepareWebhookNodes(nodes: Node[], workflowId: string): { nodes: Node[]; metadata: Record<string, unknown> | null } {
    let webhookMetadata: Record<string, unknown> | null = null;
    const processed = nodes.map((n) => {
      if (n.type !== "crmTriggerNode") return n;
      const d = n.data as Record<string, unknown>;
      if (d.crmTrigger !== "webhook") return n;
      const config = (d.config || {}) as Record<string, string>;
      const webhookUrl = `${window.location.origin}/api/loop/workflows/${workflowId}/webhook`;
      // Sync webhook_secret to workflow metadata for server-side validation
      if (config.webhook_secret) {
        webhookMetadata = { webhook_secret: config.webhook_secret };
      }
      if (config.webhook_url === webhookUrl) return n;
      return { ...n, data: { ...d, config: { ...config, webhook_url: webhookUrl } } };
    });
    return { nodes: processed, metadata: webhookMetadata };
  }

  /** Auto-save to DB (debounced by onNodesChange/onEdgesChange) */
  const saveToDb = React.useCallback(async (nodes: Node[], edges: Edge[]) => {
    if (!activeWorkflowId) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      // Inject webhook URL and extract metadata for server-side sync
      const { nodes: processedNodes, metadata } = prepareWebhookNodes(nodes, activeWorkflowId);
      // Update nodesRef if webhook URL was injected so UI reflects it
      if (processedNodes !== nodes) nodesRef.current = processedNodes;
      const payload: Record<string, unknown> = {
        nodes: processedNodes,
        edges,
        trigger_type: detectTriggerType(processedNodes),
      };
      if (metadata) payload.metadata = metadata;
      const res = await fetch(`/api/loop/workflows/${activeWorkflowId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Save failed" }));
        setSaveError(err.error || "Save failed");
      } else {
        setLastSaved(new Date().toISOString());
        // If nodes were updated (webhook URL injected), force re-render
        if (processedNodes !== nodes) setBuilderKey((k) => k + 1);
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
        const newId = data.workflow.id as string;
        setActiveWorkflowId(newId);
        setActiveWorkflowName(data.workflow.name);
        setLastSaved(new Date().toISOString());
        // If trigger is webhook, inject the URL now that we have an ID and re-save
        if (detectTriggerType(nodesRef.current) === "webhook") {
          const { nodes: withUrl, metadata } = prepareWebhookNodes(nodesRef.current, newId);
          nodesRef.current = withUrl;
          const updatePayload: Record<string, unknown> = { nodes: withUrl, edges: edgesRef.current };
          if (metadata) updatePayload.metadata = metadata;
          await fetch(`/api/loop/workflows/${newId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(updatePayload),
          });
          setBuilderKey((k) => k + 1);
        }
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
      setRunCount(wf.run_count ?? 0);
      setLastRunAt(wf.last_run_at ?? null);

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
    setOverlayReplayRunId(null);
    setIsStartingRun(true);
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
      setIsStartingRun(false);
      // Set the real run ID for the overlay to poll — no auto-clear, user dismisses
      if (data.runId) {
        setLiveRunId(data.runId);
      } else {
        setLiveRunId(null);
      }
      if (status === "failed" && data.error) {
        setLastRunError(data.error);
      }
    } catch {
      setLastRunStatus("failed");
      setLastRunError("Network error — could not reach server");
      setIsStartingRun(false);
      setLiveRunId(null);
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
    setSelectedRunId(null);
    setReplayNodeExecs([]);
    try {
      const res = await fetch(`/api/loop/workflows/${activeWorkflowId}/runs`);
      if (res.ok) {
        const data = await res.json();
        setReplayRuns(data.runs ?? []);
      }
    } catch { /* ignore */ }
  }, [activeWorkflowId]);

  /** Fetch node execution details for a replay run */
  const handleExpandReplayRun = React.useCallback(async (runId: string) => {
    if (selectedRunId === runId) {
      setSelectedRunId(null);
      setReplayNodeExecs([]);
      setOverlayReplayRunId(null);
      return;
    }
    setSelectedRunId(runId);
    setReplayNodeExecs([]);
    // Show execution overlay on canvas for this replay run
    setLiveRunId(null);
    setOverlayReplayRunId(runId);
    setLoadingNodeExecs(true);
    try {
      const res = await fetch(`/api/loop/runs/nodes?run_id=${runId}`);
      if (res.ok) {
        const data = await res.json();
        setReplayNodeExecs(data.nodes ?? []);
      }
    } catch { /* ignore */ }
    setLoadingNodeExecs(false);
  }, [selectedRunId]);

  /** Open alerts panel */
  const handleOpenAlerts = React.useCallback(async () => {
    if (!activeWorkflowId) return;
    setShowAlertsPanel(true);
    setAlertsLoading(true);
    try {
      const res = await fetch(`/api/loop/alerts?workflow_id=${activeWorkflowId}`);
      if (res.ok) {
        const data = await res.json();
        setAlerts(data.alerts ?? []);
      }
    } catch { /* ignore */ }
    setAlertsLoading(false);
  }, [activeWorkflowId]);

  /** Create an alert rule */
  const handleCreateAlert = React.useCallback(async (alertType: string, channel: string) => {
    if (!activeWorkflowId) return;
    try {
      const res = await fetch("/api/loop/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workflow_id: activeWorkflowId, alert_type: alertType, channel }),
      });
      if (res.ok) {
        const data = await res.json();
        setAlerts((prev) => [data.alert, ...prev]);
      }
    } catch { /* ignore */ }
  }, [activeWorkflowId]);

  /** Toggle alert active state */
  const handleToggleAlert = React.useCallback(async (alertId: string, isActive: boolean) => {
    try {
      const res = await fetch(`/api/loop/alerts?id=${alertId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !isActive }),
      });
      if (res.ok) {
        setAlerts((prev) => prev.map((a) => a.id === alertId ? { ...a, is_active: !isActive } : a));
      }
    } catch { /* ignore */ }
  }, []);

  /** Delete an alert rule */
  const handleDeleteAlert = React.useCallback(async (alertId: string) => {
    try {
      const res = await fetch(`/api/loop/alerts?id=${alertId}`, { method: "DELETE" });
      if (res.ok) {
        setAlerts((prev) => prev.filter((a) => a.id !== alertId));
      }
    } catch { /* ignore */ }
  }, []);

  /** Save current workflow as template */
  const handleSaveAsTemplate = React.useCallback(async () => {
    if (!activeWorkflowId) return;
    setShowSaveTemplateModal(true);
    setTemplateName(activeWorkflowName);
    setTemplateDesc("");
    setTemplateTags("");
  }, [activeWorkflowId, activeWorkflowName]);

  /** Handle version restore — update canvas with restored nodes/edges */
  const handleVersionRestore = React.useCallback((nodes: unknown[], edges: unknown[]) => {
    nodesRef.current = nodes as Node[];
    edgesRef.current = edges as Edge[];
    setBuilderKey((k) => k + 1);
    setLastSaved(new Date().toISOString());
  }, []);

  const confirmSaveTemplate = React.useCallback(async () => {
    if (!templateName.trim()) return;
    setSavingTemplate(true);
    try {
      const res = await fetch("/api/workflow-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: templateName.trim(),
          description: templateDesc.trim() || null,
          category: "custom",
          tags: templateTags.split(",").map((t) => t.trim()).filter(Boolean),
          nodes: nodesRef.current,
          edges: edgesRef.current,
          trigger_type: detectTriggerType(nodesRef.current),
        }),
      });
      if (res.ok) {
        setShowSaveTemplateModal(false);
      }
    } catch { /* ignore */ }
    setSavingTemplate(false);
  }, [templateName, templateDesc, templateTags]);

  /** Delete runs for current workflow */
  const handleDeleteReplayRuns = React.useCallback(async (mode: "all" | "failed") => {
    if (!activeWorkflowId) return;
    if (!window.confirm(`Delete ${mode} runs for this workflow?`)) return;
    try {
      const res = await fetch(`/api/loop/workflows/${activeWorkflowId}/runs?mode=${mode}`, { method: "DELETE" });
      if (res.ok) {
        setReplayRuns((prev) => mode === "all" ? [] : prev.filter((r) => r.status !== "failed"));
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

  /** Apply AI-generated workflow to the canvas */
  const handleApplyNlWorkflow = React.useCallback((nodes: Node[], edges: Edge[]) => {
    nodesRef.current = nodes;
    edgesRef.current = edges;
    setActiveWorkflowId(null);
    setActiveWorkflowName("AI Generated Workflow");
    setIsActive(false);
    setLastSaved(null);
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
        onOpenAlerts={handleOpenAlerts}
        onSaveAsTemplate={handleSaveAsTemplate}
        onOpenVersionHistory={() => setShowVersionHistory(true)}
        onOpenNlDialog={() => setShowNlDialog(true)}
        isRunning={isRunning}
        lastRunStatus={lastRunStatus}
        runCount={runCount}
        lastRunAt={lastRunAt}
        liveRunId={liveRunId}
        overlayReplayRunId={overlayReplayRunId}
        onDismissOverlay={() => { setLiveRunId(null); setOverlayReplayRunId(null); }}
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
            <div className="sticky top-0 bg-background border-b border-white/10 px-4 py-3 flex items-center justify-between z-10">
              <h3 className="text-sm font-semibold text-foreground">Execution History</h3>
              <div className="flex items-center gap-2">
                {replayRuns.length > 0 && (
                  <div className="relative group">
                    <button className="text-[10px] text-muted-foreground hover:text-foreground transition">Clear</button>
                    <div className="absolute right-0 top-full mt-1 rounded-lg border border-white/10 bg-background shadow-xl p-1 hidden group-hover:block z-10 w-32">
                      <button onClick={() => handleDeleteReplayRuns("failed")} className="w-full text-left px-2 py-1 rounded text-[10px] text-red-400 hover:bg-red-500/10 transition">Clear Failed</button>
                      <button onClick={() => handleDeleteReplayRuns("all")} className="w-full text-left px-2 py-1 rounded text-[10px] text-muted-foreground hover:bg-white/5 transition">Clear All</button>
                    </div>
                  </div>
                )}
                <button onClick={() => handleOpenReplay()} className="text-[10px] text-muted-foreground hover:text-foreground transition" title="Refresh">&#x21bb;</button>
                <button onClick={() => setShowReplayPanel(false)} className="text-muted-foreground hover:text-foreground text-xs">&#x2715;</button>
              </div>
            </div>

            {/* Duration sparkline */}
            {replayRuns.filter((r) => r.duration_ms != null && r.status === "completed").length >= 3 && (
              <div className="px-4 py-3 border-b border-white/5">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Duration Trend</p>
                <div className="h-8">
                  <svg viewBox="0 0 320 32" className="w-full h-full" preserveAspectRatio="none">
                    {(() => {
                      const data = replayRuns.filter((r) => r.duration_ms != null && r.status === "completed").slice(0, 20).reverse().map((r) => r.duration_ms as number);
                      if (data.length < 2) return null;
                      const max = Math.max(...data);
                      const min = Math.min(...data);
                      const range = max - min || 1;
                      const points = data.map((v, i) => `${(i / (data.length - 1)) * 320},${32 - ((v - min) / range) * 28 - 2}`);
                      return <>
                        <polygon points={`0,32 ${points.join(" ")} 320,32`} fill="hsl(160, 60%, 45%)" fillOpacity="0.08" />
                        <polyline points={points.join(" ")} fill="none" stroke="hsl(160, 60%, 45%)" strokeWidth="2" strokeLinejoin="round" />
                      </>;
                    })()}
                  </svg>
                </div>
              </div>
            )}

            {/* Search runs */}
            {replayRuns.length > 0 && (
              <div className="px-4 py-2 border-b border-white/5">
                <input
                  className="w-full rounded-md border border-white/10 bg-white/5 px-2.5 py-1.5 text-[11px] text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none"
                  value={replaySearch}
                  onChange={(e) => setReplaySearch(e.target.value)}
                  placeholder="Search errors, IDs..."
                />
              </div>
            )}

            {replayRuns.length === 0 && (
              <div className="px-4 py-8 text-xs text-muted-foreground text-center">No runs yet. Execute the workflow to see results here.</div>
            )}
            {replayRuns.filter((run) => {
              if (!replaySearch) return true;
              const q = replaySearch.toLowerCase();
              return (
                run.id.toLowerCase().includes(q) ||
                run.status.includes(q) ||
                (run.error && run.error.toLowerCase().includes(q))
              );
            }).map((run) => (
              <div key={run.id} className="border-b border-white/5">
                <button
                  onClick={() => handleExpandReplayRun(run.id)}
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
                {/* Node execution timeline + copy outputs */}
                {selectedRunId === run.id && (
                  <div className="px-4 pb-3">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-[10px] text-muted-foreground font-mono">ID: {run.id.slice(0, 8)}</span>
                      <button
                        onClick={() => navigator.clipboard.writeText(run.id)}
                        className="text-[10px] text-primary/60 hover:text-primary transition"
                      >
                        Copy ID
                      </button>
                      {run.node_outputs && Object.keys(run.node_outputs).filter((k) => !k.startsWith("_")).length > 0 && (
                        <button
                          onClick={() => navigator.clipboard.writeText(JSON.stringify(run.node_outputs, null, 2))}
                          className="text-[10px] text-primary/60 hover:text-primary transition ml-auto"
                        >
                          Copy All Outputs
                        </button>
                      )}
                    </div>
                    {loadingNodeExecs ? (
                      <div className="text-[10px] text-muted-foreground py-2 animate-pulse">Loading nodes...</div>
                    ) : replayNodeExecs.length > 0 ? (
                      <div className="relative pl-4 space-y-1">
                        <div className="absolute left-[7px] top-1 bottom-1 w-px bg-white/10" />
                        {replayNodeExecs.map((node) => {
                          const ok = node.status === "completed" || node.status === "success";
                          return (
                            <div key={node.id} className="flex items-center gap-2 py-1">
                              <div className={`w-2.5 h-2.5 rounded-full border-2 shrink-0 -ml-[11px] z-10 bg-background ${
                                ok ? "border-emerald-400" : node.status === "running" ? "border-blue-400" : "border-red-400"
                              }`} />
                              <span className="text-[11px] font-medium text-foreground truncate">
                                {node.node_label || node.node_type}
                              </span>
                              <span className="text-[9px] text-muted-foreground/50 uppercase">{node.node_type}</span>
                              {node.duration_ms != null && (
                                <span className="text-[10px] text-muted-foreground font-mono ml-auto">{node.duration_ms < 1000 ? `${node.duration_ms}ms` : `${(node.duration_ms / 1000).toFixed(1)}s`}</span>
                              )}
                              {node.error_message && (
                                <span className="text-red-400 text-[10px]" title={node.error_message}>&#x2717;</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : run.node_outputs ? (
                      /* Fallback to node_outputs if no execution records */
                      <div className="space-y-1">
                        {Object.entries(run.node_outputs).filter(([k]) => !k.startsWith("_")).map(([nodeId, output]) => {
                          const o = output as Record<string, unknown>;
                          const ok = o.success !== false && !o.error;
                          return (
                            <div key={nodeId} className={`rounded-md border px-3 py-2 text-[11px] ${ok ? "border-emerald-500/20 bg-emerald-500/5" : "border-red-500/20 bg-red-500/5"}`}>
                              <div className="flex items-center gap-1.5">
                                <span className={ok ? "text-emerald-400" : "text-red-400"}>{ok ? "\u2713" : "\u2717"}</span>
                                <span className="font-medium text-foreground font-mono">{nodeId.slice(0, 12)}</span>
                              </div>
                              {o.error ? <div className="text-red-400/80 mt-1">{String(o.error)}</div> : null}
                            </div>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {/* Version History Panel (slide-out) */}
      {showVersionHistory && activeWorkflowId && (
        <VersionHistoryPanel
          workflowId={activeWorkflowId}
          currentNodeCount={nodesRef.current.length}
          currentEdgeCount={edgesRef.current.length}
          onRestore={handleVersionRestore}
          onClose={() => setShowVersionHistory(false)}
        />
      )}

      {/* Alerts Panel (slide-out) */}
      {showAlertsPanel && (
        <>
          <div className="fixed inset-0 z-40 bg-black/30" onClick={() => setShowAlertsPanel(false)} />
          <div className="fixed right-0 top-0 bottom-0 w-96 z-50 bg-background border-l border-white/10 shadow-2xl overflow-y-auto">
            <div className="sticky top-0 bg-background border-b border-white/10 px-4 py-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">Alert Rules</h3>
              <button onClick={() => setShowAlertsPanel(false)} className="text-muted-foreground hover:text-foreground text-xs">&#x2715;</button>
            </div>

            {/* Add alert form */}
            <div className="px-4 py-3 border-b border-white/5 space-y-2">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">New Alert</p>
              <div className="flex gap-2">
                <select id="alert-type" className="flex-1 rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-foreground">
                  <option value="failure">On Failure</option>
                  <option value="slow_run">Slow Run</option>
                  <option value="consecutive_failures">Consecutive Failures</option>
                </select>
                <select id="alert-channel" className="flex-1 rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-foreground">
                  <option value="in_app">In-App</option>
                  <option value="telegram">Telegram</option>
                  <option value="slack">Slack</option>
                </select>
                <button
                  onClick={() => {
                    const type = (document.getElementById("alert-type") as HTMLSelectElement).value;
                    const channel = (document.getElementById("alert-channel") as HTMLSelectElement).value;
                    handleCreateAlert(type, channel);
                  }}
                  className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition"
                >
                  Add
                </button>
              </div>
            </div>

            {alertsLoading ? (
              <div className="px-4 py-8 text-xs text-muted-foreground text-center animate-pulse">Loading alerts...</div>
            ) : alerts.length === 0 ? (
              <div className="px-4 py-8 text-xs text-muted-foreground text-center">No alert rules configured. Add one above to get notified on failures or slow runs.</div>
            ) : (
              alerts.map((alert) => (
                <div key={alert.id} className="px-4 py-3 border-b border-white/5 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-foreground">
                      {alert.alert_type === "failure" ? "On Failure" : alert.alert_type === "slow_run" ? "Slow Run" : "Consecutive Failures"}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      via {alert.channel === "in_app" ? "In-App" : alert.channel === "telegram" ? "Telegram" : "Slack"}
                    </div>
                  </div>
                  <button
                    onClick={() => handleToggleAlert(alert.id, alert.is_active)}
                    className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                      alert.is_active ? "bg-emerald-500/20 text-emerald-400" : "bg-white/5 text-muted-foreground"
                    }`}
                  >
                    {alert.is_active ? "Active" : "Off"}
                  </button>
                  <button
                    onClick={() => handleDeleteAlert(alert.id)}
                    className="text-muted-foreground hover:text-red-400 transition"
                    title="Delete alert"
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                    </svg>
                  </button>
                </div>
              ))
            )}
          </div>
        </>
      )}

      {/* Save as Template modal */}
      {showSaveTemplateModal && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="rounded-xl border border-white/10 bg-background p-4 shadow-2xl w-96">
            <div className="text-sm font-semibold text-foreground mb-2">Save as Template</div>
            <p className="text-[11px] text-muted-foreground mb-3">Save the current workflow as a reusable template for your team.</p>
            <div className="space-y-2">
              <input
                autoFocus
                className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="Template name"
              />
              <textarea
                className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none resize-y min-h-[60px]"
                value={templateDesc}
                onChange={(e) => setTemplateDesc(e.target.value)}
                placeholder="Description (optional)"
              />
              <input
                className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none"
                value={templateTags}
                onChange={(e) => setTemplateTags(e.target.value)}
                placeholder="Tags (comma-separated, optional)"
              />
            </div>
            <div className="flex justify-end gap-2 mt-3">
              <button onClick={() => setShowSaveTemplateModal(false)} className="text-xs px-3 py-1.5 text-muted-foreground hover:text-foreground transition">Cancel</button>
              <button
                onClick={confirmSaveTemplate}
                disabled={savingTemplate || !templateName.trim()}
                className="text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition disabled:opacity-50"
              >
                {savingTemplate ? "Saving..." : "Save Template"}
              </button>
            </div>
          </div>
        </div>
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

      <NlWorkflowDialog
        open={showNlDialog}
        onClose={() => setShowNlDialog(false)}
        onApply={handleApplyNlWorkflow}
      />

      <ExecutionOverlayProvider
        workflowId={activeWorkflowId}
        liveRunId={liveRunId}
        replayRunId={overlayReplayRunId}
      >
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
      </ExecutionOverlayProvider>
    </div>
  );
}
