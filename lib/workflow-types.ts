/**
 * Type definitions for the visual workflow builder.
 * Nodes and edges follow React Flow's data model with typed `data` payloads.
 */

// ── Trigger configs ──────────────────────────────────────────────

export type TriggerType =
  | "deal_stage_change"
  | "deal_created"
  | "email_received"
  | "tg_message"
  | "calendar_event"
  | "webhook"
  | "manual";

export interface TriggerDealStageChangeConfig {
  from_stage?: string;
  to_stage?: string;
  board_type?: string;
}

export interface TriggerDealCreatedConfig {
  board_type?: string;
}

export interface TriggerEmailReceivedConfig {
  from_contains?: string;
  subject_contains?: string;
}

export interface TriggerTgMessageConfig {
  chat_id?: string;
  keyword?: string;
}

export interface TriggerCalendarEventConfig {
  calendar_id?: string;
  event_type?: "created" | "updated" | "upcoming";
  minutes_before?: number;
}

export interface TriggerWebhookConfig {
  // No config needed — webhook URL is derived from workflow ID
}

export interface TriggerManualConfig {
  // No config needed
}

export type TriggerConfig =
  | TriggerDealStageChangeConfig
  | TriggerDealCreatedConfig
  | TriggerEmailReceivedConfig
  | TriggerTgMessageConfig
  | TriggerCalendarEventConfig
  | TriggerWebhookConfig
  | TriggerManualConfig;

// ── Action configs ───────────────────────────────────────────────

export type ActionType =
  | "send_telegram"
  | "send_email"
  | "update_deal"
  | "create_task";

export interface ActionSendTelegramConfig {
  message: string; // supports {{deal_name}}, {{stage}}, etc.
  chat_id?: string; // override — defaults to deal's linked chat
}

export interface ActionSendEmailConfig {
  to?: string; // override — defaults to contact email
  subject: string;
  body: string;
  template_id?: string;
}

export interface ActionUpdateDealConfig {
  field: string; // 'stage', 'value', 'board_type', 'assigned_to'
  value: string;
}

export interface ActionCreateTaskConfig {
  title: string;
  description?: string;
  due_hours?: number; // hours from now
}

export type ActionConfig =
  | ActionSendTelegramConfig
  | ActionSendEmailConfig
  | ActionUpdateDealConfig
  | ActionCreateTaskConfig;

// ── Logic configs ────────────────────────────────────────────────

export interface ConditionConfig {
  field: string; // deal field to check
  operator: "equals" | "not_equals" | "contains" | "gt" | "lt" | "gte" | "lte" | "is_empty" | "is_not_empty";
  value: string;
}

export interface DelayConfig {
  duration: number;
  unit: "minutes" | "hours" | "days";
}

// ── Node data (stored in React Flow node.data) ──────────────────

export type WorkflowNodeType =
  | "trigger"
  | "action"
  | "condition"
  | "delay";

export interface TriggerNodeData {
  nodeType: "trigger";
  triggerType: TriggerType;
  label: string;
  config: TriggerConfig;
}

export interface ActionNodeData {
  nodeType: "action";
  actionType: ActionType;
  label: string;
  config: ActionConfig;
}

export interface ConditionNodeData {
  nodeType: "condition";
  label: string;
  config: ConditionConfig;
}

export interface DelayNodeData {
  nodeType: "delay";
  label: string;
  config: DelayConfig;
}

export type WorkflowNodeData =
  | TriggerNodeData
  | ActionNodeData
  | ConditionNodeData
  | DelayNodeData;

// ── Workflow (DB row) ────────────────────────────────────────────

export interface Workflow {
  id: string;
  name: string;
  description: string | null;
  nodes: unknown[]; // React Flow Node[]
  edges: unknown[]; // React Flow Edge[]
  is_active: boolean;
  trigger_type: TriggerType | null;
  last_run_at: string | null;
  run_count: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkflowRun {
  id: string;
  workflow_id: string;
  trigger_event: Record<string, unknown> | null;
  status: "running" | "completed" | "failed" | "paused";
  current_node_id: string | null;
  node_outputs: Record<string, unknown>;
  error: string | null;
  started_at: string;
  completed_at: string | null;
}

// ── Node palette definitions ─────────────────────────────────────

export interface NodePaletteItem {
  type: WorkflowNodeType;
  subType: string;
  label: string;
  description: string;
  icon: string; // lucide icon name
  defaultConfig: Record<string, unknown>;
}

export const TRIGGER_PALETTE: NodePaletteItem[] = [
  { type: "trigger", subType: "deal_stage_change", label: "Deal Stage Change", description: "When a deal moves stages", icon: "ArrowRightLeft", defaultConfig: {} },
  { type: "trigger", subType: "deal_created", label: "Deal Created", description: "When a new deal is added", icon: "PlusCircle", defaultConfig: {} },
  { type: "trigger", subType: "email_received", label: "Email Received", description: "When an email arrives", icon: "Mail", defaultConfig: {} },
  { type: "trigger", subType: "tg_message", label: "Telegram Message", description: "When a TG message matches", icon: "MessageCircle", defaultConfig: {} },
  { type: "trigger", subType: "calendar_event", label: "Calendar Event", description: "Google Calendar trigger", icon: "Calendar", defaultConfig: {} },
  { type: "trigger", subType: "webhook", label: "Webhook", description: "Triggered by HTTP POST", icon: "Webhook", defaultConfig: {} },
  { type: "trigger", subType: "manual", label: "Manual Trigger", description: "Run manually", icon: "Play", defaultConfig: {} },
];

export const ACTION_PALETTE: NodePaletteItem[] = [
  { type: "action", subType: "send_telegram", label: "Send Telegram", description: "Send a Telegram message", icon: "Send", defaultConfig: { message: "" } },
  { type: "action", subType: "send_email", label: "Send Email", description: "Send an email", icon: "Mail", defaultConfig: { subject: "", body: "" } },
  { type: "action", subType: "update_deal", label: "Update Deal", description: "Change a deal field", icon: "Pencil", defaultConfig: { field: "stage", value: "" } },
  { type: "action", subType: "create_task", label: "Create Task", description: "Add a CRM task", icon: "CheckSquare", defaultConfig: { title: "" } },
];

export const LOGIC_PALETTE: NodePaletteItem[] = [
  { type: "condition", subType: "condition", label: "Condition", description: "If/else branch", icon: "GitBranch", defaultConfig: { field: "board_type", operator: "equals", value: "" } },
  { type: "delay", subType: "delay", label: "Delay", description: "Wait before continuing", icon: "Clock", defaultConfig: { duration: 1, unit: "hours" } },
];
