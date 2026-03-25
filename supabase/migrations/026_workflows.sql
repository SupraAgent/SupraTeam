-- Migration 024: Visual workflow builder
-- Adds multi-step automation workflows with React Flow node/edge storage

-- Workflows: stores the visual flow as React Flow JSON
create table if not exists crm_workflows (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  nodes jsonb not null default '[]',
  edges jsonb not null default '[]',
  is_active boolean default false,
  trigger_type text,  -- denormalized for fast lookup: 'deal_stage_change', 'deal_created', 'email_received', 'tg_message', 'calendar_event', 'webhook', 'manual'
  last_run_at timestamptz,
  run_count int default 0,
  created_by uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Workflow execution runs
create table if not exists crm_workflow_runs (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid references crm_workflows(id) on delete cascade,
  trigger_event jsonb,
  status text default 'running' check (status in ('running', 'completed', 'failed', 'paused')),
  current_node_id text,
  node_outputs jsonb default '{}',
  error text,
  started_at timestamptz default now(),
  completed_at timestamptz
);

-- Indexes
create index if not exists idx_workflows_trigger on crm_workflows(trigger_type) where is_active = true;
create index if not exists idx_workflow_runs_workflow on crm_workflow_runs(workflow_id);
create index if not exists idx_workflow_runs_status on crm_workflow_runs(status) where status in ('running', 'paused');

-- RLS
alter table crm_workflows enable row level security;
alter table crm_workflow_runs enable row level security;

create policy "Authenticated users can manage workflows"
  on crm_workflows for all to authenticated using (true) with check (true);
create policy "Authenticated users can manage workflow runs"
  on crm_workflow_runs for all to authenticated using (true) with check (true);
