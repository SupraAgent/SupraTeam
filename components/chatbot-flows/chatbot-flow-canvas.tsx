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
import "@xyflow/react/dist/style.css";
import { ArrowLeft } from "lucide-react";

import { ChatbotMessageNode } from "./nodes/message-node";
import { ChatbotQuestionNode } from "./nodes/question-node";
import { ChatbotConditionNode } from "./nodes/condition-node";
import { ChatbotActionNode } from "./nodes/action-node";
import { ChatbotAINode } from "./nodes/ai-node";
import { ChatbotEscalationNode } from "./nodes/escalation-node";
import { ChatbotDelayNode } from "./nodes/delay-node";
import { FlowConfigPanel } from "./flow-config-panel";
import type { ChatbotNodeData, ChatbotNodeType, ChatbotFlow, ChatbotTriggerType } from "./types";

// ── Node type registry ─────────────────────────────────────────────

const chatbotNodeTypes: NodeTypes = {
  cb_message: ChatbotMessageNode,
  cb_question: ChatbotQuestionNode,
  cb_condition: ChatbotConditionNode,
  cb_action: ChatbotActionNode,
  cb_ai: ChatbotAINode,
  cb_escalation: ChatbotEscalationNode,
  cb_delay: ChatbotDelayNode,
};

// ── Palette items ──────────────────────────────────────────────────

interface PaletteItem {
  type: ChatbotNodeType;
  label: string;
  description: string;
  accentClass: string;
  defaultData: ChatbotNodeData;
}

const PALETTE_ITEMS: PaletteItem[] = [
  {
    type: "cb_message",
    label: "Message",
    description: "Bot sends a message",
    accentClass: "bg-cyan-500/20 text-cyan-400",
    defaultData: { nodeType: "cb_message", label: "Message", config: { messageText: "", parseMode: "plain" } },
  },
  {
    type: "cb_question",
    label: "Question",
    description: "Ask and capture response",
    accentClass: "bg-green-500/20 text-green-400",
    defaultData: { nodeType: "cb_question", label: "Question", config: { questionText: "", responseType: "text", variableName: "" } },
  },
  {
    type: "cb_condition",
    label: "Condition",
    description: "Branch on response",
    accentClass: "bg-yellow-500/20 text-yellow-400",
    defaultData: { nodeType: "cb_condition", label: "Condition", config: { conditionType: "response_contains", field: "", operator: "contains", value: "" } },
  },
  {
    type: "cb_action",
    label: "Action",
    description: "CRM action (deal, contact)",
    accentClass: "bg-blue-500/20 text-blue-400",
    defaultData: { nodeType: "cb_action", label: "Action", config: { actionType: "create_contact" } },
  },
  {
    type: "cb_ai",
    label: "AI Response",
    description: "Claude generates response",
    accentClass: "bg-violet-500/20 text-violet-400",
    defaultData: { nodeType: "cb_ai", label: "AI Response", config: { promptTemplate: "", model: "sonnet", variableName: "ai_response" } },
  },
  {
    type: "cb_escalation",
    label: "Escalation",
    description: "Hand off to human",
    accentClass: "bg-red-500/20 text-red-400",
    defaultData: { nodeType: "cb_escalation", label: "Escalation", config: { reason: "", notifyRoles: ["bd_lead"], handoffMessage: "" } },
  },
  {
    type: "cb_delay",
    label: "Delay",
    description: "Wait before next step",
    accentClass: "bg-gray-500/20 text-gray-400",
    defaultData: { nodeType: "cb_delay", label: "Delay", config: { duration: 5, unit: "minutes" } },
  },
];

// ── Node ID generator ──────────────────────────────────────────────

let nodeIdCounter = 0;
function getNodeId(): string {
  return `cbnode_${++nodeIdCounter}_${Date.now()}`;
}

// ── Test mode types ────────────────────────────────────────────────

interface TestMessage {
  role: "bot" | "user";
  text: string;
  nodeId?: string;
}

// ── Props ──────────────────────────────────────────────────────────

