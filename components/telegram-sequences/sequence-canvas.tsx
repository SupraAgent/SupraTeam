"use client";

import * as React from "react";
import {
  ReactFlow,
  MiniMap,
  Background,
  BackgroundVariant,
  Controls,
  addEdge,
  useNodesState,
  useEdgesState,
  type Connection,
  type Edge,
  type Node,
  type NodeTypes,
  type OnConnect,
  ReactFlowProvider,
} from "@xyflow/react";
import {
  MessageSquare,
  GitBranch,
  Clock,
  Play,
  Save,
  ArrowLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TGTriggerNode } from "./nodes/trigger-node";
import { TGMessageNode } from "./nodes/message-node";
import { TGConditionNode } from "./nodes/condition-node";
import { TGWaitNode } from "./nodes/wait-node";
import { NodeConfigPanel } from "./node-config-panel";
import type {
  TGNodeData,
  TGTriggerNodeData,
  TGMessageNodeData,
  TGConditionNodeData,
  TGWaitNodeData,
  TGSequence,
  TriggerType,
} from "./types";
import { TRIGGER_TYPE_LABELS } from "./types";

const nodeTypes: NodeTypes = {
  trigger: TGTriggerNode,
  message: TGMessageNode,
  condition: TGConditionNode,
  wait: TGWaitNode,
};

interface SequenceCanvasProps {
  sequence?: TGSequence | null;
  onSave: (data: {
    name: string;
    description: string;
    trigger_type: TriggerType;
    trigger_config: Record<string, unknown>;
    nodes: Node[];
    edges: Edge[];
  }) => void;
  onBack: () => void;
  saving?: boolean;
  pipelineStages?: Array<{ id: string; name: string }>;
}

let nodeIdCounter = 0;
function getNodeId() {
  return `tgseq_${++nodeIdCounter}_${Date.now()}`;
}

function buildInitialNodes(sequence?: TGSequence | null): Node[] {
  if (!sequence || sequence.steps.length === 0) {
    const triggerId = getNodeId();
    return [
      {
        id: triggerId,
        type: "trigger",
        position: { x: 250, y: 50 },
        data: {
          nodeType: "trigger",
          trigger_type: "manual",
          trigger_config: {},
          label: "Trigger",
        } satisfies TGTriggerNodeData as unknown as Record<string, unknown>,
      },
    ];
  }

  const nodes: Node[] = [
    {
      id: "trigger_root",
      type: "trigger",
      position: { x: 250, y: 50 },
      data: {
        nodeType: "trigger",
        trigger_type: sequence.trigger_type,
        trigger_config: sequence.trigger_config,
        label: TRIGGER_TYPE_LABELS[sequence.trigger_type],
      } satisfies TGTriggerNodeData as unknown as Record<string, unknown>,
    },
  ];

  for (const step of sequence.steps) {
    if (step.type === "message") {
      nodes.push({
        id: step.id,
        type: "message",
        position: step.position,
        data: {
          nodeType: "message",
          template: step.template,
          variant_b_template: step.variant_b_template,
          variant_c_template: step.variant_c_template,
          ab_split_pct: step.ab_split_pct,
          delay_hours: step.delay_hours,
          variant_b_delay_hours: step.variant_b_delay_hours,
          label: "Message",
        } satisfies TGMessageNodeData as unknown as Record<string, unknown>,
      });
    } else if (step.type === "condition") {
      nodes.push({
        id: step.id,
        type: "condition",
        position: step.position,
        data: {
          nodeType: "condition",
          condition_type: step.condition_type,
          threshold: step.threshold,
          keyword: step.keyword,
          stage_id: step.stage_id,
          timeout_hours: step.timeout_hours,
          days: step.days,
          split_percentage: step.split_percentage,
          label: "Condition",
        } satisfies TGConditionNodeData as unknown as Record<string, unknown>,
      });
    } else if (step.type === "wait") {
      nodes.push({
        id: step.id,
        type: "wait",
        position: step.position,
        data: {
          nodeType: "wait",
          wait_hours: step.wait_hours,
          label: "Wait",
        } satisfies TGWaitNodeData as unknown as Record<string, unknown>,
      });
    }
  }

  return nodes;
}

