export type PipelineStage = {
  id: string;
  name: string;
  position: number;
  color: string | null;
  board_type: string | null;
};

export type LifecycleStage = "prospect" | "lead" | "opportunity" | "customer" | "churned" | "inactive";
export type ContactSource = "manual" | "telegram_import" | "telegram_bot" | "csv_import" | "referral" | "event" | "inbound" | "outbound";

export type TokenStatus = "pre_tge" | "post_tge" | "no_token";
export type FundingStage = "pre_seed" | "seed" | "series_a" | "series_b" | "series_c" | "public" | "bootstrapped";
export type ProtocolType = "defi" | "infrastructure" | "gaming" | "nft" | "dao" | "social" | "bridge" | "oracle" | "wallet" | "other";
export type DecisionMakerLevel = "founder" | "c_level" | "vp" | "director" | "manager" | "ic";
export type PartnershipType = "integration" | "listing" | "co_marketing" | "investment" | "advisory" | "node_operator";

export interface Wallet {
  address: string;
  chain: string;
  label?: string;
}

export interface Company {
  id: string;
  name: string;
  domain: string | null;
  industry: string | null;
  website: string | null;
  description: string | null;
  logo_url: string | null;
  employee_count: number | null;
  location: string | null;
  tvl: number | null;
  chain_deployments: string[];
  token_status: TokenStatus | null;
  funding_stage: FundingStage | null;
  protocol_type: ProtocolType | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  contact_count?: number;
}

export type Contact = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  telegram_username: string | null;
  telegram_user_id: number | null;
  company: string | null;
  company_id: string | null;
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
  x_handle: string | null;
  wallet_address: string | null;
  wallet_chain: string | null;
  wallets: Wallet[];
  decision_maker_level: DecisionMakerLevel | null;
  partnership_type: PartnershipType | null;
  on_chain_score: number;
  x_bio: string | null;
  x_followers: number | null;
  x_last_tweet_at: string | null;
  enriched_at: string | null;
  enrichment_source: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  stage?: PipelineStage | null;
  linked_company?: Company | null;
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
  reference_code?: string | null;
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

export interface DealLinkedChat {
  id: string;
  deal_id: string;
  telegram_chat_id: number;
  chat_type: "dm" | "group" | "channel" | "supergroup";
  chat_title: string | null;
  chat_link: string | null;
  is_primary: boolean;
  linked_by: string | null;
  linked_at: string;
}

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

// --- Graph: Relationship Intelligence ---

export type RelationshipType =
  | "colleague"
  | "reports_to"
  | "manages"
  | "introduced_by"
  | "partner"
  | "advisor"
  | "investor"
  | "custom";

export interface ContactRelationship {
  id: string;
  contact_a_id: string;
  contact_b_id: string;
  relationship_type: RelationshipType;
  label: string | null;
  strength: number;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// --- Graph: Deal Influence Network ---

export type DealParticipantRole =
  | "primary"
  | "champion"
  | "influencer"
  | "blocker"
  | "decision_maker"
  | "involved";

export interface DealParticipant {
  id: string;
  deal_id: string;
  contact_id: string;
  role: DealParticipantRole;
  influence_score: number;
  added_by: string | null;
  added_at: string;
  notes: string | null;
  // Joined
  contact?: Contact | null;
}

// --- Graph node/edge types ---

export type GraphNodeType = "deal" | "contact" | "group" | "doc";
export type GraphViewMode = "explorer" | "relationships" | "deal-influence";

export interface GraphNode {
  id: string;
  type: GraphNodeType;
  label: string;
  meta: Record<string, unknown>;
  parent?: string;
}

export interface GraphEdge {
  source: string;
  target: string;
  type: string;
  strength?: number;
  label?: string;
}
