"use client";

import * as React from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  useReactFlow,
  useOnSelectionChange,
  useViewport,
  SelectionMode,
  type Connection,
  type Node,
  type Edge,
  type NodeChange,
  BackgroundVariant,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { PersonaNode } from "./nodes/persona-node";
import { AppNode } from "./nodes/app-node";
import { CompetitorNode } from "./nodes/competitor-node";
import { ActionNode } from "./nodes/action-node";
import { NoteNode } from "./nodes/note-node";
import { TriggerNode } from "./nodes/trigger-node";
import { ConditionNode } from "./nodes/condition-node";
import { TransformNode } from "./nodes/transform-node";
import { OutputNode } from "./nodes/output-node";
import { LLMNode } from "./nodes/llm-node";
import { StepNode } from "./nodes/step-node";
import { ConsensusNode } from "./nodes/consensus-node";
import { AffinityCategoryNode } from "./nodes/affinity-category-node";
import { ConfigNode } from "./nodes/config-node";
import { HttpNode } from "./nodes/http-node";
import { WebhookNode } from "./nodes/webhook-node";
import { EmailNode } from "./nodes/email-node";
import { DatabaseNode } from "./nodes/database-node";
import { StorageNode } from "./nodes/storage-node";
import { JsonNode } from "./nodes/json-node";
import { TextNode } from "./nodes/text-node";
import { AggregatorNode } from "./nodes/aggregator-node";
import { ValidatorNode } from "./nodes/validator-node";
import { FormatterNode } from "./nodes/formatter-node";
import { LoopNode } from "./nodes/loop-node";
import { SwitchNode } from "./nodes/switch-node";
import { DelayNode } from "./nodes/delay-node";
import { ErrorHandlerNode } from "./nodes/error-handler-node";
import { MergeNode } from "./nodes/merge-node";
import { ClassifierNode } from "./nodes/classifier-node";
import { SummarizerNode } from "./nodes/summarizer-node";
import { SearchNode } from "./nodes/search-node";
import { EmbeddingNode } from "./nodes/embedding-node";
import { ExtractorNode } from "./nodes/extractor-node";
import { HttpRequestNode } from "./nodes/http-request-node";
import { CpoReviewNode } from "./nodes/cpo-review-node";
import { RescoreNode } from "./nodes/rescore-node";
import { NodePalette } from "./node-palette";
import { NodeInspector } from "./node-inspector";
import { MobileToolbar } from "./mobile-toolbar";
import { NodeContextMenu } from "./node-context-menu";
import { TemplateManager } from "./template-manager";
import { TemplateSidebar } from "./template-sidebar";
import { BridgeWalkthroughTour, useBridgeTour } from "./bridge-walkthrough-tour";
import type { FlowTemplate } from "../lib/flow-templates";
import {
  builderTemplateToFlowNodes,
  getNodesCenter,
  type BuilderTemplate,
} from "../lib/builder-templates";
import { useUndoRedo } from "../hooks/use-undo-redo";
import { useClipboard } from "../hooks/use-clipboard";
import { useTouchDevice, useLongPress } from "../hooks/use-touch-device";
import {
  useNodeGroups,
  applyGroupDragConstraints,
  createGroupId,
} from "../hooks/use-node-groups";
import { autoLayout } from "../lib/auto-layout";
import { uid } from "../lib/utils";
import { useIsMobile } from "../hooks/use-mobile";
import type { UserNodeDefinition } from "../lib/user-nodes";

// ── Group color palette (rotating, visually distinct on dark bg) ──
const GROUP_COLORS = [
  { bg: "rgba(99, 102, 241, 0.08)", border: "rgba(99, 102, 241, 0.35)", text: "#818cf8" },   // indigo
  { bg: "rgba(244, 114, 182, 0.08)", border: "rgba(244, 114, 182, 0.35)", text: "#f472b6" },  // pink
  { bg: "rgba(251, 191, 36, 0.08)", border: "rgba(251, 191, 36, 0.35)", text: "#fbbf24" },    // amber
  { bg: "rgba(52, 211, 153, 0.08)", border: "rgba(52, 211, 153, 0.35)", text: "#34d399" },    // emerald
  { bg: "rgba(96, 165, 250, 0.08)", border: "rgba(96, 165, 250, 0.35)", text: "#60a5fa" },    // blue
  { bg: "rgba(251, 146, 60, 0.08)", border: "rgba(251, 146, 60, 0.35)", text: "#fb923c" },    // orange
  { bg: "rgba(167, 139, 250, 0.08)", border: "rgba(167, 139, 250, 0.35)", text: "#a78bfa" },  // violet
  { bg: "rgba(45, 212, 191, 0.08)", border: "rgba(45, 212, 191, 0.35)", text: "#2dd4bf" },    // teal
];

/** Deterministic color index from groupId string */
function groupColorIndex(groupId: string): number {
  let hash = 0;
  for (let i = 0; i < groupId.length; i++) hash = ((hash << 5) - hash + groupId.charCodeAt(i)) | 0;
  return Math.abs(hash) % GROUP_COLORS.length;
}

/** Restore locked-group CSS class from node data (survives serialization) */
function restoreGroupClassName(node: Node): Node {
  if (node.data?.groupId && !node.className?.includes("locked-group")) {
    const existing = node.className ? `${node.className} ` : "";
    return { ...node, className: `${existing}locked-group` };
  }
  return node;
}

// ── Error boundary for individual node rendering ──────────────
class NodeErrorBoundary extends React.Component<
  { children: React.ReactNode; nodeType: string },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400 max-w-[200px]">
          <div className="font-semibold mb-1">Node Error</div>
          <div className="text-[10px] text-red-400/70 break-words">
            {this.props.nodeType}: {this.state.error.message}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

/** Wrap a node component in an error boundary */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function withErrorBoundary<T = any>(
  Component: React.ComponentType<T>,
  nodeType: string
): React.ComponentType<T> {
  const Wrapped = (props: T) => (
    <NodeErrorBoundary nodeType={nodeType}>
      <Component {...(props as T & Record<string, unknown>)} />
    </NodeErrorBoundary>
  );
  Wrapped.displayName = `ErrorBoundary(${nodeType})`;
  return Wrapped as React.ComponentType<T>;
}

const nodeTypes = {
  personaNode: withErrorBoundary(PersonaNode, "personaNode"),
  appNode: withErrorBoundary(AppNode, "appNode"),
  competitorNode: withErrorBoundary(CompetitorNode, "competitorNode"),
  actionNode: withErrorBoundary(ActionNode, "actionNode"),
  noteNode: withErrorBoundary(NoteNode, "noteNode"),
  triggerNode: withErrorBoundary(TriggerNode, "triggerNode"),
  conditionNode: withErrorBoundary(ConditionNode, "conditionNode"),
  transformNode: withErrorBoundary(TransformNode, "transformNode"),
  outputNode: withErrorBoundary(OutputNode, "outputNode"),
  llmNode: withErrorBoundary(LLMNode, "llmNode"),
  stepNode: withErrorBoundary(StepNode, "stepNode"),
  consensusNode: withErrorBoundary(ConsensusNode, "consensusNode"),
  affinityCategoryNode: withErrorBoundary(AffinityCategoryNode, "affinityCategoryNode"),
  configNode: withErrorBoundary(ConfigNode, "configNode"),
  httpNode: withErrorBoundary(HttpNode, "httpNode"),
  webhookNode: withErrorBoundary(WebhookNode, "webhookNode"),
  emailNode: withErrorBoundary(EmailNode, "emailNode"),
  databaseNode: withErrorBoundary(DatabaseNode, "databaseNode"),
  storageNode: withErrorBoundary(StorageNode, "storageNode"),
  jsonNode: withErrorBoundary(JsonNode, "jsonNode"),
  textNode: withErrorBoundary(TextNode, "textNode"),
  aggregatorNode: withErrorBoundary(AggregatorNode, "aggregatorNode"),
  validatorNode: withErrorBoundary(ValidatorNode, "validatorNode"),
  formatterNode: withErrorBoundary(FormatterNode, "formatterNode"),
  loopNode: withErrorBoundary(LoopNode, "loopNode"),
  switchNode: withErrorBoundary(SwitchNode, "switchNode"),
  delayNode: withErrorBoundary(DelayNode, "delayNode"),
  errorHandlerNode: withErrorBoundary(ErrorHandlerNode, "errorHandlerNode"),
  mergeNode: withErrorBoundary(MergeNode, "mergeNode"),
  classifierNode: withErrorBoundary(ClassifierNode, "classifierNode"),
  summarizerNode: withErrorBoundary(SummarizerNode, "summarizerNode"),
  searchNode: withErrorBoundary(SearchNode, "searchNode"),
  embeddingNode: withErrorBoundary(EmbeddingNode, "embeddingNode"),
  extractorNode: withErrorBoundary(ExtractorNode, "extractorNode"),
  httpRequestNode: withErrorBoundary(HttpRequestNode, "httpRequestNode"),
  cpoReviewNode: withErrorBoundary(CpoReviewNode, "cpoReviewNode"),
  rescoreNode: withErrorBoundary(RescoreNode, "rescoreNode"),
};