function buildInitialEdges(sequence?: TGSequence | null): Edge[] {
  if (!sequence || sequence.steps.length === 0) return [];

  const edges: Edge[] = [];
  const stepIds = sequence.steps.map((s) => s.id);

  // Connect trigger to first step
  if (stepIds.length > 0) {
    edges.push({
      id: `edge_trigger_${stepIds[0]}`,
      source: "trigger_root",
      target: stepIds[0],
      type: "smoothstep",
      animated: true,
      label: "next",
      style: { stroke: "hsl(var(--primary))", strokeWidth: 2 },
    });
  }

  // Build edges from step connections
  for (let i = 0; i < sequence.steps.length; i++) {
    const step = sequence.steps[i];
    if (step.type === "condition") {
      if (step.on_true_step) {
        edges.push({
          id: `edge_${step.id}_true_${step.on_true_step}`,
          source: step.id,
          sourceHandle: "true",
          target: step.on_true_step,
          type: "smoothstep",
          animated: true,
          label: "true",
          style: { stroke: "rgba(52, 211, 153, 0.6)", strokeWidth: 2 },
        });
      }
      if (step.on_false_step) {
        edges.push({
          id: `edge_${step.id}_false_${step.on_false_step}`,
          source: step.id,
          sourceHandle: "false",
          target: step.on_false_step,
          type: "smoothstep",
          animated: true,
          label: "false",
          style: { stroke: "rgba(248, 113, 113, 0.6)", strokeWidth: 2 },
        });
      }
    } else if (i < sequence.steps.length - 1) {
      edges.push({
        id: `edge_${step.id}_${sequence.steps[i + 1].id}`,
        source: step.id,
        target: sequence.steps[i + 1].id,
        type: "smoothstep",
        animated: true,
        label: "next",
        style: { stroke: "hsl(var(--primary))", strokeWidth: 2 },
      });
    }
  }

  return edges;
}

const SIDEBAR_ITEMS = [
  {
    nodeType: "message" as const,
    label: "Message",
    description: "Send a TG message",
    icon: MessageSquare,
    accent: "bg-blue-500/20 text-blue-400",
  },
  {
    nodeType: "condition" as const,
    label: "Condition",
    description: "If / Else branch",
    icon: GitBranch,
    accent: "bg-yellow-500/20 text-yellow-400",
  },
  {
    nodeType: "wait" as const,
    label: "Wait",
    description: "Delay before next step",
    icon: Clock,
    accent: "bg-white/10 text-gray-400",
  },
];

