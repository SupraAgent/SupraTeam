-- Chatbot Decision Trees: visual flow-based qualification paths
-- Depends on: profiles, crm_contacts, crm_deals, pipeline_stages

-- ── crm_chatbot_flows ──────────────────────────────────────────────
create table if not exists crm_chatbot_flows (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  name text not null,
  description text,
  trigger_type text not null default 'all_messages'
    check (trigger_type in ('dm_start', 'group_mention', 'keyword', 'all_messages')),
  trigger_keywords text[] default '{}',
  is_active boolean not null default true,
  priority int not null default 0,
  target_groups bigint[] default '{}',
  flow_data jsonb not null default '{"nodes":[],"edges":[]}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_chatbot_flows_active
  on crm_chatbot_flows (is_active, priority desc)
  where is_active = true;

create index if not exists idx_chatbot_flows_trigger
  on crm_chatbot_flows (trigger_type)
  where is_active = true;

create index if not exists idx_chatbot_flows_user
  on crm_chatbot_flows (user_id);

-- ── crm_chatbot_flow_runs ──────────────────────────────────────────
create table if not exists crm_chatbot_flow_runs (
  id uuid primary key default gen_random_uuid(),
  flow_id uuid not null references crm_chatbot_flows(id) on delete cascade,
  telegram_user_id bigint not null,
  chat_id bigint not null,
  current_node_id text,
  collected_data jsonb not null default '{}',
  status text not null default 'active'
    check (status in ('active', 'completed', 'abandoned', 'escalated')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_chatbot_flow_runs_active
  on crm_chatbot_flow_runs (telegram_user_id, chat_id, status)
  where status = 'active';

create index if not exists idx_chatbot_flow_runs_flow
  on crm_chatbot_flow_runs (flow_id);

-- ── crm_chatbot_flow_stats ─────────────────────────────────────────
create table if not exists crm_chatbot_flow_stats (
  flow_id uuid primary key references crm_chatbot_flows(id) on delete cascade,
  total_runs int not null default 0,
  completed_runs int not null default 0,
  escalated_runs int not null default 0,
  avg_completion_time_seconds int not null default 0,
  conversion_rate numeric(5,2) not null default 0,
  updated_at timestamptz not null default now()
);

-- ── RLS policies ───────────────────────────────────────────────────
alter table crm_chatbot_flows enable row level security;
alter table crm_chatbot_flow_runs enable row level security;
alter table crm_chatbot_flow_stats enable row level security;

-- Flows: all authenticated users can read, owners can write
create policy "chatbot_flows_select" on crm_chatbot_flows
  for select to authenticated using (true);

create policy "chatbot_flows_insert" on crm_chatbot_flows
  for insert to authenticated with check (auth.uid() = user_id);

create policy "chatbot_flows_update" on crm_chatbot_flows
  for update to authenticated using (auth.uid() = user_id);

create policy "chatbot_flows_delete" on crm_chatbot_flows
  for delete to authenticated using (auth.uid() = user_id);

-- Flow runs: all authenticated users can read (for analytics), system writes via service role
create policy "chatbot_flow_runs_select" on crm_chatbot_flow_runs
  for select to authenticated using (true);

create policy "chatbot_flow_runs_insert" on crm_chatbot_flow_runs
  for insert to authenticated with check (true);

create policy "chatbot_flow_runs_update" on crm_chatbot_flow_runs
  for update to authenticated using (true);

-- Stats: all authenticated users can read
create policy "chatbot_flow_stats_select" on crm_chatbot_flow_stats
  for select to authenticated using (true);

create policy "chatbot_flow_stats_insert" on crm_chatbot_flow_stats
  for insert to authenticated with check (true);

create policy "chatbot_flow_stats_update" on crm_chatbot_flow_stats
  for update to authenticated using (true);

-- ── Auto-update updated_at trigger ─────────────────────────────────
create or replace function update_chatbot_flow_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_chatbot_flows_updated_at
  before update on crm_chatbot_flows
  for each row execute function update_chatbot_flow_updated_at();
