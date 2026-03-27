-- Stage 2: AI Lead Qualification + Contact Engagement Scoring
-- Adds auto_create_deals flag to AI agent config
-- Adds engagement_score to contacts for TG activity-based scoring

-- AI agent: auto-deal creation flag
alter table crm_ai_agent_config
  add column if not exists auto_create_deals boolean default false;

-- Contact engagement scoring
alter table crm_contacts
  add column if not exists engagement_score integer default 0,
  add column if not exists engagement_updated_at timestamptz;

-- Index for sorting/filtering by engagement
create index if not exists idx_contacts_engagement
  on crm_contacts (engagement_score desc);

-- Add lead_qualified trigger type to workflow index coverage
-- (workflows table already stores trigger_type as text, no schema change needed)