type NodeOutputPreview = {
  nodeId: string;
  status: "success" | "error" | "running" | "skipped";
  preview: string;
};

type FlowCanvasProps = {
  initialTemplate?: FlowTemplate | null;
  category: FlowTemplate["category"];
  onNodesChange?: (nodes: Node[]) => void;
  onEdgesChange?: (edges: Edge[]) => void;
  /** Custom node types to register alongside built-in ones */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  customNodeTypes?: Record<string, React.ComponentType<any>>;
  /** Custom palette items for the node sidebar */
  customPaletteItems?: import("../types").CustomPaletteItem[];
  /** Custom node type display info for the inspector */
  customNodeTypeInfo?: Record<string, import("../types").CustomNodeTypeInfo>;
  /** Custom editor components for the inspector */
  customNodeEditors?: Record<string, import("../types").CustomNodeEditor>;
  /** Disable auto-layout on template load */
  disableAutoLayout?: boolean;
  /** IDs of nodes currently executing (shown with pulsing highlight) */
  executingNodeIds?: string[];
  /** User-created custom node definitions (for the palette) */
  userNodeDefs?: UserNodeDefinition[];
  /** Node output previews to display as badges on nodes */
  nodeOutputPreviews?: NodeOutputPreview[];
};

export function FlowCanvas(props: FlowCanvasProps) {
  return (
    <ReactFlowProvider>
      <FlowCanvasInner {...props} />
    </ReactFlowProvider>
  );
}

// ── Snap-to-grid and alignment guides ──────────────────────────
const SNAP_GRID: [number, number] = [20, 20];

type AlignmentGuide = {
  type: "horizontal" | "vertical";
  position: number; // px in flow coordinates
  start: number;
  end: number;
};

const ALIGNMENT_THRESHOLD = 8; // snap to guide when within this distance

function computeAlignmentGuides(
  movingNodeId: string,
  movingX: number,
  movingY: number,
  movingW: number,
  movingH: number,
  allNodes: Node[],
  threshold: number = ALIGNMENT_THRESHOLD
): { guides: AlignmentGuide[]; snapX: number | null; snapY: number | null } {
  const guides: AlignmentGuide[] = [];
  let snapX: number | null = null;
  let snapY: number | null = null;
  let bestSnapXDist = Infinity;
  let bestSnapYDist = Infinity;

  const movingCenterX = movingX + movingW / 2;
  const movingCenterY = movingY + movingH / 2;
  const movingRight = movingX + movingW;
  const movingBottom = movingY + movingH;

  for (const node of allNodes) {
    if (node.id === movingNodeId) continue;
    const measured = (node as { measured?: { width?: number; height?: number } }).measured;
    const nw = measured?.width ?? 220;
    const nh = measured?.height ?? 130;
    const nx = node.position.x;
    const ny = node.position.y;
    const ncx = nx + nw / 2;
    const ncy = ny + nh / 2;
    const nRight = nx + nw;
    const nBottom = ny + nh;

    // Vertical guides (X alignment)
    const xChecks = [
      { moving: movingX, target: nx, label: "left-left" },
      { moving: movingCenterX, target: ncx, label: "center-center" },
      { moving: movingRight, target: nRight, label: "right-right" },
      { moving: movingX, target: nRight, label: "left-right" },
      { moving: movingRight, target: nx, label: "right-left" },
    ];

    for (const check of xChecks) {
      const dist = Math.abs(check.moving - check.target);
      if (dist < threshold) {
        guides.push({
          type: "vertical",
          position: check.target,
          start: Math.min(movingY, ny) - 20,
          end: Math.max(movingBottom, nBottom) + 20,
        });
        // Snap: adjust movingX so check.moving === check.target
        if (dist < bestSnapXDist) {
          bestSnapXDist = dist;
          snapX = check.target - (check.moving - movingX);
        }
      }
    }

    // Horizontal guides (Y alignment)
    const yChecks = [
      { moving: movingY, target: ny, label: "top-top" },
      { moving: movingCenterY, target: ncy, label: "center-center" },
      { moving: movingBottom, target: nBottom, label: "bottom-bottom" },
      { moving: movingY, target: nBottom, label: "top-bottom" },
      { moving: movingBottom, target: ny, label: "bottom-top" },
    ];

    for (const check of yChecks) {
      const dist = Math.abs(check.moving - check.target);
      if (dist < threshold) {
        guides.push({
          type: "horizontal",
          position: check.target,
          start: Math.min(movingX, nx) - 20,
          end: Math.max(movingRight, nRight) + 20,
        });
        if (dist < bestSnapYDist) {
          bestSnapYDist = dist;
          snapY = check.target - (check.moving - movingY);
        }
      }
    }
  }

  return { guides, snapX, snapY };
}

