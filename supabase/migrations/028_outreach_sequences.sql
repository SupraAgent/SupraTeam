-- Outreach sequences: multi-step automated messaging campaigns
create table if not exists public.crm_outreach_sequences (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  description text,
  status text not null default 'draft', -- draft, active, paused, completed
  board_type text, -- optional filter
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Steps within a sequence
create table if not exists public.crm_outreach_steps (
  id uuid default gen_random_uuid() primary key,
  sequence_id uuid not null references public.crm_outreach_sequences on delete cascade,
  step_number int not null,
  delay_hours numeric not null default 24,
  message_template text not null,
  step_type text not null default 'message', -- message, wait, condition
  condition_config jsonb default '{}', -- for condition steps: { check: "reply_received", action: "skip_rest" }
  created_at timestamptz default now(),
  unique(sequence_id, step_number)
);

-- Enrollments: deals/contacts enrolled in a sequence
create table if not exists public.crm_outreach_enrollments (
  id uuid default gen_random_uuid() primary key,
  sequence_id uuid not null references public.crm_outreach_sequences on delete cascade,
  deal_id uuid references public.crm_deals on delete set null,
  contact_id uuid references public.crm_contacts on delete set null,
  tg_chat_id bigint, -- target chat for messages
  current_step int not null default 1,
  status text not null default 'active', -- active, completed, paused, replied, bounced
  next_send_at timestamptz,
  enrolled_at timestamptz default now(),
  completed_at timestamptz,
  enrolled_by uuid references auth.users(id) on delete set null
);

create index if not exists idx_outreach_enrollments_seq on public.crm_outreach_enrollments (sequence_id);
create index if not exists idx_outreach_enrollments_status on public.crm_outreach_enrollments (status, next_send_at)
  where status = 'active';
create index if not exists idx_outreach_enrollments_deal on public.crm_outreach_enrollments (deal_id);

-- Step execution log
create table if not exists public.crm_outreach_step_log (
  id uuid default gen_random_uuid() primary key,
  enrollment_id uuid not null references public.crm_outreach_enrollments on delete cascade,
  step_number int not null,
  status text not null, -- sent, failed, skipped
  error text,
  sent_at timestamptz default now()
);

create index if not exists idx_outreach_step_log_enrollment on public.crm_outreach_step_log (enrollment_id);
