-- Group member tracking: per-member engagement, roles, and activity
create table if not exists public.tg_group_members (
  id uuid default gen_random_uuid() primary key,
  group_id uuid not null references public.tg_groups on delete cascade,
  telegram_user_id bigint not null,
  display_name text,
  username text,
  role text not null default 'member', -- creator, administrator, member, restricted, left, banned
  message_count_7d int not null default 0,
  message_count_30d int not null default 0,
  last_message_at timestamptz,
  first_seen_at timestamptz default now(),
  engagement_tier text not null default 'new', -- champion, active, casual, lurker, dormant, new
  is_flagged boolean not null default false, -- high-value participant flag
  flag_reason text,
  crm_contact_id uuid references public.crm_contacts on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(group_id, telegram_user_id)
);

create index if not exists idx_group_members_group on public.tg_group_members (group_id);
create index if not exists idx_group_members_engagement on public.tg_group_members (engagement_tier);
create index if not exists idx_group_members_flagged on public.tg_group_members (is_flagged) where is_flagged = true;

-- Member activity log for join/leave tracking
create table if not exists public.tg_group_member_events (
  id uuid default gen_random_uuid() primary key,
  group_id uuid not null references public.tg_groups on delete cascade,
  telegram_user_id bigint not null,
  event_type text not null, -- joined, left, promoted, demoted, banned
  metadata jsonb default '{}',
  created_at timestamptz default now()
);

create index if not exists idx_member_events_group on public.tg_group_member_events (group_id, created_at desc);
