-- Migration 015: Automation rules, scheduled messages, notification log
-- Adds custom trigger-condition-action rules, message queue, and delivery tracking

-- Automation rules: trigger → condition → action
create table if not exists crm_automation_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  trigger_type text not null,  -- 'stage_change', 'deal_created', 'deal_value_change', 'tag_added'
  trigger_config jsonb default '{}',  -- e.g. {"to_stage": "MOU Signed"}, {"value_gte": 50000}
  condition_config jsonb default '{}', -- optional filters: {"board_type": "BD"}
  action_type text not null,   -- 'send_telegram', 'schedule_message', 'create_reminder'
  action_config jsonb not null default '{}', -- {"message": "...", "delay_hours": 72}
  is_active boolean default true,
  created_by uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Scheduled messages queue
create table if not exists crm_scheduled_messages (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid references crm_deals(id) on delete cascade,
  tg_chat_id bigint not null,
  message_text text not null,
  send_at timestamptz not null,
  status text default 'pending' check (status in ('pending', 'sent', 'failed', 'cancelled')),
  retry_count int default 0,
  last_error text,
  automation_rule_id uuid references crm_automation_rules(id) on delete set null,
  created_by uuid references auth.users(id),
  created_at timestamptz default now(),
  sent_at timestamptz
);

-- Notification delivery log
create table if not exists crm_notification_log (
  id uuid primary key default gen_random_uuid(),
  notification_type text not null, -- 'stage_change', 'daily_digest', 'broadcast', 'automation', 'scheduled'
  deal_id uuid references crm_deals(id) on delete set null,
  tg_chat_id bigint not null,
  message_preview text, -- first 200 chars
  status text default 'pending' check (status in ('pending', 'sent', 'failed', 'dead_letter')),
  tg_message_id bigint,
  retry_count int default 0,
  max_retries int default 3,
  last_error text,
  automation_rule_id uuid references crm_automation_rules(id) on delete set null,
  scheduled_message_id uuid references crm_scheduled_messages(id) on delete set null,
  created_at timestamptz default now(),
  sent_at timestamptz,
  next_retry_at timestamptz
);

-- Indexes
create index if not exists idx_scheduled_messages_pending
  on crm_scheduled_messages(send_at) where status = 'pending';
create index if not exists idx_notification_log_retry
  on crm_notification_log(next_retry_at) where status in ('pending', 'failed');
create index if not exists idx_notification_log_type_status
  on crm_notification_log(notification_type, status);
create index if not exists idx_automation_rules_trigger
  on crm_automation_rules(trigger_type) where is_active = true;

-- RLS
alter table crm_automation_rules enable row level security;
alter table crm_scheduled_messages enable row level security;
alter table crm_notification_log enable row level security;

create policy "Authenticated users can manage automation rules"
  on crm_automation_rules for all to authenticated using (true) with check (true);
create policy "Authenticated users can manage scheduled messages"
  on crm_scheduled_messages for all to authenticated using (true) with check (true);
create policy "Authenticated users can read notification log"
  on crm_notification_log for all to authenticated using (true) with check (true);
