-- Automation execution log for audit trail
create table if not exists public.crm_automation_log (
  id uuid default gen_random_uuid() primary key,
  rule_id uuid references public.crm_automation_rules on delete set null,
  deal_id uuid references public.crm_deals on delete set null,
  trigger_type text not null,
  action_type text not null,
  success boolean not null default false,
  created_at timestamptz default now()
);

create index if not exists idx_automation_log_rule on public.crm_automation_log (rule_id);
create index if not exists idx_automation_log_created on public.crm_automation_log (created_at desc);
