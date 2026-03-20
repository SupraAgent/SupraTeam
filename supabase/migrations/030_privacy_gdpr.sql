-- Privacy & GDPR compliance: data retention policies, deletion requests, consent tracking

-- Data retention policies
create table if not exists public.crm_data_retention_policies (
  id uuid default gen_random_uuid() primary key,
  data_type text not null unique, -- 'messages', 'audit_logs', 'tracking_events', 'webhook_deliveries', 'ai_conversations'
  retention_days int not null default 365,
  auto_purge boolean not null default false,
  last_purged_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Default retention policies
insert into public.crm_data_retention_policies (data_type, retention_days, auto_purge) values
  ('messages', 90, false),
  ('audit_logs', 365, false),
  ('tracking_events', 90, false),
  ('webhook_deliveries', 30, true),
  ('ai_conversations', 180, false),
  ('outreach_step_logs', 90, false)
on conflict (data_type) do nothing;

-- GDPR data deletion requests
create table if not exists public.crm_data_deletion_requests (
  id uuid default gen_random_uuid() primary key,
  requested_by uuid references auth.users(id) on delete set null,
  target_type text not null, -- 'contact', 'user_data', 'all_personal'
  target_id text, -- contact ID if targeting a specific contact
  status text not null default 'pending', -- pending, processing, completed, failed
  scope jsonb not null default '{}', -- which data categories to delete
  completed_at timestamptz,
  error_message text,
  created_at timestamptz default now()
);

-- Consent records
create table if not exists public.crm_consent_records (
  id uuid default gen_random_uuid() primary key,
  contact_id uuid references public.crm_contacts(id) on delete cascade,
  consent_type text not null, -- 'data_processing', 'marketing', 'profiling'
  granted boolean not null default false,
  granted_at timestamptz,
  revoked_at timestamptz,
  source text, -- 'manual', 'form', 'import'
  notes text,
  recorded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now()
);

create index if not exists idx_consent_contact on public.crm_consent_records (contact_id, consent_type);
create index if not exists idx_deletion_requests_status on public.crm_data_deletion_requests (status);
