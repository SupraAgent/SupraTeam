-- Migration 017: Template versioning and custom templates

create table if not exists crm_template_versions (
  id uuid primary key default gen_random_uuid(),
  template_key text not null,
  body_template text not null,
  version_number int not null default 1,
  changed_by uuid references auth.users(id),
  change_note text,
  created_at timestamptz default now()
);

create index if not exists idx_template_versions_key
  on crm_template_versions(template_key, version_number desc);

alter table crm_template_versions enable row level security;
create policy "Authenticated users can manage template versions"
  on crm_template_versions for all to authenticated using (true) with check (true);

-- Allow custom templates (not just seeded ones)
-- Add available_variables column to help editors
alter table crm_bot_templates
  add column if not exists available_variables text[],
  add column if not exists category text default 'notification';

-- Backfill available_variables for existing templates
update crm_bot_templates set available_variables = ARRAY['deal_name', 'from_stage', 'to_stage', 'board_type', 'changed_by']
  where template_key = 'stage_change' and available_variables is null;
update crm_bot_templates set available_variables = ARRAY['total_deals', 'board_summary', 'stage_summary', 'moves_today', 'top_deals_section']
  where template_key = 'daily_digest' and available_variables is null;
update crm_bot_templates set available_variables = ARRAY['message', 'sender_name']
  where template_key = 'broadcast' and available_variables is null;
update crm_bot_templates set available_variables = ARRAY[]::text[]
  where template_key = 'welcome_group' and available_variables is null;
