import type * as React from "react";
import type { Node, Edge } from "@xyflow/react";
import type { FlowTemplate } from "./lib/flow-templates";
import type { WorkflowExecution } from "./lib/workflow-engine";

// ── AI Handler Types ─────────────────────────────────────────

export type FlowChatRequest = {
  apiKey: string;
  message: string;
  currentNodes: Node[];
  currentEdges: Edge[];
  canvasSummary?: string;
  category: string;
  history: { role: string; content: string }[];
};

export type FlowChatResponse = {
  message: string;
  flowUpdate?: { nodes: Node[]; edges: Edge[] };
  saveAsTemplate?: { name: string; description: string };
  /** Parsed user-node definition from AI response (server-side extracted) */
  userNodeDef?: {
    label: string;
    description?: string;
    emoji?: string;
    color?: string;
    inputs?: number;
    outputs?: number;
    fields?: Array<{
      key: string;
      label: string;
      type: "text" | "textarea" | "number" | "select" | "boolean";
      defaultValue: string | number | boolean;
      options?: string[];
      placeholder?: string;
    }>;
  };
  error?: string;
};

export type LLMExecuteRequest = {
  apiKey: string;
  systemPrompt: string;
  userMessage: string;
  temperature: number;
  maxTokens: number;
  model?: string;
  /** If true, return a ReadableStream of text chunks instead of a complete response */
  stream?: boolean;
};

export type LLMExecuteResponse = {
  content: string;
  error?: string;
  usage?: { input_tokens?: number; output_tokens?: number };
  /** Present when stream=true was requested — caller reads chunks from this */
  stream?: ReadableStream<string>;
};

export type FlowChatHandler = (req: FlowChatRequest) => Promise<FlowChatResponse>;
export type LLMExecuteHandler = (req: LLMExecuteRequest) => Promise<LLMExecuteResponse>;

// ── Credential Store Types ──────────────────────────────────

export type StoredCredential = {
  id: string;
  name: string;
  provider: string;
  /** Base64-encoded encrypted value */
  encryptedValue: string;
  /** IV for AES-GCM decryption */
  iv: string;
  createdAt: string;
  updatedAt: string;
};

// ── Component Props ──────────────────────────────────────────

/** Configuration for the WorkflowBuilder component */
export type WorkflowBuilderProps = {
  /** Optional initial nodes to load */
  initialNodes?: Node[];
  /** Optional initial edges to load */
  initialEdges?: Edge[];
  /** Template category for the builder */
  category?: FlowTemplate["category"];
  /** Custom node types to register alongside built-in ones */
  customNodeTypes?: Record<string, React.ComponentType<unknown>>;
  /** localStorage key prefix for workspaces/templates (default: "athena") */
  storageKeyPrefix?: string;
  /** Disable auto-layout on template load */
  disableAutoLayout?: boolean;

  // ── Callbacks ──────────────────────────────────────────────

  /** Called when nodes change */
  onNodesChange?: (nodes: Node[]) => void;
  /** Called when edges change */
  onEdgesChange?: (edges: Edge[]) => void;
  /** Called when the user clicks "Save" */
  onSave?: (nodes: Node[], edges: Edge[]) => void;
  /** Called when the user clicks "Validate & Run" */
  onRun?: (nodes: Node[], edges: Edge[]) => Promise<void> | void;
  /** Called when a template is created/saved */
  onTemplateCreate?: (template: FlowTemplate) => void;
  /** Called when the user exports JSON */
  onExport?: (data: { nodes: Node[]; edges: Edge[] }) => void;
  /** Called when the user imports JSON */
  onImport?: (data: { nodes: Node[]; edges: Edge[] }) => void;
  /** Called when workspace changes */
  onWorkspaceChange?: (workspaceId: string, nodes: Node[], edges: Edge[]) => void;

  // ── AI Handlers ────────────────────────────────────────────

  /** Handler for AI flow chat requests. Builder calls this instead of fetching an endpoint. */
  onChat?: FlowChatHandler;
  /** Handler for LLM execution requests. Builder calls this instead of fetching an endpoint. */
  onLLMExecute?: LLMExecuteHandler;
  /** API key for AI features (if not provided, reads from localStorage) */
  apiKey?: string;

  // ── UI Customization ───────────────────────────────────────

  /** Custom title for the header (default: "Workflow Builder") */
  title?: string;
  /** Custom subtitle (default: "Drag nodes, connect cards, build chains of operations.") */
  subtitle?: string;
  /** Show/hide the start screen (default: true) */
  showStartScreen?: boolean;
  /** Show/hide AI chat button (default: true) */
  showAIChat?: boolean;
  /** Show/hide the execution panel (default: true) */
  showExecutionPanel?: boolean;
  /** Custom className for the root container */
  className?: string;
};

export type { WorkflowExecution };
