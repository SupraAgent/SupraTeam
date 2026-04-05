/**
 * Type definitions for the Chatbot Decision Tree flow builder.
 * Node types represent steps in a conversation flow that the bot executes.
 */

// ── Trigger types ──────────────────────────────────────────────────

export type ChatbotTriggerType = "dm_start" | "group_mention" | "keyword" | "all_messages";

// ── Node type discriminators ───────────────────────────────────────

export type ChatbotNodeType =
  | "cb_message"
  | "cb_question"
  | "cb_condition"
  | "cb_action"
  | "cb_ai"
  | "cb_escalation"
  | "cb_delay";

// ── Node data interfaces ───────────────────────────────────────────

export interface MessageNodeData {
  nodeType: "cb_message";
  label: string;
  config: {
    messageText: string;
    parseMode?: "plain" | "markdown";
  };
}

export type QuestionResponseType = "text" | "choice" | "number" | "email" | "phone";

export interface QuestionNodeData {
  nodeType: "cb_question";
  label: string;
  config: {
    questionText: string;
    responseType: QuestionResponseType;
    variableName: string;
    choices?: string[];
    validationMessage?: string;
  };
}

export type ConditionType =
  | "response_contains"
  | "response_matches_regex"
  | "collected_field_equals"
  | "ai_intent_is";

export interface ConditionNodeData {
  nodeType: "cb_condition";
  label: string;
  config: {
    conditionType: ConditionType;
    field: string;
    operator: string;
    value: string;
  };
}

export type ChatbotActionType =
  | "create_contact"
  | "create_deal"
  | "assign_to"
  | "add_tag"
  | "send_notification"
  | "enroll_in_sequence";

export interface ActionNodeData {
  nodeType: "cb_action";
  label: string;
  config: {
    actionType: ChatbotActionType;
    /** Action-specific config keyed by action type */
    dealName?: string;
    boardType?: string;
    assigneeId?: string;
    tagName?: string;
    notificationMessage?: string;
    sequenceId?: string;
  };
}

export type AIModelType = "haiku" | "sonnet";

export interface AINodeData {
  nodeType: "cb_ai";
  label: string;
  config: {
    promptTemplate: string;
    model: AIModelType;
    variableName: string;
    maxTokens?: number;
  };
}

export interface EscalationNodeData {
  nodeType: "cb_escalation";
  label: string;
  config: {
    reason: string;
    notifyRoles: string[];
    handoffMessage: string;
  };
}

export interface DelayNodeData {
  nodeType: "cb_delay";
  label: string;
  config: {
    duration: number;
    unit: "seconds" | "minutes" | "hours";
  };
}

// ── Union type ─────────────────────────────────────────────────────

export type ChatbotNodeData =
  | MessageNodeData
  | QuestionNodeData
  | ConditionNodeData
  | ActionNodeData
  | AINodeData
  | EscalationNodeData
  | DelayNodeData;

// ── Flow types ─────────────────────────────────────────────────────

export interface ChatbotFlowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
}

export interface ChatbotFlowNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: ChatbotNodeData;
}

export interface ChatbotFlow {
  id: string;
  name: string;
  description: string | null;
  triggerType: ChatbotTriggerType;
  triggerKeywords: string[];
  isActive: boolean;
  priority: number;
  targetGroups: number[];
  nodes: ChatbotFlowNode[];
  edges: ChatbotFlowEdge[];
  createdAt: string;
  updatedAt: string;
}

// ── Run tracking ───────────────────────────────────────────────────

export type ChatbotFlowRunStatus = "active" | "completed" | "abandoned" | "escalated";

export interface ChatbotFlowRun {
  id: string;
  flowId: string;
  telegramUserId: number;
  chatId: number;
  currentNodeId: string | null;
  collectedData: Record<string, string | number>;
  status: ChatbotFlowRunStatus;
  startedAt: string;
  completedAt: string | null;
}

// ── Stats ──────────────────────────────────────────────────────────

export interface ChatbotFlowStats {
  flowId: string;
  totalRuns: number;
  completedRuns: number;
  escalatedRuns: number;
  avgCompletionTimeSeconds: number;
  conversionRate: number;
}
