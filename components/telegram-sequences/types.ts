// ── Telegram Sequence Builder Types ─────────────────────────────

export interface TGSequenceStepPosition {
  x: number;
  y: number;
}

export interface TGSequenceStep {
  id: string;
  type: "message" | "condition" | "wait";
  position: TGSequenceStepPosition;
}

export interface MessageStep extends TGSequenceStep {
  type: "message";
  template: string;
  variant_b_template: string | null;
  variant_c_template: string | null;
  ab_split_pct: number;
  delay_hours: number;
  variant_b_delay_hours: number | null;
}

export type ConditionType =
  | "reply_received"
  | "no_reply_timeout"
  | "engagement_score"
  | "deal_stage"
  | "message_keyword"
  | "days_since_enroll"
  | "ab_split";

export interface ConditionStep extends TGSequenceStep {
  type: "condition";
  condition_type: ConditionType;
  threshold: number | null;
  keyword: string | null;
  stage_id: string | null;
  timeout_hours: number | null;
  days: number | null;
  split_percentage: number | null;
  on_true_step: string | null;
  on_false_step: string | null;
}

export interface WaitStep extends TGSequenceStep {
  type: "wait";
  wait_hours: number;
}

export type TGSequenceNode = MessageStep | ConditionStep | WaitStep;

export type TriggerType = "manual" | "group_join" | "first_message" | "keyword_match";

export interface TGSequenceTriggerConfig {
  keyword?: string;
  group_id?: string;
  [key: string]: unknown;
}

export interface TGSequenceStats {
  enrolled: number;
  active: number;
  completed: number;
  replied: number;
  reply_rate: number;
}

export interface TGSequence {
  id: string;
  name: string;
  description: string | null;
  trigger_type: TriggerType;
  trigger_config: TGSequenceTriggerConfig;
  steps: TGSequenceNode[];
  is_active: boolean;
  stats: TGSequenceStats;
  created_at: string;
  updated_at: string;
}

export interface TGSequenceEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  label: "true" | "false" | "next";
}

// ── Node data shapes for React Flow ────────────────────────────

export interface TGTriggerNodeData {
  nodeType: "trigger";
  trigger_type: TriggerType;
  trigger_config: TGSequenceTriggerConfig;
  label: string;
}

export interface TGMessageNodeData {
  nodeType: "message";
  template: string;
  variant_b_template: string | null;
  variant_c_template: string | null;
  ab_split_pct: number;
  delay_hours: number;
  variant_b_delay_hours: number | null;
  label: string;
}

export interface TGConditionNodeData {
  nodeType: "condition";
  condition_type: ConditionType;
  threshold: number | null;
  keyword: string | null;
  stage_id: string | null;
  timeout_hours: number | null;
  days: number | null;
  split_percentage: number | null;
  label: string;
}

export interface TGWaitNodeData {
  nodeType: "wait";
  wait_hours: number;
  label: string;
}

export type TGNodeData =
  | TGTriggerNodeData
  | TGMessageNodeData
  | TGConditionNodeData
  | TGWaitNodeData;

// ── Helpers ────────────────────────────────────────────────────

export function createDefaultMessageStep(id: string, position: TGSequenceStepPosition): MessageStep {
  return {
    id,
    type: "message",
    position,
    template: "",
    variant_b_template: null,
    variant_c_template: null,
    ab_split_pct: 50,
    delay_hours: 0,
    variant_b_delay_hours: null,
  };
}

export function createDefaultConditionStep(id: string, position: TGSequenceStepPosition): ConditionStep {
  return {
    id,
    type: "condition",
    position,
    condition_type: "reply_received",
    threshold: null,
    keyword: null,
    stage_id: null,
    timeout_hours: null,
    days: null,
    split_percentage: null,
    on_true_step: null,
    on_false_step: null,
  };
}

export function createDefaultWaitStep(id: string, position: TGSequenceStepPosition): WaitStep {
  return {
    id,
    type: "wait",
    position,
    wait_hours: 24,
  };
}

export const CONDITION_TYPE_LABELS: Record<ConditionType, string> = {
  reply_received: "Reply Received",
  no_reply_timeout: "No Reply (Timeout)",
  engagement_score: "Engagement Score",
  deal_stage: "Deal Stage",
  message_keyword: "Message Keyword",
  days_since_enroll: "Days Since Enrollment",
  ab_split: "A/B Split",
};

export const TRIGGER_TYPE_LABELS: Record<TriggerType, string> = {
  manual: "Manual",
  group_join: "Group Join",
  first_message: "First Message",
  keyword_match: "Keyword Match",
};

export const TEMPLATE_VARIABLES = [
  { key: "{first_name}", label: "First Name" },
  { key: "{group_name}", label: "Group Name" },
  { key: "{deal_name}", label: "Deal Name" },
  { key: "{stage}", label: "Pipeline Stage" },
  { key: "{company}", label: "Company" },
] as const;
