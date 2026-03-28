"use client";

import * as React from "react";
import type { Node, Edge } from "@xyflow/react";
import { FlowCanvas } from "./flow-canvas";
import { BuilderChat } from "./builder-chat";
import { WorkspaceManager } from "./workspace-manager";
import { Button } from "../ui/button";
import type { FlowTemplate } from "../lib/flow-templates";
import { setTemplateStoragePrefix } from "../lib/flow-templates";
import { setBuilderTemplateStorageKey } from "../lib/builder-templates";
import {
  getUserNodes,
  setUserNodeStoragePrefix,
  type UserNodeDefinition,
} from "../lib/user-nodes";
import { UserNode } from "./nodes/user-node";
import {
  validateWorkflow,
  createExecution,
  executeWorkflow,
  type WorkflowExecution,
} from "../lib/workflow-engine";
import {
  getActiveWorkspaceId,
  getWorkspaces,
  loadWorkspace,
  saveWorkspace,
  createWorkspace,
  deleteWorkspace,
  duplicateWorkspace,
  renameWorkspace,
  setActiveWorkspaceId,
  setStorageKeys,
  type Workspace,
} from "../hooks/use-workspaces";
import type { WorkflowBuilderProps } from "../types";
import { OnboardingTour, useOnboarding } from "./onboarding-tour";
import { CredentialManager } from "./credential-manager";
import {
  saveExecution,
  listExecutions,
  setExecutionStorePrefix,
  type ExecutionIndexEntry,
} from "../lib/execution-store";
import {
  createVersion,
  listVersions,
  loadVersion,
  deleteVersion,
  setVersionStorePrefix,
  type VersionIndexEntry,
} from "../lib/workflow-versions";
import { VersionPanel } from "./version-panel";
import {
  loadExecution,
} from "../lib/execution-store";

const STATUS_STYLES = {
  pending: { bg: "bg-white/5", text: "text-muted-foreground", icon: "○" },
  running: { bg: "bg-blue-500/10", text: "text-blue-400", icon: "◉" },
  success: { bg: "bg-emerald-500/10", text: "text-emerald-400", icon: "●" },
  error: { bg: "bg-red-500/10", text: "text-red-400", icon: "⚠" },
  skipped: { bg: "bg-white/5", text: "text-muted-foreground", icon: "–" },
} as const satisfies Record<string, { bg: string; text: string; icon: string }>;

// ── Execution history persistence ────────────────────────────
const MAX_HISTORY_ENTRIES = 20;

type ExecutionHistoryEntry = {
  id: string;
  status: string;
  startedAt: string;
  completedAt?: string;
  stepCount: number;
  successCount: number;
  errorCount: number;
  totalTokens?: { input: number; output: number; cost: number };
  /** Saved step results for replay (output truncated to save space) */
  steps?: Array<{
    nodeId: string;
    nodeType: string;
    label: string;
    status: string;
    output?: string;
    error?: string;
  }>;
};