function SequenceCanvasInner({
  sequence,
  onSave,
  onBack,
  saving,
  pipelineStages = [],
}: SequenceCanvasProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState(buildInitialNodes(sequence));
  const [edges, setEdges, onEdgesChange] = useEdgesState(buildInitialEdges(sequence));
  const [selectedNode, setSelectedNode] = React.useState<Node | null>(null);
  const [name, setName] = React.useState(sequence?.name ?? "");
  const [description, setDescription] = React.useState(sequence?.description ?? "");
  const reactFlowWrapper = React.useRef<HTMLDivElement>(null);
  const [rfInstance, setRfInstance] = React.useState<unknown>(null);

  const onConnect: OnConnect = React.useCallback(
    (connection: Connection) => {
      const sourceNode = nodes.find((n) => n.id === connection.source);
      const targetNode = nodes.find((n) => n.id === connection.target);
      if (!sourceNode || !targetNode) return;
      if (targetNode.type === "trigger") return;

      const isConditionBranch = sourceNode.type === "condition" && connection.sourceHandle;
      const edgeStyle = isConditionBranch
        ? connection.sourceHandle === "true"
          ? { stroke: "rgba(52, 211, 153, 0.6)", strokeWidth: 2 }
          : { stroke: "rgba(248, 113, 113, 0.6)", strokeWidth: 2 }
        : { stroke: "hsl(var(--primary))", strokeWidth: 2 };

      const edge: Edge = {
        ...connection,
        id: `edge_${connection.source}_${connection.sourceHandle ?? "out"}_${connection.target}_${Date.now()}`,
        type: "smoothstep",
        animated: true,
        label: isConditionBranch ? connection.sourceHandle : "next",
        style: edgeStyle,
      };
      setEdges((eds) => addEdge(edge, eds));
    },
    [nodes, setEdges]
  );

  const onDragOver = React.useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = React.useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const rawData = event.dataTransfer.getData("application/tg-sequence-node");
      if (!rawData) return;

      const { nodeType } = JSON.parse(rawData) as { nodeType: string };
      const bounds = reactFlowWrapper.current?.getBoundingClientRect();
      if (!bounds || !rfInstance) return;

      const position = (rfInstance as { screenToFlowPosition: (pos: { x: number; y: number }) => { x: number; y: number } }).screenToFlowPosition({
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
      });

      let data: TGNodeData;
      if (nodeType === "message") {
        data = {
          nodeType: "message",
          template: "",
          variant_b_template: null,
          variant_c_template: null,
          ab_split_pct: 50,
          delay_hours: 0,
          variant_b_delay_hours: null,
          label: "Message",
        };
      } else if (nodeType === "condition") {
        data = {
          nodeType: "condition",
          condition_type: "reply_received",
          threshold: null,
          keyword: null,
          stage_id: null,
          timeout_hours: null,
          days: null,
          split_percentage: null,
          label: "Condition",
        };
      } else {
        data = {
          nodeType: "wait",
          wait_hours: 24,
          label: "Wait",
        };
      }

      const newNode: Node = {
        id: getNodeId(),
        type: nodeType,
        position,
        data: data as unknown as Record<string, unknown>,
      };

      setNodes((nds) => [...nds, newNode]);
    },
    [rfInstance, setNodes]
  );

  const onNodeClick = React.useCallback((_event: React.MouseEvent, node: Node) => {
    setSelectedNode(node);
  }, []);

  const onPaneClick = React.useCallback(() => {
    setSelectedNode(null);
  }, []);

  const onNodeDataChange = React.useCallback(
    (nodeId: string, newData: TGNodeData) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === nodeId ? { ...n, data: newData as unknown as Record<string, unknown> } : n
        )
      );
      setSelectedNode((prev) =>
        prev?.id === nodeId ? { ...prev, data: newData as unknown as Record<string, unknown> } : prev
      );
    },
    [setNodes]
  );

  const onDeleteNode = React.useCallback(
    (nodeId: string) => {
      setNodes((nds) => nds.filter((n) => n.id !== nodeId));
      setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
      setSelectedNode(null);
    },
    [setNodes, setEdges]
  );

  function handleSave() {
    const triggerNode = nodes.find((n) => n.type === "trigger");
    const triggerData = triggerNode?.data as unknown as TGTriggerNodeData | undefined;

    onSave({
      name,
      description,
      trigger_type: triggerData?.trigger_type ?? "manual",
      trigger_config: triggerData?.trigger_config ?? {},
      nodes,
      edges,
    });
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
        <button onClick={onBack} className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Sequence name..."
          className="text-sm font-medium max-w-xs h-8"
        />
        <Input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description (optional)"
          className="text-xs max-w-xs h-8"
        />
        <div className="ml-auto">
          <Button size="sm" onClick={handleSave} disabled={saving || !name.trim()}>
            <Save className="h-3.5 w-3.5 mr-1.5" />
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Sidebar */}
        <div className="w-48 shrink-0 border-r border-white/10 bg-white/[0.02] p-3 space-y-4 overflow-y-auto">
          <p className="text-xs font-semibold text-foreground px-1">Nodes</p>
          <p className="text-[10px] text-muted-foreground/60 px-1">Drag onto canvas</p>

          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 px-1">
              Triggers
            </p>
            <div
              className="flex items-center gap-2.5 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2 cursor-not-allowed opacity-50"
            >
              <div className="h-6 w-6 rounded flex items-center justify-center shrink-0 bg-emerald-500/20 text-emerald-400">
                <Play className="h-3 w-3" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-medium text-foreground truncate">Trigger</p>
                <p className="text-[9px] text-muted-foreground/60">Already on canvas</p>
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 px-1">
              Steps
            </p>
            {SIDEBAR_ITEMS.map((item) => (
              <div
                key={item.nodeType}
                className="flex items-center gap-2.5 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2 cursor-grab hover:bg-white/[0.05] hover:border-white/10 transition-colors active:cursor-grabbing"
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData(
                    "application/tg-sequence-node",
                    JSON.stringify({ nodeType: item.nodeType })
                  );
                  e.dataTransfer.effectAllowed = "move";
                }}
              >
                <div className={`h-6 w-6 rounded flex items-center justify-center shrink-0 ${item.accent}`}>
                  <item.icon className="h-3 w-3" />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-medium text-foreground truncate">{item.label}</p>
                  <p className="text-[9px] text-muted-foreground/60 truncate">{item.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Canvas */}
        <div ref={reactFlowWrapper} className="flex-1 h-full">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onInit={(instance) => setRfInstance(instance)}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            nodeTypes={nodeTypes}
            colorMode="dark"
            fitView
            snapToGrid
            snapGrid={[16, 16]}
            defaultEdgeOptions={{
              type: "smoothstep",
              animated: true,
              style: { stroke: "hsl(var(--primary))", strokeWidth: 2 },
            }}
            proOptions={{ hideAttribution: true }}
          >
            <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="rgba(255,255,255,0.05)" />
            <Controls
              className="!bg-white/[0.05] !border-white/10 !rounded-xl [&>button]:!bg-white/[0.05] [&>button]:!border-white/10 [&>button]:!text-white/60 [&>button:hover]:!bg-white/10"
            />
            <MiniMap
              className="!bg-white/[0.03] !border-white/10 !rounded-xl"
              nodeColor={(node) => {
                switch (node.type) {
                  case "trigger": return "rgba(52, 211, 153, 0.5)";
                  case "message": return "rgba(59, 130, 246, 0.5)";
                  case "condition": return "rgba(234, 179, 8, 0.5)";
                  case "wait": return "rgba(156, 163, 175, 0.5)";
                  default: return "rgba(255,255,255,0.1)";
                }
              }}
            />
          </ReactFlow>
        </div>

        {/* Config panel */}
        {selectedNode && selectedNode.type !== "trigger" && (
          <NodeConfigPanel
            node={selectedNode}
            onDataChange={onNodeDataChange}
            onDelete={onDeleteNode}
            onClose={() => setSelectedNode(null)}
            pipelineStages={pipelineStages}
          />
        )}
        {selectedNode && selectedNode.type === "trigger" && (
          <NodeConfigPanel
            node={selectedNode}
            onDataChange={onNodeDataChange}
            onDelete={() => {/* prevent trigger deletion */}}
            onClose={() => setSelectedNode(null)}
            pipelineStages={pipelineStages}
          />
        )}
      </div>
    </div>
  );
}

export function SequenceCanvas(props: SequenceCanvasProps) {
  return (
    <ReactFlowProvider>
      <SequenceCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
