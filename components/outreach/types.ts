export interface EnrollmentStats {
  total: number;
  active: number;
  completed: number;
  replied: number;
}

export interface Sequence {
  id: string;
  name: string;
  description: string | null;
  status: string;
  board_type: string | null;
  tone: string | null;
  step_count: number;
  enrollment_stats: EnrollmentStats;
  created_at: string;
  updated_at: string;
}

export interface OutreachAlert {
  id: string;
  sequence_id: string;
  alert_type: string;
  message: string;
  created_at: string;
  sequence_name: string;
}

export interface Step {
  id: string;
  step_number: number;
  delay_hours: number;
  message_template: string;
  variant_b_template: string | null;
  variant_c_template: string | null;
  ab_split_pct: number | null;
  variant_b_delay_hours: number | null;
  step_type: string;
  step_label: string | null;
  condition_type: string | null;
  condition_config: Record<string, unknown> | null;
  on_true_step: number | null;
  on_false_step: number | null;
  split_percentage: number | null;
}

export interface SequenceAnalytics {
  id: string;
  name: string;
  status: string;
  step_count: number;
  total: number;
  active: number;
  completed: number;
  replied: number;
  paused: number;
  reply_rate: number;
  completion_rate: number;
}

export interface ABStats {
  variant_a: { total: number; replied: number; reply_rate: number };
  variant_b: { total: number; replied: number; reply_rate: number };
  variant_c?: { total: number; replied: number; reply_rate: number };
  step_variants: Record<string, { a_sent: number; b_sent: number; c_sent?: number }>;
  significance: { z_score: number; significant: boolean; min_sample: boolean } | null;
}

export interface StepStat {
  step_number: number;
  step_label: string;
  step_type: string;
  delay_hours: number;
  sent: number;
  preview: string;
  ab: { a_sent: number; b_sent: number; a_reply_rate: number; b_reply_rate: number; c_sent?: number; c_reply_rate?: number } | null;
}

export interface SequenceDetail {
  sequence: { id: string; name: string; status: string } | null;
  total: number;
  replied: number;
  reply_rate: number;
  completion_rate: number;
  status_counts: Record<string, number>;
  step_stats: StepStat[];
  ab_stats: ABStats | null;
  daily_enrollments: Array<{ date: string; count: number }>;
}

export interface AIRecommendation {
  type: string;
  step: number | null;
  title: string;
  detail: string;
  suggested_change: string;
}

export interface AIRecommendations {
  summary: string;
  recommendations: AIRecommendation[];
  ab_winner: string | null;
  ab_confidence: string | null;
}

export interface NewStep {
  message_template: string;
  variant_b_template: string;
  variant_c_template: string;
  ab_split_pct: number;
  variant_b_delay_hours: number | null;
  delay_hours: number;
  step_type: string;
  step_label: string;
  condition_type: string;
  condition_config: Record<string, unknown>;
  on_true_step: number | null;
  on_false_step: number | null;
  split_percentage: number | null;
}

export function createDefaultStep(overrides?: Partial<NewStep>): NewStep {
  return {
    message_template: "",
    variant_b_template: "",
    variant_c_template: "",
    ab_split_pct: 50,
    variant_b_delay_hours: null,
    delay_hours: 24,
    step_type: "message",
    step_label: "",
    condition_type: "",
    condition_config: {},
    on_true_step: null,
    on_false_step: null,
    split_percentage: null,
    ...overrides,
  };
}