function getExecutionHistory(prefix: string): ExecutionHistoryEntry[] {
  try {
    const raw = localStorage.getItem(`${prefix}:exec-history`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveExecutionHistory(prefix: string, entry: ExecutionHistoryEntry) {
  try {
    const history = getExecutionHistory(prefix);
    history.unshift(entry);
    localStorage.setItem(
      `${prefix}:exec-history`,
      JSON.stringify(history.slice(0, MAX_HISTORY_ENTRIES))
    );
  } catch {
    // localStorage full — ignore
  }
}

function formatCost(cost: number): string {
  if (cost < 0.01) return "<$0.01";
  return `$${cost.toFixed(3)}`;
}

function formatTokens(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}k`;
  return String(count);
}

/** Format a date string as relative time ("2 hours ago", "3 days ago") */
function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

/** Get a complexity label based on node count */
function complexityLabel(nodeCount: number): { label: string; color: string } {
  if (nodeCount === 0) return { label: "Empty", color: "text-muted-foreground" };
  if (nodeCount <= 5) return { label: "Simple", color: "text-emerald-400" };
  if (nodeCount <= 15) return { label: "Medium", color: "text-blue-400" };
  return { label: "Complex", color: "text-amber-400" };
}

/** Create a lightweight snapshot string for dirty-checking.
 *  Includes a hash of node data so renaming / editing a node is detected. */
function createSnapshot(nodes: Node[], edges: Edge[]): string {
  // Simple djb2-style hash of stringified node data to detect content changes
  let hash = 5381;
  for (const n of nodes) {
    const s = JSON.stringify(n.data);
    for (let i = 0; i < s.length; i++) {
      hash = ((hash << 5) + hash + s.charCodeAt(i)) | 0;
    }
  }
  return `${nodes.length}:${edges.length}:${nodes.map(n => n.id).join(",")}:${hash}`;
}

/** Render a tiny SVG thumbnail of a workspace's node layout */
function CanvasThumbnail({ nodes, edges }: { nodes: Node[]; edges: Edge[] }) {
  if (nodes.length === 0) return null;

  // Compute bounding box
  const xs = nodes.map((n) => n.position.x);
  const ys = nodes.map((n) => n.position.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs) + 200; // approximate node width
  const maxY = Math.max(...ys) + 100; // approximate node height
  const w = maxX - minX || 1;
  const h = maxY - minY || 1;

  // Scale to fit in thumbnail
  const tw = 80;
  const th = 48;
  const scale = Math.min(tw / w, th / h) * 0.85;
  const offsetX = (tw - w * scale) / 2;
  const offsetY = (th - h * scale) / 2;

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  const nodeColors: Record<string, string> = {
    triggerNode: "#34d399",
    llmNode: "#818cf8",
    conditionNode: "#60a5fa",
    outputNode: "#fb923c",
    transformNode: "#2dd4bf",
    personaNode: "#f472b6",
    actionNode: "#fbbf24",
    consensusNode: "#a78bfa",
  };

  return (
    <svg width={tw} height={th} className="rounded border border-white/10 bg-white/[0.02]">
      {/* Edges */}
      {edges.map((e) => {
        const src = nodeMap.get(e.source);
        const tgt = nodeMap.get(e.target);
        if (!src || !tgt) return null;
        const x1 = (src.position.x - minX + 100) * scale + offsetX;
        const y1 = (src.position.y - minY + 50) * scale + offsetY;
        const x2 = (tgt.position.x - minX + 100) * scale + offsetX;
        const y2 = (tgt.position.y - minY + 50) * scale + offsetY;
        return (
          <line key={e.id} x1={x1} y1={y1} x2={x2} y2={y2}
            stroke="rgba(12, 206, 107, 0.25)" strokeWidth={0.5} />
        );
      })}
      {/* Nodes */}
      {nodes.map((n) => {
        const x = (n.position.x - minX) * scale + offsetX;
        const y = (n.position.y - minY) * scale + offsetY;
        const nw = 200 * scale;
        const nh = 80 * scale;
        const color = nodeColors[n.type ?? ""] ?? "rgba(255,255,255,0.3)";
        return (
          <rect key={n.id} x={x} y={y} width={Math.max(nw, 4)} height={Math.max(nh, 3)}
            rx={1} fill={color} opacity={0.6} />
        );
      })}
    </svg>
  );
}

export function WorkflowBuilder({
  initialNodes: propInitialNodes,
  initialEdges: propInitialEdges,
  category = "workflow",
  customNodeTypes,
  storageKeyPrefix = "suprateam_loop",
  disableAutoLayout = false,
  onNodesChange: onNodesChangeProp,
  onEdgesChange: onEdgesChangeProp,
  onSave,
  onRun,
  onExport,
  onImport,
  onChat,
  apiKey: propApiKey,
  onLLMExecute,
  title = "Workflow Builder",
  subtitle = "Drag nodes, connect cards, build chains of operations.",
  showStartScreen: showStartScreenProp = true,
  showAIChat = true,
  showExecutionPanel = true,
  className,
}: WorkflowBuilderProps) {
  // Set storage keys based on prefix
  React.useEffect(() => {
    setStorageKeys(
      `${storageKeyPrefix}:workspaces`,
      `${storageKeyPrefix}:active-workspace`
    );
    setTemplateStoragePrefix(storageKeyPrefix);
    setUserNodeStoragePrefix(storageKeyPrefix);
    setBuilderTemplateStorageKey(`${storageKeyPrefix}:builder-templates`);
    setExecutionStorePrefix(storageKeyPrefix);
    setVersionStorePrefix(storageKeyPrefix);
  }, [storageKeyPrefix]);

  // ── Chat panel state ──────────────────────────────────────────
  const [chatOpen, setChatOpen] = React.useState(false);

  // ── User node definitions ──────────────────────────────────────
  const [userNodeDefs, setUserNodeDefs] = React.useState<UserNodeDefinition[]>([]);

  React.useEffect(() => {
    setUserNodeDefs(getUserNodes());
  }, []);

  // Build dynamic node type map for user-created nodes
  const userNodeTypes = React.useMemo(() => {
    const types: Record<string, React.ComponentType<unknown>> = {};
    for (const def of userNodeDefs) {
      types[def.nodeType] = UserNode as React.ComponentType<unknown>;
    }
    return types;
  }, [userNodeDefs]);

  // Merge custom + user node types
  const mergedCustomNodeTypes = React.useMemo(() => ({
    ...customNodeTypes,
    ...userNodeTypes,
  }), [customNodeTypes, userNodeTypes]);

  function handleUserNodeCreated() {
    setUserNodeDefs(getUserNodes());
  }

  const [canvasKey, setCanvasKey] = React.useState(0);
  const [initialNodes, setInitialNodes] = React.useState<Node[]>(propInitialNodes ?? []);
  const [initialEdges, setInitialEdges] = React.useState<Edge[]>(propInitialEdges ?? []);
  const [activeWorkspaceId, setActiveWorkspaceIdState] = React.useState<string | null>(null);
  const [showStartScreen, setShowStartScreen] = React.useState(showStartScreenProp);
  const [startScreenWorkspaces, setStartScreenWorkspaces] = React.useState<Workspace[]>([]);
  const [confirmDeleteId, setConfirmDeleteId] = React.useState<string | null>(null);
  const [renamingId, setRenamingId] = React.useState<string | null>(null);
  const [renameValue, setRenameValue] = React.useState("");
  const [searchQuery, setSearchQuery] = React.useState("");

  const [canvasNodes, setCanvasNodes] = React.useState<Node[]>([]);
  const [canvasEdges, setCanvasEdges] = React.useState<Edge[]>([]);
  const [execution, setExecution] = React.useState<WorkflowExecution | null>(null);
  const [validationErrors, setValidationErrors] = React.useState<string[]>([]);
  const [isRunning, setIsRunning] = React.useState(false);
  const [expandedStep, setExpandedStep] = React.useState<string | null>(null);
  const [lastSavedSnapshot, setLastSavedSnapshot] = React.useState("");
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [pendingImport, setPendingImport] = React.useState<{ nodes: Node[]; edges: Edge[] } | null>(null);
  const [showHistory, setShowHistory] = React.useState(false);
  const [execHistory, setExecHistory] = React.useState<ExecutionHistoryEntry[]>([]);
  const [compareIds, setCompareIds] = React.useState<[string, string] | null>(null);
  const [replayExecId, setReplayExecId] = React.useState<string | null>(null);
  const [replayLoading, setReplayLoading] = React.useState(false);
  const abortControllerRef = React.useRef<AbortController | null>(null);
  const [elapsedMs, setElapsedMs] = React.useState(0);
  const [externallyModified, setExternallyModified] = React.useState(false);
  const [showCredentialManager, setShowCredentialManager] = React.useState(false);
  const [versions, setVersions] = React.useState<VersionIndexEntry[]>([]);
  const [showVersions, setShowVersions] = React.useState(false);
  const { showTour, completeTour, skipTour } = useOnboarding(storageKeyPrefix);

  // Live elapsed time counter while workflow is running
  React.useEffect(() => {
    if (!isRunning || !execution?.startedAt) {
      return;
    }
    const startTime = new Date(execution.startedAt).getTime();
    setElapsedMs(Date.now() - startTime);
    const timer = setInterval(() => {
      setElapsedMs(Date.now() - startTime);
    }, 100);
    return () => clearInterval(timer);
  }, [isRunning, execution?.startedAt]);

  // Refs for canvas state — declared early so all functions below can use them
  const canvasNodesRef = React.useRef(canvasNodes);
  const canvasEdgesRef = React.useRef(canvasEdges);
  canvasNodesRef.current = canvasNodes;
  canvasEdgesRef.current = canvasEdges;

  // Stabilize parent callbacks via refs to prevent infinite render loops
  // when the parent passes inline arrow functions
  const onNodesChangePropRef = React.useRef(onNodesChangeProp);
  onNodesChangePropRef.current = onNodesChangeProp;
  const onEdgesChangePropRef = React.useRef(onEdgesChangeProp);
  onEdgesChangePropRef.current = onEdgesChangeProp;

  // Track unsaved changes by comparing a lightweight snapshot
  const currentSnapshot = React.useMemo(() => createSnapshot(canvasNodes, canvasEdges), [canvasNodes, canvasEdges]);
  const hasUnsavedChanges = activeWorkspaceId !== null && currentSnapshot !== lastSavedSnapshot && canvasNodes.length > 0;

  // If initial nodes/edges are provided via props, skip start screen
  React.useEffect(() => {
    if (propInitialNodes && propInitialNodes.length > 0) {
      setShowStartScreen(false);
      return;
    }
    const id = getActiveWorkspaceId();
    if (id) {
      const ws = loadWorkspace(id);
      if (ws) {
        setActiveWorkspaceIdState(id);
        setInitialNodes(ws.nodes);
        setInitialEdges(ws.edges);
        setCanvasKey((k) => k + 1);
        setShowStartScreen(false);
        return;
      }
    }
    setStartScreenWorkspaces(getWorkspaces());
    setShowStartScreen(showStartScreenProp);
  }, [propInitialNodes, showStartScreenProp]);

  // Notify parent of node/edge changes (using refs to avoid render loops)
  React.useEffect(() => {
    onNodesChangePropRef.current?.(canvasNodes);
  }, [canvasNodes]);

  React.useEffect(() => {
    onEdgesChangePropRef.current?.(canvasEdges);
  }, [canvasEdges]);

  function handleStartNewBuild() {
    const ws = createWorkspace("Untitled Build", [], []);
    if (!ws) return; // localStorage full
    setActiveWorkspaceId(ws.id);
    setActiveWorkspaceIdState(ws.id);
    setInitialNodes([]);
    setInitialEdges([]);
    setCanvasNodes([]);
    setCanvasEdges([]);
    setExecution(null);
    setValidationErrors([]);
    setCanvasKey((k) => k + 1);
    setConfirmDeleteId(null);
    setShowStartScreen(false);
    setLastSavedSnapshot("");
  }

  function handleBackToStartScreen() {
    if (activeWorkspaceId && canvasNodesRef.current.length > 0) {
      saveWorkspace(activeWorkspaceId, canvasNodesRef.current, canvasEdgesRef.current);
    }
    setStartScreenWorkspaces(getWorkspaces());
    setConfirmDeleteId(null);
    setShowStartScreen(true);
  }

  function handleOpenWorkspace(ws: Workspace) {
    setActiveWorkspaceId(ws.id);
    setActiveWorkspaceIdState(ws.id);
    setInitialNodes(ws.nodes);
    setInitialEdges(ws.edges);
    setCanvasNodes(ws.nodes);
    setCanvasEdges(ws.edges);
    setCanvasKey((k) => k + 1);
    setShowStartScreen(false);
    setConfirmDeleteId(null);
    setLastSavedSnapshot(createSnapshot(ws.nodes, ws.edges));
  }

  function handleDeleteFromStart(id: string) {
    if (confirmDeleteId !== id) {
      setConfirmDeleteId(id);
      return;
    }
    deleteWorkspace(id);
    setConfirmDeleteId(null);
    setStartScreenWorkspaces(getWorkspaces());
  }

  function handleDuplicateFromStart(id: string) {
    duplicateWorkspace(id);
    setStartScreenWorkspaces(getWorkspaces());
  }

  function handleRenameFromStart(id: string) {
    if (renameValue.trim()) {
      renameWorkspace(id, renameValue.trim());
      setStartScreenWorkspaces(getWorkspaces());
    }
    setRenamingId(null);
    setRenameValue("");
  }

  // Auto-save every 30s
  React.useEffect(() => {
    if (!activeWorkspaceId) return;
    const timer = setInterval(() => {
      const ok = saveWorkspace(activeWorkspaceId, canvasNodesRef.current, canvasEdgesRef.current);
      if (ok) {
        setLastSavedSnapshot(createSnapshot(canvasNodesRef.current, canvasEdgesRef.current));
        setSaveError(null);
      } else {
        setSaveError("Storage full — your changes couldn't be saved. Export your work to avoid data loss.");
      }
    }, 30_000);
    return () => clearInterval(timer);
  }, [activeWorkspaceId]);

  // Save on unload
  const activeWsIdRef = React.useRef(activeWorkspaceId);
  activeWsIdRef.current = activeWorkspaceId;
  React.useEffect(() => {
    function handleBeforeUnload() {
      if (activeWsIdRef.current && canvasNodesRef.current.length > 0) {
        saveWorkspace(activeWsIdRef.current, canvasNodesRef.current, canvasEdgesRef.current);
      }
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  // Cross-tab storage listener: detect external modifications to the active workspace
  React.useEffect(() => {
    const workspacesKey = `${storageKeyPrefix}:workspaces`;
    function handleStorage(e: StorageEvent) {
      if (e.key !== workspacesKey) return;
      if (!activeWsIdRef.current) return;
      setExternallyModified(true);
    }
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [storageKeyPrefix]);

  function handleReloadFromStorage() {
    const wsId = activeWsIdRef.current;
    if (!wsId) return;
    const ws = loadWorkspace(wsId);
    if (ws) {
      setInitialNodes(ws.nodes);
      setInitialEdges(ws.edges);
      setCanvasNodes(ws.nodes);
      setCanvasEdges(ws.edges);
      setCanvasKey((k) => k + 1);
      setLastSavedSnapshot(createSnapshot(ws.nodes, ws.edges));
    }
    setExternallyModified(false);
  }

  function handleLoadWorkspace(nodes: Node[], edges: Edge[], wsId: string) {
    setActiveWorkspaceIdState(wsId || null);
    setInitialNodes(nodes);
    setInitialEdges(edges);
    setCanvasNodes(nodes);
    setCanvasEdges(edges);
    setExecution(null);
    setValidationErrors([]);
    setCanvasKey((k) => k + 1);
    setShowStartScreen(false);
    setLastSavedSnapshot(createSnapshot(nodes, edges));
  }

  function handleApplyFlow(nodes: Node[], edges: Edge[]) {
    // Must update initial nodes AND bump canvas key to force FlowCanvas remount,
    // since FlowCanvas manages its own internal useNodesState/useEdgesState.
    setInitialNodes(nodes);
    setInitialEdges(edges);
    setCanvasNodes(nodes);
    setCanvasEdges(edges);
    setExecution(null);
    setValidationErrors([]);
    setCanvasKey((k) => k + 1);
  }

  async function handleValidateAndRun() {
    if (onRun) {
      await onRun(canvasNodes, canvasEdges);
      return;
    }

    const result = validateWorkflow(canvasNodes, canvasEdges);
    setValidationErrors(result.errors);
    if (!result.valid) {
      setExecution(null);
      return;
    }

    const exec = createExecution(canvasNodes, canvasEdges);
    setExecution(exec);
    setIsRunning(true);
    setExpandedStep(null);
    setElapsedMs(0);

    // Create abort controller for cancellation
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    // Check for API key: prop > localStorage > credential store
    let apiKey = propApiKey ?? null;
    if (!apiKey && typeof window !== "undefined") {
      apiKey = localStorage.getItem(`${storageKeyPrefix}_anthropic_key`);
      if (!apiKey) {
        // Fallback: check credential store for migrated keys
        try {
          const { getCredentialByProvider } = await import("../lib/credential-store");
          const result = await getCredentialByProvider("anthropic");
          apiKey = result.value;
        } catch {
          // credential store unavailable
        }
      }
    }

    try {
      const finalExec = await executeWorkflow(
        exec,
        canvasNodes,
        canvasEdges,
        apiKey,
        (updated) => {
          setExecution({ ...updated, steps: [...updated.steps] });
        },
        onLLMExecute,
        abortController.signal
      );

      // Dual-write: summary → localStorage (legacy), full → IndexedDB (new store)
      const entry: ExecutionHistoryEntry = {
        id: finalExec.id,
        status: finalExec.status,
        startedAt: finalExec.startedAt ?? new Date().toISOString(),
        completedAt: finalExec.completedAt,
        stepCount: finalExec.steps.length,
        successCount: finalExec.steps.filter((s) => s.status === "success").length,
        errorCount: finalExec.steps.filter((s) => s.status === "error").length,
        totalTokens: finalExec.totalTokens,
        steps: finalExec.steps.map((s) => ({
          nodeId: s.nodeId,
          nodeType: s.nodeType,
          label: s.label,
          status: s.status,
          output: s.output?.slice(0, 2000),
          error: s.error?.slice(0, 1000),
        })),
      };
      saveExecutionHistory(storageKeyPrefix, entry);
      setExecHistory(getExecutionHistory(storageKeyPrefix));

      // Persist full execution to IndexedDB (async, non-blocking)
      if (activeWorkspaceId) {
        saveExecution(
          finalExec,
          activeWorkspaceId,
          canvasNodesRef.current.map((n) => n.id),
          canvasEdgesRef.current.map((e) => e.id)
        ).catch(() => {
          setSaveError("Execution replay data couldn't be saved to IndexedDB. Summary was saved.");
        });
      }
    } finally {
      setIsRunning(false);
      abortControllerRef.current = null;
    }
  }

  function handleCancelExecution() {
    abortControllerRef.current?.abort();
  }

  // ── Version management ────────────────────────────────────────
  async function handleCreateVersion(name?: string) {
    if (!activeWorkspaceId) return;
    await createVersion(
      activeWorkspaceId,
      name ?? "",
      canvasNodesRef.current,
      canvasEdgesRef.current
    );
    setVersions(listVersions(activeWorkspaceId));
  }

  async function handleLoadVersion(versionId: string) {
    const ver = await loadVersion(versionId);
    if (!ver) return;
    // Deep-clone to prevent shared references between initial and canvas state
    const clonedNodes = JSON.parse(JSON.stringify(ver.nodes)) as Node[];
    const clonedEdges = JSON.parse(JSON.stringify(ver.edges)) as Edge[];
    setInitialNodes(clonedNodes);
    setInitialEdges(clonedEdges);
    setCanvasNodes(clonedNodes);
    setCanvasEdges(clonedEdges);
    setCanvasKey((k) => k + 1);
  }

  async function handleDeleteVersion(versionId: string) {
    if (!activeWorkspaceId) return;
    await deleteVersion(versionId, activeWorkspaceId);
    setVersions(listVersions(activeWorkspaceId));
  }

  async function handleAutoSaveVersion(name: string) {
    if (!activeWorkspaceId) return;
    await createVersion(activeWorkspaceId, name, canvasNodesRef.current, canvasEdgesRef.current);
    // Auto-prune: keep max 5 auto-saves, sorted oldest-first for deletion
    const allVersions = listVersions(activeWorkspaceId);
    const autoSaves = allVersions
      .filter((v) => v.name.startsWith("[auto]"))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    if (autoSaves.length > 5) {
      const toDelete = autoSaves.slice(5);
      for (const v of toDelete) {
        await deleteVersion(v.id, activeWorkspaceId);
      }
    }
    setVersions(listVersions(activeWorkspaceId));
  }

  // Load versions when workspace changes
  React.useEffect(() => {
    if (activeWorkspaceId) {
      setVersions(listVersions(activeWorkspaceId));
    }
  }, [activeWorkspaceId]);

  function handleExportJSON() {
    const data = {
      nodes: canvasNodes,
      edges: canvasEdges,
      exportedAt: new Date().toISOString(),
      version: "1.0.0",
    };
    if (onExport) {
      onExport(data);
      return;
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const wsName = getWorkspaces().find(w => w.id === activeWorkspaceId)?.name ?? "workflow";
    const dateStr = new Date().toISOString().slice(0, 10);
    a.download = `${wsName.replace(/[^a-zA-Z0-9-_ ]/g, "").replace(/\s+/g, "-")}-${dateStr}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function validateImportData(data: unknown): { valid: boolean; nodes: Node[]; edges: Edge[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (typeof data !== "object" || data === null) {
      errors.push("File does not contain a valid JSON object.");
      return { valid: false, nodes: [], edges: [], warnings };
    }

    const obj = data as Record<string, unknown>;

    if (!Array.isArray(obj.nodes)) {
      errors.push("Missing or invalid \"nodes\" array.");
    }
    if (!Array.isArray(obj.edges)) {
      errors.push("Missing or invalid \"edges\" array.");
    }
    if (errors.length > 0) {
      setSaveError(errors.join(" "));
      return { valid: false, nodes: [], edges: [], warnings };
    }

    const nodes = obj.nodes as unknown[];
    const edges = obj.edges as unknown[];

    // Validate each node
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      if (typeof n !== "object" || n === null) {
        errors.push(`Node at index ${i} is not an object.`);
        continue;
      }
      const node = n as Record<string, unknown>;
      if (typeof node.id !== "string" || !node.id) {
        errors.push(`Node at index ${i} is missing a valid "id" (string).`);
      }
      if (typeof node.type !== "string" || !node.type) {
        errors.push(`Node at index ${i} (${node.id ?? "unknown"}) is missing a valid "type" (string).`);
      }
      if (typeof node.position !== "object" || node.position === null) {
        errors.push(`Node "${node.id ?? `index ${i}`}" is missing "position".`);
      } else {
        const pos = node.position as Record<string, unknown>;
        if (typeof pos.x !== "number" || typeof pos.y !== "number") {
          errors.push(`Node "${node.id ?? `index ${i}`}" has invalid position — "x" and "y" must be numbers.`);
        }
      }
      if (typeof node.data !== "object" || node.data === null) {
        errors.push(`Node "${node.id ?? `index ${i}`}" is missing "data" (object).`);
      }
    }

    // Validate each edge
    for (let i = 0; i < edges.length; i++) {
      const e = edges[i];
      if (typeof e !== "object" || e === null) {
        errors.push(`Edge at index ${i} is not an object.`);
        continue;
      }
      const edge = e as Record<string, unknown>;
      if (typeof edge.id !== "string" || !edge.id) {
        errors.push(`Edge at index ${i} is missing a valid "id" (string).`);
      }
      if (typeof edge.source !== "string" || !edge.source) {
        errors.push(`Edge "${edge.id ?? `index ${i}`}" is missing a valid "source" (string).`);
      }
      if (typeof edge.target !== "string" || !edge.target) {
        errors.push(`Edge "${edge.id ?? `index ${i}`}" is missing a valid "target" (string).`);
      }
    }

    if (errors.length > 0) {
      setSaveError(`Import validation failed: ${errors.slice(0, 3).join(" ")}${errors.length > 3 ? ` (+${errors.length - 3} more)` : ""}`);
      return { valid: false, nodes: [], edges: [], warnings };
    }

    // Version check (warn but allow)
    if (obj.version !== undefined && obj.version !== "1.0.0") {
      warnings.push(`File version "${String(obj.version)}" differs from expected "1.0.0". Import may behave unexpectedly.`);
    }

    return { valid: true, nodes: obj.nodes as Node[], edges: obj.edges as Edge[], warnings };
  }

  function handleImportJSON() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        const result = validateImportData(data);
        if (!result.valid) return;

        if (result.warnings.length > 0) {
          setSaveError(result.warnings.join(" "));
        }

        if (canvasNodes.length > 0) {
          setPendingImport({ nodes: result.nodes, edges: result.edges });
        } else {
          applyImport(result.nodes, result.edges);
        }
      } catch {
        setSaveError("Invalid workflow file — please select a valid JSON export.");
      }
    };
    input.click();
  }

  function applyImport(nodes: Node[], edges: Edge[]) {
    setInitialNodes(nodes);
    setInitialEdges(edges);
    setCanvasNodes(nodes);
    setCanvasEdges(edges);
    setExecution(null);
    setValidationErrors([]);
    setCanvasKey((k) => k + 1);
    if (activeWorkspaceId) {
      saveWorkspace(activeWorkspaceId, nodes, edges);
    }
    onImport?.({ nodes, edges });
    setPendingImport(null);
  }

  const completedSteps =
    execution?.steps.filter((s) => s.status === "success").length ?? 0;
  const totalSteps = execution?.steps.length ?? 0;
  const formattedElapsed = React.useMemo(() => {
    if (elapsedMs < 1000) return `${elapsedMs}ms`;
    const secs = (elapsedMs / 1000).toFixed(1);
    return `${secs}s`;
  }, [elapsedMs]);

  // ── Starting Screen ──────────────────────────────────────────────
  if (showStartScreen) {
    return (
      <div className={`flex h-full items-center justify-center ${className ?? ""}`}>
        <div className="w-full max-w-xl px-6">
          <div className="mb-8 text-center">
            <h1 className="text-2xl font-bold text-foreground">{title}</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Create a new build or continue where you left off.
            </p>
          </div>

          <button
            onClick={handleStartNewBuild}
            className="group mb-6 flex w-full items-center gap-4 rounded-xl border border-dashed border-primary/30 bg-primary/5 px-5 py-4 text-left transition hover:bg-primary/10 hover:border-primary/50"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15 text-primary text-lg">
              +
            </div>
            <div>
              <div className="text-sm font-semibold text-foreground group-hover:text-primary transition">
                Create New Build
              </div>
              <div className="text-xs text-muted-foreground">
                Start with a blank canvas
              </div>
            </div>
          </button>

          {startScreenWorkspaces.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Your Saved Builds ({startScreenWorkspaces.length})
                </h2>
              </div>
              {startScreenWorkspaces.length > 3 && (
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter builds..."
                  className="mb-3 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/50"
                />
              )}
              <div className="space-y-2 max-h-[50vh] overflow-y-auto">
                {startScreenWorkspaces
                  .filter((ws) => !searchQuery || ws.name.toLowerCase().includes(searchQuery.toLowerCase()))
                  .map((ws) => (
                  <div
                    key={ws.id}
                    className="group flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 transition hover:bg-white/5 hover:border-white/20"
                  >
                    {renamingId === ws.id ? (
                      <div className="flex-1 min-w-0">
                        <input
                          autoFocus
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onFocus={(e) => e.target.select()}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleRenameFromStart(ws.id);
                            if (e.key === "Escape") { setRenamingId(null); setRenameValue(""); }
                          }}
                          onBlur={() => handleRenameFromStart(ws.id)}
                          className="w-full rounded-md border border-primary/30 bg-white/5 px-2 py-1 text-sm font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                        />
                      </div>
                    ) : (
                      <button
                        onClick={() => handleOpenWorkspace(ws)}
                        className="flex flex-1 items-center gap-3 min-w-0 text-left"
                      >
                        <CanvasThumbnail nodes={ws.nodes} edges={ws.edges} />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold text-foreground group-hover:text-primary transition truncate">
                            {ws.name}
                          </div>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                            <span className={complexityLabel(ws.nodes.length).color}>{complexityLabel(ws.nodes.length).label}</span>
                            <span>{ws.nodes.length} nodes</span>
                            <span>&middot;</span>
                            <span>{relativeTime(ws.updatedAt)}</span>
                          </div>
                        </div>
                      </button>
                    )}
                    <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => { setRenamingId(ws.id); setRenameValue(ws.name); setConfirmDeleteId(null); }}
                        className="rounded-md p-2 text-muted-foreground hover:bg-white/10 hover:text-foreground transition"
                        title="Rename"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleDuplicateFromStart(ws.id)}
                        className="rounded-md p-2 text-muted-foreground hover:bg-white/10 hover:text-foreground transition"
                        title="Duplicate"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="9" y="9" width="13" height="13" rx="2" />
                          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleDeleteFromStart(ws.id)}
                        className={`rounded-md p-2 transition ${
                          confirmDeleteId === ws.id
                            ? "bg-red-500/20 text-red-400"
                            : "text-muted-foreground hover:bg-white/10 hover:text-red-400"
                        }`}
                        title={confirmDeleteId === ws.id ? "Click again to confirm" : "Delete"}
                      >
                        {confirmDeleteId === ws.id ? (
                          <span className="text-xs font-medium px-1">Confirm?</span>
                        ) : (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`flex h-full flex-col ${className ?? ""}`}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 px-6 py-3">
        <div className="flex items-center gap-4">
          <button
            onClick={handleBackToStartScreen}
            className="rounded-lg border border-white/10 bg-white/5 p-1.5 text-muted-foreground hover:bg-white/10 hover:text-foreground transition"
            title="Back to builds"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5" /><path d="m12 19-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h1 className="text-xl font-bold text-foreground">{title}</h1>
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          </div>
          <WorkspaceManager
            canvasNodes={canvasNodes}
            canvasEdges={canvasEdges}
            onLoadWorkspace={handleLoadWorkspace}
            hasUnsavedChanges={hasUnsavedChanges}
          />
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowCredentialManager(true)}
          >
            Credentials
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setExecHistory(getExecutionHistory(storageKeyPrefix));
              setShowHistory((v) => !v);
            }}
          >
            History
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (activeWorkspaceId) setVersions(listVersions(activeWorkspaceId));
              setShowVersions((v) => !v);
            }}
          >
            Versions
          </Button>
          <Button variant="ghost" size="sm" onClick={handleImportJSON}>
            Import
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleExportJSON}
            disabled={canvasNodes.length === 0}
          >
            Export
          </Button>
          <Button
            size="sm"
            onClick={handleValidateAndRun}
            disabled={canvasNodes.length === 0 || isRunning}
          >
            {isRunning ? "Running..." : "Validate & Run"}
          </Button>
          {showAIChat && (
            <div className="ml-2 border-l border-white/10 pl-2">
              <Button
                variant={chatOpen ? "default" : "ghost"}
                size="sm"
                onClick={() => setChatOpen((v) => !v)}
                title={chatOpen ? "Close assistant" : "Open assistant"}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1.5">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
                Assistant
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Validation / Execution Panel */}
      {showExecutionPanel && (validationErrors.length > 0 || execution) && (
        <div className="border-b border-white/10 px-6 py-2 max-h-[40vh] overflow-y-auto" role="region" aria-label="Execution panel">
          {validationErrors.length > 0 && (
            <div className="space-y-1" role="alert" aria-live="assertive">
              <div className="flex items-center gap-2 text-xs font-semibold text-red-400 mb-1">
                <span aria-hidden="true">⚠</span>
                <span>{validationErrors.length} validation error{validationErrors.length > 1 ? "s" : ""}</span>
              </div>
              {validationErrors.map((err, i) => (
                <div key={i} className="flex items-center gap-2 text-xs text-red-400 rounded-md bg-red-500/5 px-2 py-1">
                  <span className="shrink-0" aria-hidden="true">⚠</span>
                  {err}
                </div>
              ))}
            </div>
          )}
          {execution && (
            <div className="space-y-1.5" role="status" aria-live="polite" aria-label="Workflow execution status">
              <div className="flex items-center gap-3">
                <span className="text-xs font-medium text-foreground">
                  {execution.status === "running"
                    ? `Running step ${completedSteps + 1} of ${totalSteps}...`
                    : execution.status === "completed"
                      ? `Completed ${totalSteps} steps`
                      : execution.status === "cancelled"
                        ? `Cancelled (${completedSteps}/${totalSteps} completed)`
                        : execution.status === "error"
                          ? `Finished with errors (${completedSteps}/${totalSteps} succeeded)`
                          : `${totalSteps} steps ready`}
                </span>
                {(execution.status === "running" || execution.status === "completed" || execution.status === "cancelled" || execution.status === "error") && (
                  <span className="text-[10px] text-muted-foreground tabular-nums">
                    {formattedElapsed}
                  </span>
                )}
                {execution.status === "running" && (
                  <button
                    onClick={handleCancelExecution}
                    aria-label="Cancel workflow execution"
                    className="rounded px-2 py-0.5 text-[10px] font-medium text-red-400 border border-red-400/30 hover:bg-red-500/10 transition"
                  >
                    Cancel
                  </button>
                )}
                {execution.totalTokens && execution.totalTokens.input > 0 && (
                  <span className="text-[10px] text-muted-foreground flex items-center gap-1.5 ml-auto mr-2">
                    <span title="Input tokens">↑{formatTokens(execution.totalTokens.input)}</span>
                    <span title="Output tokens">↓{formatTokens(execution.totalTokens.output)}</span>
                    <span className="text-amber-400/80" title="Estimated cost">{formatCost(execution.totalTokens.cost)}</span>
                  </span>
                )}
                {execution.status !== "idle" && (
                  <div
                    className="flex-1 h-1.5 rounded-full bg-white/5 max-w-[200px]"
                    role="progressbar"
                    aria-valuenow={completedSteps}
                    aria-valuemin={0}
                    aria-valuemax={totalSteps}
                    aria-label={`Execution progress: ${completedSteps} of ${totalSteps} steps completed`}
                  >
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        execution.status === "error" ? "bg-red-500" : "bg-emerald-500"
                      }`}
                      style={{
                        width: `${totalSteps > 0 ? (completedSteps / totalSteps) * 100 : 0}%`,
                      }}
                    />
                  </div>
                )}
              </div>
              <div className="space-y-1" role="list" aria-label="Execution steps">
                {execution.steps.map((step) => {
                  const style = STATUS_STYLES[step.status] ?? STATUS_STYLES.pending;
                  const isExpanded = expandedStep === step.nodeId;
                  const hasOutput = step.output || step.error;
                  return (
                    <div key={step.nodeId} role="listitem">
                      <button
                        onClick={() => setExpandedStep(isExpanded ? null : step.nodeId)}
                        disabled={!hasOutput}
                        aria-expanded={hasOutput ? isExpanded : undefined}
                        aria-label={`${step.label} (${step.nodeType}): ${step.status}${hasOutput ? ", click to expand" : ""}`}
                        className={`flex w-full items-center gap-2 rounded-md px-2 py-1 text-left transition ${style.bg} ${
                          hasOutput ? "cursor-pointer hover:bg-white/10" : "cursor-default"
                        }`}
                      >
                        <span className={`text-xs ${style.text} ${step.status === "running" ? "animate-pulse" : ""}`} aria-hidden="true">
                          {style.icon}
                        </span>
                        <span className={`text-xs font-medium ${style.text}`}>{step.label}</span>
                        <span className="text-[10px] text-muted-foreground">{step.nodeType}</span>
                        {(step.retryCount ?? 0) > 0 && (
                          <span className="text-[10px] text-amber-400" title={`Retried ${step.retryCount} time(s)`}>
                            ↻{step.retryCount}
                          </span>
                        )}
                        {step.tokenUsage && step.tokenUsage.input > 0 && (
                          <span className="text-[10px] text-muted-foreground/60" title={`${step.tokenUsage.input} in / ${step.tokenUsage.output} out`}>
                            {formatTokens(step.tokenUsage.input + step.tokenUsage.output)} tok
                          </span>
                        )}
                        {hasOutput && (
                          <span className="ml-auto text-[10px] text-muted-foreground">
                            {isExpanded ? "▲" : "▼"}
                          </span>
                        )}
                      </button>
                      {/* Streaming output (shown while running) */}
                      {step.status === "running" && step.streamingOutput && (
                        <pre className="mt-1 ml-5 rounded-md bg-black/20 p-2 text-[11px] text-emerald-400/80 whitespace-pre-wrap max-h-[200px] overflow-y-auto border border-emerald-500/10 animate-pulse">
                          {step.streamingOutput}
                          <span className="inline-block w-1.5 h-3 bg-emerald-400/60 ml-0.5 animate-pulse" />
                        </pre>
                      )}
                      {isExpanded && hasOutput && (
                        <pre className="mt-1 ml-5 rounded-md bg-black/20 p-2 text-[11px] text-muted-foreground whitespace-pre-wrap max-h-[200px] overflow-y-auto border border-white/5">
                          {step.error ? (
                            <span className="text-red-400">{step.error}</span>
                          ) : (
                            step.output
                          )}
                          {step.structuredOutput ? (
                            <details className="mt-2 border-t border-white/5 pt-2">
                              <summary className="text-[10px] text-muted-foreground/60 cursor-pointer hover:text-muted-foreground transition">
                                Structured Data (JSON)
                              </summary>
                              <pre className="mt-1 text-[10px] text-blue-400/70">
                                {JSON.stringify(step.structuredOutput, null, 2)}
                              </pre>
                            </details>
                          ) : null}
                        </pre>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Import confirmation dialog */}
      {pendingImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="import-dialog-title">
          <div className="w-80 rounded-xl border border-white/10 bg-neutral-900 p-5 shadow-2xl space-y-4">
            <h3 id="import-dialog-title" className="text-sm font-semibold text-foreground">Import workflow?</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              This will replace your current canvas with <span className="font-medium text-foreground">{pendingImport.nodes.length} nodes</span> and <span className="font-medium text-foreground">{pendingImport.edges.length} edges</span>.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setPendingImport(null)}
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-white/10 transition"
              >
                Cancel
              </button>
              <button
                onClick={() => applyImport(pendingImport.nodes, pendingImport.edges)}
                className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 transition"
              >
                Import & Replace
              </button>
            </div>
          </div>
        </div>
      )}

      {/* External modification banner */}
      {externallyModified && (
        <div className="flex items-center gap-2 border-b border-blue-500/20 bg-blue-500/10 px-6 py-2">
          <span className="text-xs text-blue-400 font-medium">This workspace was modified in another tab</span>
          <div className="ml-auto flex items-center gap-2">
            <button onClick={handleReloadFromStorage} className="text-xs text-blue-400 font-medium hover:text-blue-300 transition">Reload</button>
            <button onClick={() => setExternallyModified(false)} className="text-xs text-blue-400/60 hover:text-blue-400 transition">Dismiss</button>
          </div>
        </div>
      )}

      {/* Save error banner */}
      {saveError && (
        <div className="flex items-center gap-2 border-b border-amber-500/20 bg-amber-500/10 px-6 py-2" role="alert">
          <span className="text-xs text-amber-400 font-medium" aria-hidden="true">⚠</span>
          <span className="text-xs text-amber-400 font-medium">{saveError}</span>
          <button onClick={() => setSaveError(null)} aria-label="Dismiss error" className="ml-auto text-xs text-amber-400/60 hover:text-amber-400 transition">Dismiss</button>
        </div>
      )}

      {/* Execution history panel */}
      {showHistory && (
        <div className="border-b border-white/10 px-6 py-3 max-h-[30vh] overflow-y-auto">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Execution History ({execHistory.length})
            </h3>
            <div className="flex items-center gap-2">
              {compareIds && (
                <button onClick={() => setCompareIds(null)} className="text-xs text-amber-400 hover:text-amber-300 transition">Clear Compare</button>
              )}
              <button onClick={() => setShowHistory(false)} className="text-xs text-muted-foreground hover:text-foreground transition">Close</button>
            </div>
          </div>
          {execHistory.length === 0 ? (
            <div className="text-center py-4 text-xs text-muted-foreground">
              <p>Run your workflow to see results here.</p>
              <p className="mt-1">Each execution is saved automatically.</p>
            </div>
          ) : (
            <div className="space-y-1">
              {execHistory.map((entry) => {
                const isComparing = compareIds?.includes(entry.id);
                return (
                  <div
                    key={entry.id}
                    className={`flex items-center gap-3 rounded-md px-3 py-1.5 text-xs transition cursor-pointer hover:bg-white/5 ${
                      isComparing ? "bg-amber-500/10 border border-amber-500/20" : "bg-white/[0.02]"
                    }`}
                    onClick={() => {
                      if (!compareIds) {
                        setCompareIds([entry.id, ""]);
                      } else if (compareIds[1] === "") {
                        if (compareIds[0] !== entry.id) {
                          setCompareIds([compareIds[0], entry.id]);
                        }
                      } else {
                        setCompareIds([entry.id, ""]);
                      }
                    }}
                    title={compareIds?.[1] === "" ? "Click to compare with selected" : "Click to select for comparison"}
                  >
                    <span className={entry.status === "completed" ? "text-emerald-400" : "text-red-400"}>
                      {entry.status === "completed" ? "●" : "⚠"}
                    </span>
                    <span className="text-muted-foreground">{relativeTime(entry.startedAt)}</span>
                    <span className="text-foreground">{entry.successCount}/{entry.stepCount} steps</span>
                    {entry.errorCount > 0 && (
                      <span className="text-red-400">{entry.errorCount} errors</span>
                    )}
                    {entry.totalTokens && entry.totalTokens.input > 0 && (
                      <span className="text-muted-foreground/60 ml-auto">
                        {formatTokens(entry.totalTokens.input + entry.totalTokens.output)} tokens · {formatCost(entry.totalTokens.cost)}
                      </span>
                    )}
                    {entry.steps && entry.steps.length > 0 && (
                      <button
                        disabled={replayLoading}
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (replayExecId === entry.id) {
                            setReplayExecId(null);
                            setExecution(null);
                            return;
                          }
                          setReplayLoading(true);
                          setReplayExecId(entry.id);

                          // Try full data from IndexedDB first (has structuredOutput + full outputs)
                          try {
                            const full = await loadExecution(entry.id);
                            if (full) {
                              setExecution({
                                id: full.id,
                                status: full.status,
                                steps: full.steps.map((s) => ({
                                  nodeId: s.nodeId,
                                  nodeType: s.nodeType,
                                  label: s.label,
                                  status: s.status,
                                  output: s.output,
                                  structuredOutput: s.structuredOutput,
                                  error: s.error,
                                  startedAt: s.startedAt,
                                  completedAt: s.completedAt,
                                  tokenUsage: s.tokenUsage,
                                  retryCount: s.retryCount,
                                })),
                                startedAt: full.startedAt,
                                completedAt: full.completedAt,
                                totalTokens: full.totalTokens,
                              });
                              setReplayLoading(false);
                              return;
                            }
                          } catch {
                            // IndexedDB unavailable — fall through to localStorage
                          }

                          // Fallback: reconstruct from localStorage summary
                          setExecution({
                            id: entry.id,
                            status: (entry.status as WorkflowExecution["status"]) || "completed",
                            steps: (entry.steps ?? []).map((s) => ({
                              nodeId: s.nodeId,
                              nodeType: s.nodeType,
                              label: s.label,
                              status: s.status as "success" | "error" | "skipped" | "pending",
                              output: s.output,
                              error: s.error,
                            })),
                            startedAt: entry.startedAt,
                            completedAt: entry.completedAt,
                            totalTokens: entry.totalTokens,
                          });
                          setReplayLoading(false);
                        }}
                        className={`text-[10px] font-medium px-1.5 py-0.5 rounded transition ${
                          replayExecId === entry.id
                            ? "bg-primary/20 text-primary"
                            : "text-muted-foreground hover:text-primary hover:bg-primary/10"
                        }`}
                        title="View this execution's results on canvas"
                      >
                        {replayExecId === entry.id ? "Hide Results" : "View Results"}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {/* Comparison view */}
          {compareIds && compareIds[1] !== "" && (() => {
            const a = execHistory.find((e) => e.id === compareIds[0]);
            const b = execHistory.find((e) => e.id === compareIds[1]);
            if (!a || !b) return null;
            const tokenDiff = ((b.totalTokens?.input ?? 0) + (b.totalTokens?.output ?? 0)) - ((a.totalTokens?.input ?? 0) + (a.totalTokens?.output ?? 0));
            const costDiff = (b.totalTokens?.cost ?? 0) - (a.totalTokens?.cost ?? 0);
            return (
              <div className="mt-3 p-3 rounded-lg border border-amber-500/20 bg-amber-500/5">
                <h4 className="text-xs font-semibold text-amber-400 mb-2">Comparison</h4>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="text-muted-foreground">Metric</div>
                  <div className="text-muted-foreground">Run A ({relativeTime(a.startedAt)})</div>
                  <div className="text-muted-foreground">Run B ({relativeTime(b.startedAt)})</div>
                  <div className="text-foreground">Status</div>
                  <div className={a.status === "completed" ? "text-emerald-400" : "text-red-400"}>{a.status}</div>
                  <div className={b.status === "completed" ? "text-emerald-400" : "text-red-400"}>{b.status}</div>
                  <div className="text-foreground">Steps</div>
                  <div>{a.successCount}/{a.stepCount}</div>
                  <div>{b.successCount}/{b.stepCount}</div>
                  <div className="text-foreground">Tokens</div>
                  <div>{formatTokens((a.totalTokens?.input ?? 0) + (a.totalTokens?.output ?? 0))}</div>
                  <div>
                    {formatTokens((b.totalTokens?.input ?? 0) + (b.totalTokens?.output ?? 0))}
                    {tokenDiff !== 0 && (
                      <span className={`ml-1 ${tokenDiff > 0 ? "text-red-400" : "text-emerald-400"}`}>
                        {tokenDiff > 0 ? "+" : ""}{formatTokens(tokenDiff)}
                      </span>
                    )}
                  </div>
                  <div className="text-foreground">Cost</div>
                  <div>{formatCost(a.totalTokens?.cost ?? 0)}</div>
                  <div>
                    {formatCost(b.totalTokens?.cost ?? 0)}
                    {costDiff !== 0 && (
                      <span className={`ml-1 ${costDiff > 0 ? "text-red-400" : "text-emerald-400"}`}>
                        {costDiff > 0 ? "+" : ""}{formatCost(costDiff)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* Version Panel */}
      {showVersions && (
        <VersionPanel
          versions={versions}
          hasUnsavedChanges={hasUnsavedChanges}
          currentNodeCount={canvasNodes.length}
          currentEdgeCount={canvasEdges.length}
          onCreateVersion={handleCreateVersion}
          onLoadVersion={handleLoadVersion}
          onDeleteVersion={handleDeleteVersion}
          onAutoSave={handleAutoSaveVersion}
          onClose={() => setShowVersions(false)}
        />
      )}

      {/* Canvas + Chat Panel */}
      <div className="relative flex flex-1 overflow-hidden">
        {/* Main canvas area */}
        <div className="relative flex-1">
          <FlowCanvas
            key={canvasKey}
            initialTemplate={
              initialNodes.length > 0
                ? { id: "", name: "", description: "", category, nodes: initialNodes, edges: initialEdges, createdAt: "", isBuiltIn: false }
                : undefined
            }
            category={category}
            onNodesChange={setCanvasNodes}
            onEdgesChange={setCanvasEdges}
            customNodeTypes={mergedCustomNodeTypes}
            disableAutoLayout={disableAutoLayout}
            executingNodeIds={execution?.runningNodeIds}
            userNodeDefs={userNodeDefs}
            nodeOutputPreviews={execution?.steps
              .filter((s) => s.status === "success" || s.status === "error")
              .map((s) => ({
                nodeId: s.nodeId,
                status: s.status as "success" | "error",
                preview: s.error || s.output?.slice(0, 60) || "",
              }))}
          />
        </div>

        {/* Integrated chat sidebar */}
        {showAIChat && chatOpen && (
          <div className="w-[360px] shrink-0 flex flex-col">
            <BuilderChat
              currentNodes={canvasNodes}
              currentEdges={canvasEdges}
              category={category}
              onApplyFlow={handleApplyFlow}
              onUserNodeCreated={handleUserNodeCreated}
              onChat={onChat}
              apiKey={propApiKey}
              storageKeyPrefix={storageKeyPrefix}
            />
          </div>
        )}

        {/* Chat toggle button (when closed) */}
        {showAIChat && !chatOpen && (
          <button
            onClick={() => setChatOpen(true)}
            className="absolute bottom-6 right-6 z-30 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 hover:brightness-110 transition active:scale-95"
            title="Open Builder Assistant"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </button>
        )}
      </div>

      {/* Onboarding Tour */}
      {showTour && !showStartScreen && (
        <OnboardingTour onComplete={completeTour} onSkip={skipTour} />
      )}

      {/* Credential Manager */}
      {showCredentialManager && (
        <CredentialManager onClose={() => setShowCredentialManager(false)} storageKeyPrefix={storageKeyPrefix} />
      )}
    </div>
  );
}
