-- Notification preferences per user
create table if not exists crm_notification_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  muted_types text[] default '{}',
  quiet_hours_enabled boolean default false,
  quiet_hours_start time,
  quiet_hours_end time,
  quiet_hours_tz text default 'UTC',
  digest_frequency text default 'realtime' check (digest_frequency in ('realtime', 'daily', 'weekly', 'off')),
  digest_day int,
  digest_hour int default 9,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id)
);

-- Extend notifications with status, snooze, grouping
alter table crm_notifications
  add column if not exists status text default 'active'
    check (status in ('active', 'snoozed', 'dismissed', 'handled')),
  add column if not exists snoozed_until timestamptz,
  add column if not exists group_key text,
  add column if not exists grouped_count int default 1;

-- Extend tg_groups with message history for sparklines and member count
alter table tg_groups
  add column if not exists auto_archive_enabled boolean default true,
  add column if not exists message_history jsonb default '[]',
  add column if not exists member_count int;

-- Indexes
create index if not exists idx_notifications_group_key on crm_notifications(group_key) where status = 'active';
create index if not exists idx_notifications_snoozed on crm_notifications(snoozed_until) where status = 'snoozed';
create index if not exists idx_notif_prefs_user on crm_notification_preferences(user_id);
