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

-- Atomic reply count increment (avoids read-modify-write race)
create or replace function increment_enrollment_reply(p_enrollment_id uuid)
returns void
language sql
as $$
  update crm_outreach_enrollments
  set reply_count = coalesce(reply_count, 0) + 1,
      last_reply_at = now()
  where id = p_enrollment_id;
$$;

-- Unique constraint on telegram_user_id for upsert safety
create unique index if not exists idx_contacts_telegram_user_id_unique
  on crm_contacts (telegram_user_id)
  where telegram_user_id is not null;