export interface ChatbotFlowCanvasProps {
  flow: ChatbotFlow | null;
  onSave: (data: {
    name: string;
    description: string;
    triggerType: ChatbotTriggerType;
    triggerKeywords: string[];
    nodes: Node[];
    edges: Edge[];
  }) => void;
  onBack: () => void;
  saving?: boolean;
}

// ── Inner canvas (needs ReactFlowProvider) ─────────────────────────

function ChatbotFlowCanvasInner({
  flow,
  onSave,
  onBack,
  saving,
}: ChatbotFlowCanvasProps) {
  const initialNodes = React.useMemo(() => (flow?.nodes ?? []) as unknown as Node[], [flow]);
  const initialEdges = React.useMemo(() => (flow?.edges ?? []) as Edge[], [flow]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [selectedNode, setSelectedNode] = React.useState<Node | null>(null);
  const [testMode, setTestMode] = React.useState(false);
  const [testMessages, setTestMessages] = React.useState<TestMessage[]>([]);
  const [testInput, setTestInput] = React.useState("");
  const [testCurrentNode, setTestCurrentNode] = React.useState<string | null>(null);
  const [testCollectedData, setTestCollectedData] = React.useState<Record<string, string>>({});
  const reactFlowWrapper = React.useRef<HTMLDivElement>(null);
  const [rfInstance, setRfInstance] = React.useState<ReturnType<typeof import("@xyflow/react").useReactFlow> | null>(null);

  // Flow metadata
  const [flowName, setFlowName] = React.useState(flow?.name ?? "");
  const [flowDescription, setFlowDescription] = React.useState(flow?.description ?? "");
  const [triggerType, setTriggerType] = React.useState<ChatbotTriggerType>(flow?.triggerType ?? "dm_start");
  const [triggerKeywords, setTriggerKeywords] = React.useState(flow?.triggerKeywords?.join(", ") ?? "");

  // Auto-save debounce
  const saveTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const nodesRef = React.useRef(nodes);
  const edgesRef = React.useRef(edges);
  nodesRef.current = nodes;
  edgesRef.current = edges;

  const triggerSave = React.useCallback(() => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      if (!flowName.trim()) return;
      onSave({
        name: flowName,
        description: flowDescription,
        triggerType,
        triggerKeywords: triggerKeywords.split(",").map((k) => k.trim()).filter(Boolean),
        nodes: nodesRef.current,
        edges: edgesRef.current,
      });
    }, 2000);
  }, [onSave, flowName, flowDescription, triggerType, triggerKeywords]);

  React.useEffect(() => {
    if (nodes === initialNodes && edges === initialEdges) return;
    triggerSave();
  }, [nodes, edges, triggerSave, initialNodes, initialEdges]);

  // ── Connection handling ────────────────────────────────────────

  const onConnect: OnConnect = React.useCallback(
    (connection: Connection) => {
      const edge: Edge = {
        ...connection,
        id: `cbedge_${connection.source}_${connection.target}_${Date.now()}`,
        type: "smoothstep",
        animated: true,
        style: { stroke: "hsl(var(--primary))", strokeWidth: 2 },
      };
      setEdges((eds) => addEdge(edge, eds));
    },
    [setEdges]
  );

  // ── Drag and drop ─────────────────────────────────────────────

  const onDragOver = React.useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = React.useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const rawData = event.dataTransfer.getData("application/chatbot-flow");
      if (!rawData) return;

      const { nodeType, defaultData } = JSON.parse(rawData) as {
        nodeType: ChatbotNodeType;
        defaultData: ChatbotNodeData;
      };

      const bounds = reactFlowWrapper.current?.getBoundingClientRect();
      if (!bounds || !rfInstance) return;

      const position = (rfInstance as unknown as { screenToFlowPosition: (pos: { x: number; y: number }) => { x: number; y: number } }).screenToFlowPosition({
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
      });

      const newNode: Node = {
        id: getNodeId(),
        type: nodeType,
        position,
        data: defaultData as unknown as Record<string, unknown>,
      };

      setNodes((nds) => [...nds, newNode]);
    },
    [rfInstance, setNodes]
  );

  // ── Node selection ─────────────────────────────────────────────

  const onNodeClick = React.useCallback((_event: React.MouseEvent, node: Node) => {
    setSelectedNode(node);
  }, []);

  const onPaneClick = React.useCallback(() => {
    setSelectedNode(null);
  }, []);

  const onNodeDataChange = React.useCallback(
    (nodeId: string, newData: ChatbotNodeData) => {
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

  // ── Test mode simulation ───────────────────────────────────────

  const advanceTestTo = React.useCallback((nodeId: string) => {
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return;

    setTestCurrentNode(nodeId);
    const nodeData = node.data as unknown as ChatbotNodeData;

    switch (nodeData.nodeType) {
      case "cb_message":
        setTestMessages((prev) => [...prev, { role: "bot", text: nodeData.config.messageText || "(empty message)", nodeId }]);
        {
          const nextEdge = edges.find((e) => e.source === nodeId);
          if (nextEdge) setTimeout(() => advanceTestTo(nextEdge.target), 500);
        }
        break;
      case "cb_question":
        setTestMessages((prev) => [...prev, { role: "bot", text: nodeData.config.questionText || "(empty question)", nodeId }]);
        break;
      case "cb_condition":
        {
          const cfg = nodeData.config;
          const fieldValue = testCollectedData[cfg.field] || "";
          let result = false;
          switch (cfg.conditionType) {
            case "response_contains":
              result = fieldValue.toLowerCase().includes(cfg.value.toLowerCase());
              break;
            case "response_matches_regex":
              try { result = new RegExp(cfg.value, "i").test(fieldValue); } catch { result = false; }
              break;
            case "collected_field_equals":
              result = fieldValue === cfg.value;
              break;
            default:
              result = false;
          }
          setTestMessages((prev) => [...prev, {
            role: "bot",
            text: `[Condition: ${cfg.field} ${cfg.conditionType} "${cfg.value}" = ${result}]`,
            nodeId,
          }]);
          const branch = result ? "true" : "false";
          const nextEdge = edges.find((e) => e.source === nodeId && e.sourceHandle === branch);
          if (nextEdge) setTimeout(() => advanceTestTo(nextEdge.target), 300);
        }
        break;
      case "cb_action":
        setTestMessages((prev) => [...prev, { role: "bot", text: `[Action: ${nodeData.config.actionType}]`, nodeId }]);
        {
          const nextEdge = edges.find((e) => e.source === nodeId);
          if (nextEdge) setTimeout(() => advanceTestTo(nextEdge.target), 300);
        }
        break;
      case "cb_ai":
        setTestMessages((prev) => [...prev, { role: "bot", text: `[AI: ${nodeData.config.promptTemplate || "generating..."}]`, nodeId }]);
        {
          const nextEdge = edges.find((e) => e.source === nodeId);
          if (nextEdge) setTimeout(() => advanceTestTo(nextEdge.target), 300);
        }
        break;
      case "cb_escalation":
        setTestMessages((prev) => [...prev, { role: "bot", text: nodeData.config.handoffMessage || "Connecting you with a team member...", nodeId }]);
        setTestMessages((prev) => [...prev, { role: "bot", text: `[ESCALATED: ${nodeData.config.reason || "No reason"}]`, nodeId }]);
        break;
      case "cb_delay":
        setTestMessages((prev) => [...prev, { role: "bot", text: `[Delay: ${nodeData.config.duration} ${nodeData.config.unit}]`, nodeId }]);
        {
          const nextEdge = edges.find((e) => e.source === nodeId);
          if (nextEdge) setTimeout(() => advanceTestTo(nextEdge.target), 300);
        }
        break;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges, testCollectedData]);

  const startTestMode = React.useCallback(() => {
    setTestMode(true);
    setTestMessages([]);
    setTestCollectedData({});

    const targetNodeIds = new Set(edges.map((e) => e.target));
    const startNode = nodes.find((n) => !targetNodeIds.has(n.id));
    if (!startNode) return;

    setTestCurrentNode(startNode.id);
    const nodeData = startNode.data as unknown as ChatbotNodeData;

    if (nodeData.nodeType === "cb_message") {
      setTestMessages([{ role: "bot", text: nodeData.config.messageText || "(empty message)", nodeId: startNode.id }]);
      const nextEdge = edges.find((e) => e.source === startNode.id);
      if (nextEdge) setTimeout(() => advanceTestTo(nextEdge.target), 500);
    } else if (nodeData.nodeType === "cb_question") {
      setTestMessages([{ role: "bot", text: nodeData.config.questionText || "(empty question)", nodeId: startNode.id }]);
    }
  }, [nodes, edges, advanceTestTo]);

  const handleTestInput = React.useCallback(() => {
    if (!testInput.trim() || !testCurrentNode) return;

    const currentNode = nodes.find((n) => n.id === testCurrentNode);
    if (!currentNode) return;
    const nodeData = currentNode.data as unknown as ChatbotNodeData;

    setTestMessages((prev) => [...prev, { role: "user", text: testInput }]);

    if (nodeData.nodeType === "cb_question" && nodeData.config.variableName) {
      setTestCollectedData((prev) => ({
        ...prev,
        [nodeData.config.variableName]: testInput,
      }));
    }

    setTestInput("");

    const nextEdge = edges.find((e) => e.source === testCurrentNode);
    if (nextEdge) {
      setTimeout(() => advanceTestTo(nextEdge.target), 300);
    }
  }, [testInput, testCurrentNode, nodes, edges, advanceTestTo]);

  const handleManualSave = React.useCallback(() => {
    if (!flowName.trim()) return;
    onSave({
      name: flowName,
      description: flowDescription,
      triggerType,
      triggerKeywords: triggerKeywords.split(",").map((k) => k.trim()).filter(Boolean),
      nodes,
      edges,
    });
  }, [onSave, flowName, flowDescription, triggerType, triggerKeywords, nodes, edges]);

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-white/10 bg-white/[0.02] shrink-0">
        <button
          onClick={onBack}
          className="p-1.5 rounded-lg hover:bg-white/5 text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>

        <input
          type="text"
          value={flowName}
          onChange={(e) => setFlowName(e.target.value)}
          placeholder="Flow name..."
          className="text-sm font-medium text-foreground bg-transparent border-none focus:outline-none w-48"
        />

        <input
          type="text"
          value={flowDescription}
          onChange={(e) => setFlowDescription(e.target.value)}
          placeholder="Description..."
          className="text-xs text-muted-foreground bg-transparent border-none focus:outline-none flex-1"
        />

        <select
          value={triggerType}
          onChange={(e) => setTriggerType(e.target.value as ChatbotTriggerType)}
          className="text-[11px] rounded-lg bg-white/[0.05] border border-white/10 px-2 py-1 text-foreground focus:outline-none"
        >
          <option value="dm_start">DM Start</option>
          <option value="group_mention">Group Mention</option>
          <option value="keyword">Keyword</option>
          <option value="all_messages">All Messages</option>
        </select>

        {triggerType === "keyword" && (
          <input
            type="text"
            value={triggerKeywords}
            onChange={(e) => setTriggerKeywords(e.target.value)}
            placeholder="Keywords (comma-separated)"
            className="text-[11px] rounded-lg bg-white/[0.05] border border-white/10 px-2 py-1 text-foreground focus:outline-none w-40"
          />
        )}

        <button
          onClick={handleManualSave}
          disabled={saving || !flowName.trim()}
          className="text-[11px] rounded-lg bg-primary/20 px-3 py-1.5 text-primary hover:bg-primary/30 transition-colors disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>

      {/* Main content */}
      <div className="flex flex-1 min-h-0">
        {/* Node palette sidebar */}
        <div className="w-52 shrink-0 border-r border-white/10 bg-white/[0.02] p-3 space-y-4 overflow-y-auto">
          <p className="text-xs font-semibold text-foreground px-1">Chatbot Nodes</p>
          <p className="text-[10px] text-muted-foreground/60 px-1">Drag onto canvas</p>

          {PALETTE_ITEMS.map((item) => (
            <div
              key={item.type}
              className="flex items-center gap-2.5 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2 cursor-grab hover:bg-white/[0.05] hover:border-white/10 transition-colors active:cursor-grabbing"
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData(
                  "application/chatbot-flow",
                  JSON.stringify({ nodeType: item.type, defaultData: item.defaultData })
                );
                e.dataTransfer.effectAllowed = "move";
              }}
            >
              <div className={`h-6 w-6 rounded flex items-center justify-center shrink-0 ${item.accentClass}`}>
                <div className="h-3 w-3" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-medium text-foreground truncate">{item.label}</p>
                <p className="text-[9px] text-muted-foreground/60 truncate">{item.description}</p>
              </div>
            </div>
          ))}

          <div className="border-t border-white/10 pt-3">
            <button
              onClick={testMode ? () => setTestMode(false) : startTestMode}
              className={`w-full rounded-lg px-3 py-2 text-[11px] font-medium transition-colors ${
                testMode
                  ? "bg-red-500/20 text-red-400 hover:bg-red-500/30"
                  : "bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30"
              }`}
            >
              {testMode ? "Exit Test Mode" : "Test Flow"}
            </button>
          </div>
        </div>

        {/* Canvas */}
        <div ref={reactFlowWrapper} className="flex-1 h-full relative">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onInit={(instance) => setRfInstance(instance as unknown as typeof rfInstance)}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            nodeTypes={chatbotNodeTypes}
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
                  case "cb_message": return "rgba(34, 211, 238, 0.5)";
                  case "cb_question": return "rgba(74, 222, 128, 0.5)";
                  case "cb_condition": return "rgba(234, 179, 8, 0.5)";
                  case "cb_action": return "rgba(59, 130, 246, 0.5)";
                  case "cb_ai": return "rgba(139, 92, 246, 0.5)";
                  case "cb_escalation": return "rgba(248, 113, 113, 0.5)";
                  case "cb_delay": return "rgba(156, 163, 175, 0.5)";
                  default: return "rgba(255,255,255,0.1)";
                }
              }}
            />
          </ReactFlow>

          {saving && (
            <div className="absolute top-3 right-3 text-[10px] text-muted-foreground/50">
              Saving...
            </div>
          )}
        </div>

        {/* Config panel or test panel */}
        {testMode ? (
          <div className="w-80 shrink-0 border-l border-white/10 bg-white/[0.02] flex flex-col">
            <div className="p-3 border-b border-white/10">
              <p className="text-xs font-semibold text-foreground">Test Conversation</p>
              <p className="text-[10px] text-muted-foreground/60 mt-0.5">Simulate user interaction</p>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {testMessages.map((msg, i) => (
                <div
                  key={i}
                  className={`rounded-lg px-3 py-2 text-[11px] max-w-[90%] ${
                    msg.role === "bot"
                      ? "bg-white/[0.05] text-foreground mr-auto"
                      : "bg-primary/20 text-primary ml-auto"
                  }`}
                >
                  {msg.text}
                </div>
              ))}
            </div>

            {Object.keys(testCollectedData).length > 0 && (
              <div className="px-3 py-2 border-t border-white/10">
                <p className="text-[9px] font-semibold text-muted-foreground/60 uppercase mb-1">Collected Data</p>
                {Object.entries(testCollectedData).map(([key, val]) => (
                  <p key={key} className="text-[10px] text-muted-foreground">
                    <span className="font-mono text-primary/80">{key}</span>: {val}
                  </p>
                ))}
              </div>
            )}

            <div className="p-3 border-t border-white/10 flex gap-2">
              <input
                type="text"
                value={testInput}
                onChange={(e) => setTestInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleTestInput()}
                placeholder="Type a message..."
                className="flex-1 rounded-lg bg-white/[0.05] border border-white/10 px-3 py-2 text-[11px] text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/40"
              />
              <button
                onClick={handleTestInput}
                className="rounded-lg bg-primary/20 px-3 py-2 text-[11px] text-primary hover:bg-primary/30 transition-colors"
              >
                Send
              </button>
            </div>
          </div>
        ) : selectedNode ? (
          <FlowConfigPanel
            node={selectedNode}
            onDataChange={onNodeDataChange}
            onDelete={onDeleteNode}
          />
        ) : null}
      </div>
    </div>
  );
}

// ── Public export with provider ────────────────────────────────────

export function ChatbotFlowCanvas(props: ChatbotFlowCanvasProps) {
  return (
    <ReactFlowProvider>
      <ChatbotFlowCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