function FlowCanvasInner({
  initialTemplate,
  category,
  onNodesChange: onNodesChangeCb,
  onEdgesChange: onEdgesChangeCb,
  customNodeTypes: customNodeTypesProp,
  customPaletteItems,
  customNodeTypeInfo,
  customNodeEditors,
  disableAutoLayout = false,
  executingNodeIds,
  userNodeDefs,
  nodeOutputPreviews,
}: FlowCanvasProps) {
  // Merge built-in + custom node types (wrap custom ones in error boundaries)
  const mergedNodeTypes = React.useMemo(() => {
    if (!customNodeTypesProp) return nodeTypes;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wrapped: Record<string, React.ComponentType<any>> = {};
    for (const [key, Comp] of Object.entries(customNodeTypesProp)) {
      wrapped[key] = withErrorBoundary(Comp, key);
    }
    return { ...nodeTypes, ...wrapped };
  }, [customNodeTypesProp]);

  const { screenToFlowPosition, fitView, getNodes } = useReactFlow();
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const [nodes, setNodes, rawOnNodesChange] = useNodesState(
    initialTemplate
      ? (disableAutoLayout ? initialTemplate.nodes : autoLayout(initialTemplate.nodes)).map(restoreGroupClassName)
      : []
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState(
    initialTemplate?.edges ?? []
  );
  const [showTemplates, setShowTemplates] = React.useState(!initialTemplate);
  const [showTemplateSidebar, setShowTemplateSidebar] = React.useState(false);
  const {
    showBridgeTour,
    startBridgeTour,
    completeBridgeTour,
    skipBridgeTour,
  } = useBridgeTour();
  const [isDragOver, setIsDragOver] = React.useState(false);
  const [pendingTemplate, setPendingTemplate] = React.useState<FlowTemplate | null>(null);
  const pendingBridgeTourRef = React.useRef(false);
  const [showShortcuts, setShowShortcuts] = React.useState(false);
  const [showMobilePalette, setShowMobilePalette] = React.useState(false);
  const [snapToGrid, setSnapToGrid] = React.useState(true);
  const [alignmentGuides, setAlignmentGuides] = React.useState<AlignmentGuide[]>([]);
  const [toastMessage, setToastMessage] = React.useState<string | null>(null);
  const toastTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = React.useCallback((msg: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToastMessage(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToastMessage(null), 3000);
  }, []);
  // Clean up toast timer on unmount
  React.useEffect(() => () => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
  }, []);
  const [needsPostRenderLayout, setNeedsPostRenderLayout] = React.useState(!!initialTemplate);

  // Post-render auto-layout: React Flow measures node dimensions asynchronously
  // after the first paint. We wait 100ms for measurements to populate, then re-run
  // layout with real sizes. This is the standard React Flow pattern — there's no
  // synchronous API to observe when all nodes are measured.
  React.useEffect(() => {
    if (!needsPostRenderLayout) return;
    const timer = setTimeout(() => {
      const measured = getNodes();
      if (measured.length > 0 && measured.some((n) => (n as { measured?: { width?: number } }).measured?.width)) {
        setNodes(autoLayout(measured));
        setTimeout(() => fitView({ padding: 0.15 }), 50);
      }
      setNeedsPostRenderLayout(false);
    }, 100);
    return () => clearTimeout(timer);
  }, [needsPostRenderLayout, getNodes, setNodes, fitView]);
  const [selectedNodeId, setSelectedNodeId] = React.useState<string | null>(
    null
  );
  const [selectedNodeIds, setSelectedNodeIds] = React.useState<string[]>([]);
  const [contextMenu, setContextMenu] = React.useState<
    | { type: "node"; nodeId: string; x: number; y: number }
    | { type: "selection"; nodeIds: string[]; x: number; y: number }
    | null
  >(null);

  // ── Touch / mobile detection ────────────────────────────────
  const { isTouchDevice } = useTouchDevice();

  // Adaptive snap grid: larger on touch for easier alignment
  const activeSnapGrid: [number, number] = isTouchDevice ? [40, 40] : SNAP_GRID;
  const activeAlignmentThreshold = isTouchDevice ? 16 : ALIGNMENT_THRESHOLD;

  // Long-press handler for context menu on touch
  const longPressHandlers = useLongPress(
    React.useCallback(
      (coords: { clientX: number; clientY: number }) => {
        // Find if touch hit a node via selection state
        const selected = nodes.filter((n) => n.selected);
        if (selected.length === 1) {
          setContextMenu({
            type: "node",
            nodeId: selected[0].id,
            x: coords.clientX,
            y: coords.clientY,
          });
        } else if (selected.length > 1) {
          setContextMenu({
            type: "selection",
            nodeIds: selected.map((n) => n.id),
            x: coords.clientX,
            y: coords.clientY,
          });
        }
      },
      [nodes]
    ),
    500
  );

  // ── Hooks ────────────────────────────────────────────────────
  const setNodesDirectly = React.useCallback(
    (n: Node[]) => setNodes(n),
    [setNodes]
  );
  const setEdgesDirectly = React.useCallback(
    (e: Edge[]) => setEdges(e),
    [setEdges]
  );
  const { undo, redo, canUndo, canRedo } = useUndoRedo(
    nodes,
    edges,
    setNodesDirectly,
    setEdgesDirectly
  );

  const { lockedGroups, isNodeInLockedGroup, getGroupId } =
    useNodeGroups(nodes);

  useClipboard(nodes, edges, setNodes, setEdges);
  const isMobile = useIsMobile();

  // Highlight executing nodes with a pulsing CSS class
  const prevExecutingRef = React.useRef<Set<string>>(new Set());
  React.useEffect(() => {
    const executingSet = new Set(executingNodeIds ?? []);
    const prevSet = prevExecutingRef.current;
    // Only update if the set actually changed
    const changed =
      executingSet.size !== prevSet.size ||
      [...executingSet].some((id) => !prevSet.has(id));
    if (!changed) return;
    prevExecutingRef.current = executingSet;
    setNodes((nds) =>
      nds.map((n) => {
        const isExecuting = executingSet.has(n.id);
        const hasClass = n.className?.includes("node-executing");
        if (isExecuting && !hasClass) {
          return { ...n, className: `${n.className ?? ""} node-executing`.trim() };
        }
        if (!isExecuting && hasClass) {
          return { ...n, className: (n.className ?? "").replace(/\s*node-executing/g, "").trim() || undefined };
        }
        return n;
      })
    );
  }, [executingNodeIds, setNodes]);

  // Track multi-selection
  useOnSelectionChange({
    onChange: React.useCallback(
      ({ nodes: selNodes }: { nodes: Node[] }) => {
        const ids = selNodes.map((n) => n.id);
        setSelectedNodeIds(ids);
        if (ids.length === 1) {
          setSelectedNodeId(ids[0]);
        } else if (ids.length === 0) {
          setSelectedNodeId(null);
        }
      },
      []
    ),
  });

  const selectedNode = React.useMemo(
    () => nodes.find((n) => n.id === selectedNodeId) ?? null,
    [nodes, selectedNodeId]
  );

  // ── Notify parent (use refs to avoid re-render churn) ────────
  const onNodesChangeCbRef = React.useRef(onNodesChangeCb);
  onNodesChangeCbRef.current = onNodesChangeCb;
  const onEdgesChangeCbRef = React.useRef(onEdgesChangeCb);
  onEdgesChangeCbRef.current = onEdgesChangeCb;

  React.useEffect(() => {
    onNodesChangeCbRef.current?.(nodes);
  }, [nodes]);

  React.useEffect(() => {
    onEdgesChangeCbRef.current?.(edges);
  }, [edges]);

  // ── Delete/Backspace key handler ────────────────────────────
  // Use refs to avoid re-registering the listener on every node/edge change
  const nodesRef = React.useRef(nodes);
  nodesRef.current = nodes;
  const lockedGroupsRef = React.useRef(lockedGroups);
  lockedGroupsRef.current = lockedGroups;
  const isNodeInLockedGroupRef = React.useRef(isNodeInLockedGroup);
  isNodeInLockedGroupRef.current = isNodeInLockedGroup;

  React.useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "Escape" && !showTemplates && !pendingTemplate && !showShortcuts) {
        setNodes((nds) => nds.map((n) => (n.selected ? { ...n, selected: false } : n)));
        setEdges((eds) => eds.map((edge) => (edge.selected ? { ...edge, selected: false } : edge)));
        setSelectedNodeId(null);
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        const selected = nodesRef.current.filter((n) => n.selected);
        if (selected.length === 0) return;
        e.preventDefault();
        const ids = selected.map((n) => n.id);
        const deletable = ids.filter((id) => !isNodeInLockedGroupRef.current(id));

        // Allow deleting entire locked groups when all members are selected
        const lockedIds = ids.filter((id) => isNodeInLockedGroupRef.current(id));
        const groupsToDelete = new Set<string>();
        for (const id of lockedIds) {
          const gid = nodesRef.current.find((n) => n.id === id)?.data?.groupId as string | undefined;
          if (gid) groupsToDelete.add(gid);
        }
        // Check if all members of each group are selected — if so, allow deletion
        const fullySelectedGroupMembers: string[] = [];
        for (const gid of groupsToDelete) {
          const members = lockedGroupsRef.current.get(gid);
          if (members && [...members].every((mid) => ids.includes(mid))) {
            fullySelectedGroupMembers.push(...members);
          }
        }

        const allDeletable = new Set([...deletable, ...fullySelectedGroupMembers]);
        if (allDeletable.size === 0) {
          showToast("All selected nodes are in locked groups. Unlock first.");
          return;
        }
        setNodes((nds) => nds.filter((n) => !allDeletable.has(n.id)));
        setEdges((eds) => eds.filter((e) => !allDeletable.has(e.source) && !allDeletable.has(e.target)));
        setSelectedNodeId(null);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [nodes, isNodeInLockedGroup, setNodes, setEdges, showTemplates, pendingTemplate, showShortcuts, showToast]);

  // ── Wrap onNodesChange to enforce group constraints + alignment guides ──
  // Uses getNodes() instead of `nodes` closure to avoid recreating this callback
  // on every node change, which would break memoization during drags.
  const alignmentGuidesRef = React.useRef(alignmentGuides);
  alignmentGuidesRef.current = alignmentGuides;
  const handleNodesChange = React.useCallback(
    (changes: NodeChange[]) => {
      const currentNodes = getNodes();
      const constrained = applyGroupDragConstraints(
        changes,
        currentNodes,
        lockedGroups
      );

      // Compute alignment guides during position changes (dragging)
      // AND apply magnetic snap — actually move nodes to snapped positions
      const posChanges = constrained.filter(
        (c) => c.type === "position" && c.dragging && c.position
      );
      if (posChanges.length === 1) {
        const change = posChanges[0] as { id: string; position?: { x: number; y: number }; type: string; dragging?: boolean };
        if (change.position) {
          const movingNode = currentNodes.find((n: Node) => n.id === change.id);
          const measured = (movingNode as { measured?: { width?: number; height?: number } } | undefined)?.measured;
          const w = measured?.width ?? 220;
          const h = measured?.height ?? 130;
          const { guides, snapX, snapY } = computeAlignmentGuides(
            change.id,
            change.position.x,
            change.position.y,
            w,
            h,
            currentNodes
          );
          setAlignmentGuides(guides);

          // Magnetic snap: actually move the node to the snapped position
          if (snapX !== null || snapY !== null) {
            change.position = {
              x: snapX ?? change.position.x,
              y: snapY ?? change.position.y,
            };
          }
        }
      } else {
        // Clear guides when not dragging a single node
        const anyDragging = constrained.some(
          (c) => c.type === "position" && (c as { dragging?: boolean }).dragging
        );
        if (!anyDragging && alignmentGuidesRef.current.length > 0) {
          setAlignmentGuides([]);
        }
      }

      // Clear guides when drag ends
      const dragEnd = constrained.some(
        (c) => c.type === "position" && (c as { dragging?: boolean }).dragging === false
      );
      if (dragEnd) {
        setAlignmentGuides([]);
      }

      rawOnNodesChange(constrained);
    },
    [rawOnNodesChange, lockedGroups, getNodes]
  );

  // ── Connections ──────────────────────────────────────────────
  const onConnect = React.useCallback(
    (params: Connection) => {
      setEdges((eds) =>
        addEdge({ ...params, type: "smoothstep", animated: true }, eds)
      );
    },
    [setEdges]
  );

  // ── Drag & Drop ──────────────────────────────────────────────
  const onDragOver = React.useCallback((event: React.DragEvent) => {
    event.preventDefault();
    const hasTemplate =
      event.dataTransfer.types.includes("application/builder-template") ||
      event.dataTransfer.types.includes("application/reactflow-template");
    event.dataTransfer.dropEffect = hasTemplate ? "copy" : "move";
    setIsDragOver(true);
  }, []);

  const onDragLeave = React.useCallback((event: React.DragEvent) => {
    // Only set false when actually leaving the container (not entering a child)
    if (event.currentTarget === event.target || !event.currentTarget.contains(event.relatedTarget as globalThis.Node)) {
      setIsDragOver(false);
    }
  }, []);

  const onDrop = React.useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      setIsDragOver(false);

      // Handle template drops from sidebar
      const templateStr = event.dataTransfer.getData("application/reactflow-template");
      if (templateStr) {
        try {
          const template: FlowTemplate = JSON.parse(templateStr);
          const dropPos = screenToFlowPosition({
            x: event.clientX,
            y: event.clientY,
          });
          const minX = Math.min(...template.nodes.map((n) => n.position.x));
          const minY = Math.min(...template.nodes.map((n) => n.position.y));
          const suffix = uid("drop");
          const idMap: Record<string, string> = {};
          // Auto-lock dropped template nodes as a group
          const gid = createGroupId();
          const newNodes = template.nodes.map((n) => {
            const newId = `${n.type}-${suffix}-${n.id}`;
            idMap[n.id] = newId;
            return {
              ...n,
              id: newId,
              position: {
                x: dropPos.x + (n.position.x - minX),
                y: dropPos.y + (n.position.y - minY),
              },
              data: { ...JSON.parse(JSON.stringify(n.data)), groupId: gid },
              className: "locked-group",
            };
          });
          const newEdges = template.edges.map((e) => ({
            ...e,
            id: `e-${suffix}-${e.id}`,
            source: idMap[e.source] ?? e.source,
            target: idMap[e.target] ?? e.target,
          }));
          setNodes((nds) => [...nds, ...newNodes]);
          setEdges((eds) => [...eds, ...newEdges]);
        } catch {
          // ignore malformed template data
        }
        return;
      }

      // Builder template drop
      const builderTemplateStr = event.dataTransfer.getData(
        "application/builder-template"
      );
      if (builderTemplateStr) {
        try {
          const template: BuilderTemplate = JSON.parse(builderTemplateStr);
          const dropPos = screenToFlowPosition({
            x: event.clientX,
            y: event.clientY,
          });
          const { nodes: newNodes, edges: newEdges } =
            builderTemplateToFlowNodes(template, 0);
          const center = getNodesCenter(newNodes);
          // Auto-lock dropped template nodes as a group
          const gid = createGroupId();
          const adjusted = newNodes.map((n) => ({
            ...n,
            position: {
              x: n.position.x + dropPos.x - center.x,
              y: n.position.y + dropPos.y - center.y,
            },
            data: { ...JSON.parse(JSON.stringify(n.data)), groupId: gid },
            className: "locked-group",
          }));
          setNodes((nds) => [...nds, ...adjusted]);
          setEdges((eds) => [...eds, ...newEdges]);
        } catch {
          // ignore
        }
        return;
      }

      // Single node drop from palette
      const type = event.dataTransfer.getData("application/reactflow-type");
      const dataStr = event.dataTransfer.getData("application/reactflow-data");
      if (!type) return;

      let data: Record<string, unknown> = {};
      if (dataStr) {
        try { data = JSON.parse(dataStr); } catch { /* ignore malformed */ }
      }
      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const newNode: Node = {
        id: uid(type),
        type,
        position,
        data,
      };

      setNodes((nds) => [...nds, newNode]);
    },
    [setNodes, setEdges, screenToFlowPosition]
  );

  // ── Node interactions ────────────────────────────────────────
  const handleNodeClick = React.useCallback(
    (_event: React.MouseEvent, node: Node) => {
      setSelectedNodeId(node.id);
    },
    []
  );

  const handlePaneClick = React.useCallback(() => {
    setSelectedNodeId(null);
    setContextMenu(null);
  }, []);

  const handleNodeContextMenu = React.useCallback(
    (event: React.MouseEvent, node: Node) => {
      event.preventDefault();
      setContextMenu({
        type: "node",
        nodeId: node.id,
        x: event.clientX,
        y: event.clientY,
      });
    },
    []
  );

  const handleSelectionContextMenu = React.useCallback(
    (event: React.MouseEvent, selNodes: Node[]) => {
      event.preventDefault();
      setContextMenu({
        type: "selection",
        nodeIds: selNodes.map((n) => n.id),
        x: event.clientX,
        y: event.clientY,
      });
    },
    []
  );

  const handleDuplicateNode = React.useCallback(
    (nodeId: string) => {
      setNodes((nds) => {
        const src = nds.find((n) => n.id === nodeId);
        if (!src) return nds;
        const dup: Node = {
          id: uid(src.type ?? "node"),
          type: src.type,
          position: { x: src.position.x + 40, y: src.position.y + 40 },
          data: JSON.parse(JSON.stringify(src.data)),
        };
        return [...nds, dup];
      });
    },
    [setNodes]
  );

  // Track how many nodes have been tap-added so successive taps offset vertically
  const TAP_ADD_OFFSET_PX = 80;   // approximate node height + gap
  const TAP_ADD_RESET_MS = 5000;  // reset stacking offset after idle
  const tapAddCountRef = React.useRef(0);
  const tapResetTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    return () => {
      if (tapResetTimerRef.current) clearTimeout(tapResetTimerRef.current);
    };
  }, []);

  const addNodeAtCenter = React.useCallback(
    (type: string, data: Record<string, unknown>) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const center = screenToFlowPosition({
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      });
      const offset = tapAddCountRef.current * TAP_ADD_OFFSET_PX;
      tapAddCountRef.current += 1;

      if (tapResetTimerRef.current) clearTimeout(tapResetTimerRef.current);
      tapResetTimerRef.current = setTimeout(() => {
        tapAddCountRef.current = 0;
      }, TAP_ADD_RESET_MS);

      const newNode: Node = {
        id: uid(type),
        type,
        position: { x: center.x - 100, y: center.y - 50 + offset },
        data,
      };
      setNodes((nds) => [...nds, newNode]);
    },
    [screenToFlowPosition, setNodes]
  );

  const handleNodeUpdate = React.useCallback(
    (nodeId: string, data: Record<string, unknown>) => {
      setNodes((nds) =>
        nds.map((n) => (n.id === nodeId ? { ...n, data } : n))
      );
    },
    [setNodes]
  );

  const handleNodeDelete = React.useCallback(
    (nodeId: string) => {
      // Don't allow deleting individual nodes that are in a locked group
      if (isNodeInLockedGroup(nodeId)) {
        showToast("This node is in a locked group. Unlock the group first.");
        return;
      }
      setNodes((nds) => nds.filter((n) => n.id !== nodeId));
      setEdges((eds) =>
        eds.filter((e) => e.source !== nodeId && e.target !== nodeId)
      );
      setSelectedNodeId(null);
    },
    [setNodes, setEdges, isNodeInLockedGroup]
  );

  const handleDeleteSelection = React.useCallback(
    (nodeIds: string[]) => {
      // Filter out nodes that belong to locked groups
      const deletable = nodeIds.filter((id) => !isNodeInLockedGroup(id));
      if (deletable.length === 0) {
        showToast("All selected nodes are in locked groups. Unlock the groups first.");
        return;
      }
      const idSet = new Set(deletable);
      setNodes((nds) => nds.filter((n) => !idSet.has(n.id)));
      setEdges((eds) =>
        eds.filter((e) => !idSet.has(e.source) && !idSet.has(e.target))
      );
      setSelectedNodeId(null);
    },
    [setNodes, setEdges, isNodeInLockedGroup]
  );

  // Mobile: delete whatever is currently selected (single node or multi-selection)
  const handleDeleteCurrentSelection = React.useCallback(() => {
    const toDelete = selectedNodeIds.length > 0
      ? selectedNodeIds
      : selectedNodeId ? [selectedNodeId] : [];
    if (toDelete.length > 0) handleDeleteSelection(toDelete);
  }, [selectedNodeId, selectedNodeIds, handleDeleteSelection]);

  // ── Delete an entire group (all member nodes + their edges) ──
  const handleDeleteGroup = React.useCallback(
    (groupId: string) => {
      const members = lockedGroups.get(groupId);
      if (!members) return;
      const idSet = new Set(members);
      setNodes((nds) => nds.filter((n) => !idSet.has(n.id)));
      setEdges((eds) =>
        eds.filter((e) => !idSet.has(e.source) && !idSet.has(e.target))
      );
      setSelectedNodeId(null);
      setSelectedNodeIds([]);
    },
    [lockedGroups, setNodes, setEdges]
  );

  // ── Lock / Unlock groups ─────────────────────────────────────
  const handleLockGroup = React.useCallback(
    (nodeIds: string[]) => {
      const gid = createGroupId();
      setNodes((nds) =>
        nds.map((n) =>
          nodeIds.includes(n.id)
            ? { ...n, data: { ...n.data, groupId: gid }, className: "locked-group" }
            : n
        )
      );
    },
    [setNodes]
  );

  const handleUnlockGroup = React.useCallback(
    (nodeIds: string[]) => {
      // Find the groupId from any node in the selection
      const node = nodes.find(
        (n) => nodeIds.includes(n.id) && n.data?.groupId
      );
      if (!node?.data?.groupId) return;
      const gid = node.data.groupId as string;
      setNodes((nds) =>
        nds.map((n) =>
          n.data?.groupId === gid
            ? {
                ...n,
                data: { ...n.data, groupId: undefined },
                className: (n.className ?? "").replace(/\blocked-group\b/g, "").trim() || undefined,
              }
            : n
        )
      );
    },
    [nodes, setNodes]
  );

  // ── Select an entire group (deselect everything else) ────────
  const handleSelectGroup = React.useCallback(
    (groupId: string) => {
      const members = lockedGroups.get(groupId);
      if (!members) return;
      setNodes((nds) =>
        nds.map((n) => ({ ...n, selected: members.has(n.id) }))
      );
      setSelectedNodeIds([...members]);
      setSelectedNodeId(null);
      setContextMenu(null);
    },
    [lockedGroups, setNodes]
  );

  // ── Merge for parent (My Templates panel / sidebar) ──────────
  const mergeNodesIntoCanvas = React.useCallback(
    (newNodes: Node[], newEdges: Edge[]) => {
      // Auto-lock merged template nodes as a group
      const gid = createGroupId();
      const lockedNodes = newNodes.map((n) => ({
        ...n,
        data: { ...JSON.parse(JSON.stringify(n.data)), groupId: gid },
        className: "locked-group",
      }));
      setNodes((nds) => [...nds, ...lockedNodes]);
      setEdges((eds) => [...eds, ...newEdges]);
    },
    [setNodes, setEdges]
  );

  function handleLoadTemplate(template: FlowTemplate) {
    // Confirm before replacing existing canvas content
    if (nodes.length > 0) {
      setPendingTemplate(template);
      return;
    }
    applyTemplate(template);
  }

  function applyTemplate(template: FlowTemplate) {
    const freshNodes = template.nodes.map((n) => ({
      ...n,
      data: JSON.parse(JSON.stringify(n.data)),
    }));
    setNodes(autoLayout(freshNodes));
    setEdges(template.edges.map((e) => ({ ...e })));
    setShowTemplates(false);
    setSelectedNodeId(null);
    setNeedsPostRenderLayout(true);
    setPendingTemplate(null);

    // If a bridge tour was requested, start it after DOM renders the new nodes
    if (pendingBridgeTourRef.current) {
      pendingBridgeTourRef.current = false;
      setTimeout(() => startBridgeTour(), 300);
    }
  }

  // ── Check if context menu target is locked ───────────────────
  const contextMenuIsLocked = React.useMemo(() => {
    if (!contextMenu) return false;
    if (contextMenu.type === "node") {
      return isNodeInLockedGroup(contextMenu.nodeId);
    }
    return contextMenu.nodeIds.some((id) => isNodeInLockedGroup(id));
  }, [contextMenu, isNodeInLockedGroup]);

  const handleAutoLayout = React.useCallback(() => {
    const measured = getNodes();
    setNodes(autoLayout(measured));
    setTimeout(() => fitView({ padding: 0.15 }), 50);
  }, [getNodes, setNodes, fitView]);

  // ── Distribute evenly ────────────────────────────────────
  const handleDistributeHorizontal = React.useCallback(() => {
    const selected = nodes.filter((n) => n.selected);
    const targets = selected.length >= 2 ? selected : nodes;
    if (targets.length < 2) return;

    const sorted = [...targets].sort((a, b) => a.position.x - b.position.x);
    const minX = sorted[0].position.x;
    const maxX = sorted[sorted.length - 1].position.x;
    const gap = (maxX - minX) / (sorted.length - 1);

    const updates = new Map(sorted.map((n, i) => [n.id, minX + gap * i]));
    setNodes((nds) =>
      nds.map((n) => {
        const newX = updates.get(n.id);
        return newX !== undefined ? { ...n, position: { ...n.position, x: newX } } : n;
      })
    );
    showToast(`Distributed ${targets.length} nodes horizontally`);
  }, [nodes, setNodes, showToast]);

  const handleDistributeVertical = React.useCallback(() => {
    const selected = nodes.filter((n) => n.selected);
    const targets = selected.length >= 2 ? selected : nodes;
    if (targets.length < 2) return;

    const sorted = [...targets].sort((a, b) => a.position.y - b.position.y);
    const minY = sorted[0].position.y;
    const maxY = sorted[sorted.length - 1].position.y;
    const gap = (maxY - minY) / (sorted.length - 1);

    const updates = new Map(sorted.map((n, i) => [n.id, minY + gap * i]));
    setNodes((nds) =>
      nds.map((n) => {
        const newY = updates.get(n.id);
        return newY !== undefined ? { ...n, position: { ...n.position, y: newY } } : n;
      })
    );
    showToast(`Distributed ${targets.length} nodes vertically`);
  }, [nodes, setNodes, showToast]);

  return (
    <div className="relative flex h-full w-full">
      <div
        ref={containerRef}
        className="relative flex-1"
        role="application"
        aria-label="Workflow canvas"
        data-tour="canvas"
        onDragLeave={onDragLeave}
        {...(isTouchDevice ? longPressHandlers : {})}
      >
        {showTemplates && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/80 backdrop-blur-sm">
            <TemplateManager
              category={category}
              currentNodes={nodes}
              currentEdges={edges}
              onSelect={handleLoadTemplate}
              onClose={() => setShowTemplates(false)}
            />
          </div>
        )}

        <div className="absolute left-3 top-3 z-10" data-tour="palette">
          <NodePalette userNodeDefs={userNodeDefs} onAddNode={addNodeAtCenter} customPaletteItems={customPaletteItems} />
        </div>

        <div className="absolute right-3 top-3 z-10 flex flex-wrap items-center gap-1.5 max-w-[calc(100%-200px)] sm:max-w-none" data-tour="toolbar">
          <button
            onClick={undo}
            disabled={!canUndo}
            className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs font-medium text-foreground hover:bg-white/10 transition disabled:opacity-30 disabled:cursor-not-allowed"
            title="Undo (Ctrl+Z)"
            aria-label="Undo"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6.69 3L3 13"/></svg>
          </button>
          <button
            onClick={redo}
            disabled={!canRedo}
            className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs font-medium text-foreground hover:bg-white/10 transition disabled:opacity-30 disabled:cursor-not-allowed"
            title="Redo (Ctrl+Shift+Z)"
            aria-label="Redo"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 7v6h-6"/><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6.69 3L21 13"/></svg>
          </button>
          <button
            onClick={() => { setSnapToGrid((v) => !v); showToast(snapToGrid ? "Snap-to-grid off" : "Snap-to-grid on"); }}
            className={`rounded-lg border px-2 py-1.5 text-xs font-medium transition ${
              snapToGrid
                ? "border-primary/30 bg-primary/10 text-primary"
                : "border-white/10 bg-white/5 text-foreground hover:bg-white/10"
            }`}
            title={snapToGrid ? "Snap-to-grid: ON (click to toggle)" : "Snap-to-grid: OFF (click to toggle)"}
            aria-label={`Snap to grid: ${snapToGrid ? "on" : "off"}`}
            aria-pressed={snapToGrid}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 3v18h18"/><path d="M9 3v18"/><path d="M15 3v18"/><path d="M3 9h18"/><path d="M3 15h18"/></svg>
          </button>
          <button
            onClick={handleAutoLayout}
            className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs font-medium text-foreground hover:bg-white/10 transition"
            title="Auto-space nodes"
            aria-label="Auto-layout nodes"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
          </button>
          <button
            onClick={handleDistributeHorizontal}
            className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs font-medium text-foreground hover:bg-white/10 transition"
            title="Distribute horizontally (selected or all)"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"/><line x1="7" y1="8" x2="7" y2="16"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="17" y1="8" x2="17" y2="16"/></svg>
          </button>
          <button
            onClick={handleDistributeVertical}
            className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs font-medium text-foreground hover:bg-white/10 transition"
            title="Distribute vertically (selected or all)"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="3" x2="12" y2="21"/><line x1="8" y1="7" x2="16" y2="7"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="8" y1="17" x2="16" y2="17"/></svg>
          </button>
          <button
            onClick={() => setShowTemplateSidebar((v) => !v)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
              showTemplateSidebar
                ? "border-primary/30 bg-primary/10 text-primary"
                : "border-white/10 bg-white/5 text-foreground hover:bg-white/10"
            }`}
            aria-label="Toggle template sidebar"
            aria-expanded={showTemplateSidebar}
          >
            Templates
          </button>
          <button
            onClick={() => setShowShortcuts((v) => !v)}
            className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs font-medium text-muted-foreground hover:bg-white/10 hover:text-foreground transition"
            title="Keyboard shortcuts"
            aria-label="Show keyboard shortcuts"
            aria-expanded={showShortcuts}
          >
            ?
          </button>
        </div>

        {/* Drop zone highlight */}
        {isDragOver && (
          <div className="pointer-events-none absolute inset-0 z-20 border-2 border-dashed border-primary/40 bg-primary/5 rounded-lg transition-all" />
        )}

        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={handleNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onDragOver={onDragOver}
          onDrop={onDrop}
          onNodeClick={handleNodeClick}
          onPaneClick={handlePaneClick}
          onNodeContextMenu={handleNodeContextMenu}
          onSelectionContextMenu={handleSelectionContextMenu}
          nodeTypes={mergedNodeTypes}
          snapToGrid={snapToGrid}
          snapGrid={activeSnapGrid}
          selectionOnDrag={!isMobile}
          selectionMode={SelectionMode.Partial}
          panOnDrag={isMobile ? [0] : [1, 2]}
          zoomOnPinch
          zoomOnDoubleClick={false}
          preventScrolling
          fitView
          fitViewOptions={{ minZoom: 0.5, maxZoom: 1.5 }}
          minZoom={0.2}
          className="bg-background"
          defaultEdgeOptions={{
            type: "smoothstep",
            animated: true,
            style: { stroke: "rgba(12, 206, 107, 0.4)", strokeWidth: 2 },
          }}
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={20}
            size={1}
            color="rgba(255,255,255,0.05)"
          />
          <Controls className="!bg-white/5 !border-white/10 !rounded-lg [&>button]:!bg-white/5 [&>button]:!border-white/10 [&>button]:!text-foreground [&>button:hover]:!bg-white/10 !bottom-16 md:!bottom-2" />
          {!isMobile && (
            <MiniMap
              className="!bg-white/5 !border-white/10 !rounded-lg"
              nodeColor="rgba(12, 206, 107, 0.3)"
              maskColor="rgba(0,0,0,0.6)"
            />
          )}
          {/* Alignment guide overlays */}
          {alignmentGuides.length > 0 && (
            <AlignmentGuideOverlay guides={alignmentGuides} />
          )}
          {/* Node output preview badges */}
          {nodeOutputPreviews && nodeOutputPreviews.length > 0 && (
            <NodeOutputBadges previews={nodeOutputPreviews} nodes={nodes} />
          )}
        </ReactFlow>
        {/* Confirm template replace dialog */}
        {pendingTemplate && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/50 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="replace-canvas-title">
            <div className="w-80 rounded-xl border border-white/10 bg-neutral-900 p-5 shadow-2xl space-y-4">
              <h3 id="replace-canvas-title" className="text-sm font-semibold text-foreground">Replace canvas?</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Loading <span className="font-medium text-foreground">{pendingTemplate.name}</span> will replace your current canvas content. This cannot be undone.
              </p>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setPendingTemplate(null)}
                  className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-white/10 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={() => applyTemplate(pendingTemplate)}
                  className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-500 transition"
                >
                  Replace
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Empty state onboarding */}
        {nodes.length === 0 && !pendingTemplate && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <div className="text-center space-y-4 max-w-sm">
              <div className="text-4xl">🔧</div>
              <h3 className="text-lg font-semibold text-foreground/80">Start Building Your Workflow</h3>
              <div className="space-y-2 text-sm text-muted-foreground">
                <div className="flex items-center gap-3 justify-center">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/20 text-primary text-[10px] font-bold shrink-0">1</span>
                  <span><span className="hidden md:inline">Drag</span><span className="md:hidden">Tap +Add, then tap</span> a <span className="font-medium text-foreground/70">Trigger</span> node <span className="hidden md:inline">from the palette ←</span></span>
                </div>
                <div className="flex items-center gap-3 justify-center">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/20 text-primary text-[10px] font-bold shrink-0">2</span>
                  <span>Connect nodes to build your chain</span>
                </div>
                <div className="flex items-center gap-3 justify-center">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/20 text-primary text-[10px] font-bold shrink-0">3</span>
                  <span>Click <span className="font-medium text-foreground/70">Validate & Run</span> to execute</span>
                </div>
              </div>
              <button
                onClick={() => setShowTemplateSidebar(true)}
                className="pointer-events-auto mt-2 rounded-lg border border-primary/30 bg-primary/10 px-4 py-2 text-xs font-medium text-primary hover:bg-primary/20 transition"
              >
                Or browse templates →
              </button>
            </div>
          </div>
        )}
        {/* Toast notification */}
        {toastMessage && (
          <div className="absolute bottom-20 left-1/2 z-30 -translate-x-1/2 animate-in fade-in slide-in-from-bottom-2" role="status" aria-live="polite">
            <div className="rounded-lg border border-white/10 bg-neutral-900/95 px-4 py-2 text-xs text-foreground shadow-lg backdrop-blur-sm">
              {toastMessage}
            </div>
          </div>
        )}

        {/* Keyboard shortcuts modal */}
        {showShortcuts && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setShowShortcuts(false)}>
            <div className="w-72 rounded-xl border border-white/10 bg-neutral-900 p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-foreground">Keyboard Shortcuts</h3>
                <button onClick={() => setShowShortcuts(false)} className="text-muted-foreground hover:text-foreground transition text-xs">Esc</button>
              </div>
              <div className="space-y-1.5 text-xs">
                {[
                  ["Ctrl+Z", "Undo"],
                  ["Ctrl+Shift+Z", "Redo"],
                  ["Delete / Backspace", "Delete selected"],
                  ["Ctrl+A", "Select all"],
                  ["Ctrl+C", "Copy"],
                  ["Ctrl+V", "Paste"],
                  ["Drag select", "Multi-select nodes"],
                  ["Right-click", "Context menu"],
                  ["Scroll", "Zoom in/out"],
                  ["Middle-click drag", "Pan canvas"],
                  ["Grid button", "Toggle snap-to-grid"],
                  ["⇔ button", "Distribute horizontally"],
                  ["⇕ button", "Distribute vertically"],
                ].map(([key, desc]) => (
                  <div key={key} className="flex items-center justify-between py-0.5">
                    <span className="text-muted-foreground">{desc}</span>
                    <kbd className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] font-mono text-foreground/70">{key}</kbd>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        <GroupOverlays
          nodes={nodes}
          lockedGroups={lockedGroups}
          onUnlock={handleUnlockGroup}
          onDeleteGroup={handleDeleteGroup}
          onSelectGroup={handleSelectGroup}
          containerRef={containerRef}
        />
      </div>

      {/* Context Menu */}
      {contextMenu?.type === "node" && (
        <NodeContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          isLocked={contextMenuIsLocked}
          onEdit={() => {
            setSelectedNodeId(contextMenu.nodeId);
            setContextMenu(null);
          }}
          onDuplicate={() => {
            handleDuplicateNode(contextMenu.nodeId);
            setContextMenu(null);
          }}
          onDelete={() => {
            handleNodeDelete(contextMenu.nodeId);
            setContextMenu(null);
          }}
          onUnlockGroup={
            contextMenuIsLocked
              ? () => {
                  handleUnlockGroup([contextMenu.nodeId]);
                  setContextMenu(null);
                }
              : undefined
          }
          onClose={() => setContextMenu(null)}
        />
      )}

      {contextMenu?.type === "selection" && (
        <NodeContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          selectionCount={contextMenu.nodeIds.length}
          isLocked={contextMenuIsLocked}
          onLockGroup={
            !contextMenuIsLocked
              ? () => {
                  handleLockGroup(contextMenu.nodeIds);
                  setContextMenu(null);
                }
              : undefined
          }
          onUnlockGroup={
            contextMenuIsLocked
              ? () => {
                  handleUnlockGroup(contextMenu.nodeIds);
                  setContextMenu(null);
                }
              : undefined
          }
          onDelete={() => {
            handleDeleteSelection(contextMenu.nodeIds);
            setContextMenu(null);
          }}
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* Template Sidebar */}
      {showTemplateSidebar && (
        <TemplateSidebar
          onSelect={handleLoadTemplate}
          onMerge={mergeNodesIntoCanvas}
          canvasNodes={nodes}
          canvasEdges={edges}
          lockedGroups={lockedGroups}
          onSelectGroup={handleSelectGroup}
          onUnlockGroup={handleUnlockGroup}
          onClose={() => setShowTemplateSidebar(false)}
          onStartBridgeTour={() => {
            setShowTemplateSidebar(false);
            pendingBridgeTourRef.current = true;
          }}
        />
      )}

      {/* Bridge Walkthrough Tour */}
      {showBridgeTour && (
        <BridgeWalkthroughTour
          onComplete={completeBridgeTour}
          onSkip={skipBridgeTour}
        />
      )}

      {/* Node Inspector Panel */}
      {selectedNode && (
        <>
          {/* Mobile backdrop */}
          <div
            className="fixed inset-0 top-12 z-30 bg-black/40 md:hidden"
            onClick={() => setSelectedNodeId(null)}
          />
          <NodeInspector
            node={selectedNode}
            nodes={nodes}
            onUpdate={handleNodeUpdate}
            onDelete={handleNodeDelete}
            onClose={() => setSelectedNodeId(null)}
            customNodeTypeInfo={customNodeTypeInfo}
            customNodeEditors={customNodeEditors}
          />
        </>
      )}

      {/* Mobile palette (bottom sheet triggered by toolbar Add button) */}
      {showMobilePalette && (
        <>
          <div
            className="fixed inset-0 top-12 z-30 bg-black/40 md:hidden"
            onClick={() => setShowMobilePalette(false)}
          />
          <div className="fixed inset-x-0 bottom-0 z-40 max-h-[50vh] overflow-y-auto rounded-t-2xl border-t border-white/10 bg-background/95 backdrop-blur-sm pb-[max(0.5rem,env(safe-area-inset-bottom))] md:hidden">
            <NodePalette onAddNode={(type, data) => { addNodeAtCenter(type, data); setShowMobilePalette(false); }} />
          </div>
        </>
      )}

      {/* Mobile bottom toolbar */}
      <MobileToolbar
        onOpenPalette={() => setShowMobilePalette((v) => !v)}
        onUndo={undo}
        onRedo={redo}
        onDelete={handleDeleteCurrentSelection}
        canUndo={canUndo}
        canRedo={canRedo}
        hasSelection={!!selectedNodeId || selectedNodeIds.length > 0}
      />
    </div>
  );
}

/**
 * Renders alignment guide lines (red dashed lines) when dragging nodes.
 */
function AlignmentGuideOverlay({ guides }: { guides: AlignmentGuide[] }) {
  const { flowToScreenPosition } = useReactFlow();
  // useViewport() subscribes to viewport changes so this component
  // re-renders on pan/zoom, keeping guide positions accurate
  useViewport();

  // De-duplicate guides by position (within 2px) to avoid stacking
  const deduped: AlignmentGuide[] = [];
  for (const g of guides) {
    const exists = deduped.some(
      (d) => d.type === g.type && Math.abs(d.position - g.position) < 2
    );
    if (!exists) deduped.push(g);
  }

  return (
    <svg
      className="pointer-events-none absolute inset-0 z-[5]"
      style={{ width: "100%", height: "100%", overflow: "visible" }}
    >
      {deduped.map((guide, i) => {
        if (guide.type === "vertical") {
          const top = flowToScreenPosition({ x: guide.position, y: guide.start });
          const bottom = flowToScreenPosition({ x: guide.position, y: guide.end });
          return (
            <line
              key={`v-${i}`}
              x1={top.x}
              y1={top.y}
              x2={bottom.x}
              y2={bottom.y}
              stroke="rgba(239, 68, 68, 0.6)"
              strokeWidth="1"
              strokeDasharray="4 3"
            />
          );
        }
        const left = flowToScreenPosition({ x: guide.start, y: guide.position });
        const right = flowToScreenPosition({ x: guide.end, y: guide.position });
        return (
          <line
            key={`h-${i}`}
            x1={left.x}
            y1={left.y}
            x2={right.x}
            y2={right.y}
            stroke="rgba(239, 68, 68, 0.6)"
            strokeWidth="1"
            strokeDasharray="4 3"
          />
        );
      })}
    </svg>
  );
}

/**
 * Renders small output preview badges on nodes after execution.
 */
function NodeOutputBadges({
  previews,
  nodes,
}: {
  previews: NodeOutputPreview[];
  nodes: Node[];
}) {
  const { flowToScreenPosition } = useReactFlow();
  const viewport = useViewport();
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  const statusColors: Record<string, { bg: string; text: string; icon: string }> = {
    success: { bg: "bg-emerald-500/20", text: "text-emerald-400", icon: "●" },
    error: { bg: "bg-red-500/20", text: "text-red-400", icon: "⚠" },
    running: { bg: "bg-blue-500/20", text: "text-blue-400", icon: "◉" },
    skipped: { bg: "bg-white/10", text: "text-muted-foreground", icon: "–" },
  };

  // Only show if zoom is reasonable
  if (viewport.zoom < 0.3) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-[6]" style={{ overflow: "visible" }}>
      {previews.map((p) => {
        const node = nodeMap.get(p.nodeId);
        if (!node) return null;
        const pos = flowToScreenPosition({
          x: node.position.x + 200,
          y: node.position.y - 5,
        });
        const style = statusColors[p.status] || statusColors.success;
        return (
          <div
            key={p.nodeId}
            className={`absolute pointer-events-auto rounded-md ${style.bg} border border-white/10 px-1.5 py-0.5 max-w-[150px] truncate shadow-sm backdrop-blur-sm`}
            style={{ left: pos.x, top: pos.y, transform: "translate(-50%, -100%)", fontSize: `${Math.max(9, 10 * viewport.zoom)}px` }}
            title={p.preview}
          >
            <span className={style.text}>
              {style.icon} {p.preview.slice(0, 40)}{p.preview.length > 40 ? "..." : ""}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Renders colored bounding boxes behind each locked group with an unlock button.
 * Clicking the bounding box background selects only that group.
 * Each group gets a unique color from a rotating palette.
 */
function GroupOverlays({
  nodes,
  lockedGroups,
  onUnlock,
  onDeleteGroup,
  onSelectGroup,
  containerRef,
}: {
  nodes: Node[];
  lockedGroups: Map<string, Set<string>>;
  onUnlock: (nodeIds: string[]) => void;
  onDeleteGroup: (groupId: string) => void;
  onSelectGroup: (groupId: string) => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
}) {
  const { flowToScreenPosition, getNodes } = useReactFlow();
  // useViewport() subscribes to viewport changes so overlays
  // re-render on pan/zoom, keeping positions accurate
  useViewport();

  if (lockedGroups.size === 0) return null;

  const containerRect = containerRef.current?.getBoundingClientRect();
  if (!containerRect) return null;

  const measured = getNodes();
  const overlays: React.ReactNode[] = [];
  const PAD = 16; // padding around the group bounding box

  for (const [groupId, memberIds] of lockedGroups) {
    const members = nodes.filter((n) => memberIds.has(n.id));
    if (members.length === 0) continue;

    const color = GROUP_COLORS[groupColorIndex(groupId)];

    // Compute bounding box in flow coordinates
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of members) {
      const mNode = measured.find((m) => m.id === n.id);
      const w = (mNode as { measured?: { width?: number } })?.measured?.width ?? 200;
      const h = (mNode as { measured?: { height?: number } })?.measured?.height ?? 130;
      minX = Math.min(minX, n.position.x);
      minY = Math.min(minY, n.position.y);
      maxX = Math.max(maxX, n.position.x + w);
      maxY = Math.max(maxY, n.position.y + h);
    }

    // Convert corners to screen coordinates relative to container
    const topLeft = flowToScreenPosition({ x: minX - PAD, y: minY - PAD });
    const bottomRight = flowToScreenPosition({ x: maxX + PAD, y: maxY + PAD });

    const left = topLeft.x - containerRect.left;
    const top = topLeft.y - containerRect.top;
    const width = bottomRight.x - topLeft.x;
    const height = bottomRight.y - topLeft.y;

    // Don't render if too small (fully zoomed out)
    if (width < 20 || height < 20) continue;

    // Derive a label from the first node's type or label
    const firstNode = members[0];
    const label = (firstNode.data?.label as string) || firstNode.type || "Group";
    const groupLabel = members.length > 1 ? `${label} +${members.length - 1}` : label;

    overlays.push(
      <div
        key={groupId}
        className="absolute pointer-events-none transition-colors"
        style={{
          left,
          top,
          width,
          height,
          backgroundColor: color.bg,
          border: `1.5px dashed ${color.border}`,
          borderRadius: 12,
          zIndex: 1,
        }}
      >
        {/* Group label badge — top-left, clickable to select group */}
        <div
          className="absolute flex items-center gap-1.5 rounded-br-lg rounded-tl-[11px] px-2 py-1 text-[10px] font-semibold backdrop-blur-sm pointer-events-auto cursor-pointer"
          onClick={(e) => {
            e.stopPropagation();
            onSelectGroup(groupId);
          }}
          title={`Select group: ${groupLabel}`}
          style={{
            backgroundColor: color.bg,
            borderBottom: `1px solid ${color.border}`,
            borderRight: `1px solid ${color.border}`,
            color: color.text,
          }}
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          {groupLabel}
        </div>

        {/* Delete button — top-left (after label), opposite of Unlock */}
        <button
          className="absolute left-2 bottom-2 flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-semibold backdrop-blur-sm transition hover:brightness-125 hover:scale-105 pointer-events-auto shadow-sm"
          style={{
            backgroundColor: "rgba(239, 68, 68, 0.8)",
            color: "#fff",
          }}
          onClick={(e) => {
            e.stopPropagation();
            onDeleteGroup(groupId);
          }}
          title="Delete this group and all its nodes"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
          Delete
        </button>

        {/* Unlock button — top-right, sized for easy click target */}
        <button
          className="absolute right-2 top-2 flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-semibold backdrop-blur-sm transition hover:brightness-125 hover:scale-105 pointer-events-auto shadow-sm"
          style={{
            backgroundColor: color.border,
            color: "#fff",
          }}
          onClick={(e) => {
            e.stopPropagation();
            onUnlock([...memberIds]);
          }}
          title="Unlock this group (or right-click)"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 9.9-1" />
          </svg>
          Unlock
        </button>
      </div>
    );
  }

  return <>{overlays}</>;
}

/** Export group color helpers for use in sidebar */
export { GROUP_COLORS, groupColorIndex };
