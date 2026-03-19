-- Deal health score, win/loss, reminders, AI summaries

-- Win/loss outcome on deals
alter table public.crm_deals
  add column if not exists outcome text check (outcome in ('open', 'won', 'lost')),
  add column if not exists outcome_reason text,
  add column if not exists outcome_at timestamptz,
  add column if not exists expected_close_date date,
  add column if not exists health_score int check (health_score >= 0 and health_score <= 100),
  add column if not exists ai_summary text,
  add column if not exists ai_summary_at timestamptz;

-- Set default outcome for existing deals
update public.crm_deals set outcome = 'open' where outcome is null;

-- Smart reminders per stage
create table if not exists public.crm_stage_reminders (
  id uuid default gen_random_uuid() primary key,
  stage_id uuid references public.pipeline_stages on delete cascade not null,
  remind_after_hours int not null default 72,
  message text not null default 'Deal needs attention',
  is_active boolean default true,
  created_at timestamptz default now(),
  unique (stage_id)
);

-- Deal reminders (generated from stage rules)
create table if not exists public.crm_deal_reminders (
  id uuid default gen_random_uuid() primary key,
  deal_id uuid references public.crm_deals on delete cascade not null,
  reminder_type text not null check (reminder_type in ('follow_up', 'stale', 'stage_suggestion', 'escalation')),
  message text not null,
  is_dismissed boolean default false,
  due_at timestamptz not null,
  created_at timestamptz default now()
);

create index if not exists idx_deal_reminders_active on public.crm_deal_reminders (is_dismissed, due_at) where is_dismissed = false;
create index if not exists idx_deal_reminders_deal on public.crm_deal_reminders (deal_id);

-- Highlight priority and sentiment
alter table public.crm_highlights
  add column if not exists priority text check (priority in ('low', 'medium', 'high', 'urgent')),
  add column if not exists sentiment text check (sentiment in ('positive', 'neutral', 'negative'));
