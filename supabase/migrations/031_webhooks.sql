-- Webhook endpoints for external integrations (CRM sync, Zapier, etc.)
create table if not exists public.crm_webhooks (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  url text not null,
  secret text, -- HMAC secret for signature verification
  events text[] not null default '{}', -- deal.created, deal.updated, deal.stage_changed, contact.created, contact.updated
  is_active boolean not null default true,
  headers jsonb default '{}', -- custom headers to send
  last_triggered_at timestamptz,
  last_status int, -- HTTP status of last delivery
  failure_count int not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Webhook delivery log
create table if not exists public.crm_webhook_deliveries (
  id uuid default gen_random_uuid() primary key,
  webhook_id uuid not null references public.crm_webhooks on delete cascade,
  event_type text not null,
  payload jsonb not null,
  response_status int,
  response_body text,
  duration_ms int,
  success boolean not null default false,
  created_at timestamptz default now()
);

create index if not exists idx_webhook_deliveries_webhook on public.crm_webhook_deliveries (webhook_id, created_at desc);
create index if not exists idx_webhooks_active on public.crm_webhooks (is_active) where is_active = true;
