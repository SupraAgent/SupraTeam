export type PipelineStage = {
  id: string;
  name: string;
  position: number;
  color: string | null;
  board_type: string | null;
};

export type LifecycleStage = "prospect" | "lead" | "opportunity" | "customer" | "churned" | "inactive";
export type ContactSource = "manual" | "telegram_import" | "telegram_bot" | "csv_import" | "referral" | "event" | "inbound" | "outbound";

export type Contact = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  telegram_username: string | null;
  telegram_user_id: number | null;
  company: string | null;
  title: string | null;
  notes: string | null;
  stage_id: string | null;
  lifecycle_stage: LifecycleStage;
  lifecycle_changed_at: string | null;
  source: ContactSource;
  last_activity_at: string | null;
  quality_score: number;
  engagement_score: number;
  engagement_updated_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  stage?: PipelineStage | null;
};

export type DealOutcome = "open" | "won" | "lost";

export type Deal = {
  id: string;
  deal_name: string;
  contact_id: string | null;
  assigned_to: string | null;
  board_type: "BD" | "Marketing" | "Admin" | "Applications";
  stage_id: string | null;
  value: number | null;
  probability: number | null;
  telegram_chat_id: number | null;
  telegram_chat_name: string | null;
  telegram_chat_link: string | null;
  outcome: DealOutcome | null;
  outcome_reason: string | null;
  outcome_at: string | null;
  health_score: number | null;
  expected_close_date: string | null;
  stage_changed_at: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  ai_sentiment?: Record<string, unknown> | null;
  ai_summary?: string | null;
  ai_summary_at?: string | null;
  ai_sentiment_at?: string | null;
  awaiting_response_since?: string | null;
  // Joined fields
  contact?: Contact | null;
  stage?: PipelineStage | null;
  assigned_profile?: { display_name: string; avatar_url: string } | null;
};

export type BoardType = "All" | "BD" | "Marketing" | "Admin" | "Applications";

export type Doc = {
  id: string;
  title: string;
  content: string;
  created_by: string;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  links: DocLink[];
};

export type DocLink = {
  entity_type: "deal" | "contact" | "group";
  entity_id: string;
  entity_name?: string;
};
