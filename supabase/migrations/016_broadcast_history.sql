-- Migration 016: Broadcast history, scheduling, and improved tracking

create table if not exists crm_broadcasts (
  id uuid primary key default gen_random_uuid(),
  message_text text not null,
  message_html text,           -- rendered HTML version
  sender_id uuid references auth.users(id),
  sender_name text,
  slug_filter text,            -- null = manual selection
  group_count int default 0,
  sent_count int default 0,
  failed_count int default 0,
  status text default 'sent' check (status in ('draft', 'scheduled', 'sending', 'sent', 'failed', 'cancelled')),
  scheduled_at timestamptz,    -- null = sent immediately
  sent_at timestamptz,
  created_at timestamptz default now()
);

-- Junction: which groups received each broadcast
create table if not exists crm_broadcast_recipients (
  id uuid primary key default gen_random_uuid(),
  broadcast_id uuid not null references crm_broadcasts(id) on delete cascade,
  tg_group_id uuid references tg_groups(id) on delete set null,
  group_name text not null,
  telegram_group_id bigint not null,
  status text default 'pending' check (status in ('pending', 'sent', 'failed')),
  tg_message_id bigint,
  error text,
  sent_at timestamptz
);

create index if not exists idx_broadcasts_status on crm_broadcasts(status);
create index if not exists idx_broadcasts_scheduled on crm_broadcasts(scheduled_at) where status = 'scheduled';
create index if not exists idx_broadcast_recipients_broadcast on crm_broadcast_recipients(broadcast_id);

alter table crm_broadcasts enable row level security;
alter table crm_broadcast_recipients enable row level security;

create policy "Authenticated users can manage broadcasts"
  on crm_broadcasts for all to authenticated using (true) with check (true);
create policy "Authenticated users can manage broadcast recipients"
  on crm_broadcast_recipients for all to authenticated using (true) with check (true);
