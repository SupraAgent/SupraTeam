-- SupraCRM Foundation Migration
-- Adds CRM tables to the shared Supabase project (alongside SupraVibe tables)
-- All table names prefixed with crm_ or tg_ to avoid collisions

-- Pipeline stages (configurable)
create table if not exists public.pipeline_stages (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  position int not null,
  color text,
  created_at timestamptz default now()
);

-- Seed default 7 stages
insert into public.pipeline_stages (name, position, color) values
  ('Potential Client', 1, '#6366f1'),
  ('Outreach', 2, '#8b5cf6'),
  ('Calendly Sent', 3, '#a855f7'),
  ('Video Call', 4, '#3b82f6'),
  ('Follow Up', 5, '#f59e0b'),
  ('MOU Signed', 6, '#10b981'),
  ('First Check Received', 7, '#0cce6b');

-- Contacts
create table if not exists public.crm_contacts (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  email text,
  phone text,
  telegram_username text,
  telegram_user_id bigint,
  company text,
  title text,
  notes text,
  created_by uuid references auth.users on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Deals (core CRM entity)
create table if not exists public.crm_deals (
  id uuid default gen_random_uuid() primary key,
  deal_name text not null,
  contact_id uuid references public.crm_contacts on delete set null,
  assigned_to uuid references auth.users on delete set null,
  board_type text not null check (board_type in ('BD', 'Marketing', 'Admin')),
  stage_id uuid references public.pipeline_stages on delete set null,
  value numeric,
  probability int check (probability >= 0 and probability <= 100),
  telegram_chat_id bigint,
  telegram_chat_name text,
  telegram_chat_link text,
  stage_changed_at timestamptz default now(),
  created_by uuid references auth.users on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Deal stage change history (for automation triggers)
create table if not exists public.crm_deal_stage_history (
  id uuid default gen_random_uuid() primary key,
  deal_id uuid references public.crm_deals on delete cascade not null,
  from_stage_id uuid references public.pipeline_stages on delete set null,
  to_stage_id uuid references public.pipeline_stages on delete set null,
  changed_by uuid references auth.users on delete set null,
  changed_at timestamptz default now()
);

-- Telegram groups
create table if not exists public.tg_groups (
  id uuid default gen_random_uuid() primary key,
  telegram_group_id bigint unique not null,
  group_name text not null,
  group_type text check (group_type in ('group', 'supergroup', 'channel')),
  group_url text,
  bot_is_admin boolean default false,
  member_count int,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Slugs on TG groups (junction)
create table if not exists public.tg_group_slugs (
  id uuid default gen_random_uuid() primary key,
  group_id uuid references public.tg_groups on delete cascade not null,
  slug text not null,
  created_at timestamptz default now(),
  unique (group_id, slug)
);

-- User-to-slug access
create table if not exists public.crm_user_slug_access (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  slug text not null,
  granted_by uuid references auth.users on delete set null,
  granted_at timestamptz default now(),
  unique (user_id, slug)
);

-- Slug access audit log
create table if not exists public.crm_slug_access_log (
  id uuid default gen_random_uuid() primary key,
  action text not null check (action in ('add_to_groups', 'remove_from_groups')),
  target_user_id uuid references auth.users on delete set null,
  slug text not null,
  groups_affected jsonb,
  performed_by uuid references auth.users on delete set null,
  status text check (status in ('success', 'partial_failure', 'failed')),
  error_log text,
  created_at timestamptz default now()
);

-- Extend shared profiles table with CRM role
alter table public.profiles
  add column if not exists crm_role text
  check (crm_role in ('bd_lead', 'marketing_lead', 'admin_lead'));

-- RLS policies
alter table public.pipeline_stages enable row level security;
create policy "Authenticated users can read stages" on public.pipeline_stages
  for select using (auth.uid() is not null);

alter table public.crm_contacts enable row level security;
create policy "Authenticated users can read contacts" on public.crm_contacts
  for select using (auth.uid() is not null);
create policy "Authenticated users can insert contacts" on public.crm_contacts
  for insert with check (auth.uid() is not null);
create policy "Authenticated users can update contacts" on public.crm_contacts
  for update using (auth.uid() is not null);

alter table public.crm_deals enable row level security;
create policy "Authenticated users can read deals" on public.crm_deals
  for select using (auth.uid() is not null);
create policy "Authenticated users can insert deals" on public.crm_deals
  for insert with check (auth.uid() is not null);
create policy "Authenticated users can update deals" on public.crm_deals
  for update using (auth.uid() is not null);

alter table public.crm_deal_stage_history enable row level security;
create policy "Authenticated users can read stage history" on public.crm_deal_stage_history
  for select using (auth.uid() is not null);
create policy "Authenticated users can insert stage history" on public.crm_deal_stage_history
  for insert with check (auth.uid() is not null);

alter table public.tg_groups enable row level security;
create policy "Authenticated users can read groups" on public.tg_groups
  for select using (auth.uid() is not null);
create policy "Authenticated users can manage groups" on public.tg_groups
  for all using (auth.uid() is not null);

alter table public.tg_group_slugs enable row level security;
create policy "Authenticated users can manage slugs" on public.tg_group_slugs
  for all using (auth.uid() is not null);

alter table public.crm_user_slug_access enable row level security;
create policy "Authenticated users can read slug access" on public.crm_user_slug_access
  for select using (auth.uid() is not null);
create policy "Authenticated users can manage slug access" on public.crm_user_slug_access
  for all using (auth.uid() is not null);

alter table public.crm_slug_access_log enable row level security;
create policy "Authenticated users can read audit log" on public.crm_slug_access_log
  for select using (auth.uid() is not null);
create policy "Authenticated users can insert audit log" on public.crm_slug_access_log
  for insert with check (auth.uid() is not null);

-- Indexes
create index if not exists idx_crm_deals_board_stage on public.crm_deals (board_type, stage_id);
create index if not exists idx_crm_deals_assigned on public.crm_deals (assigned_to);
create index if not exists idx_crm_deals_contact on public.crm_deals (contact_id);
create index if not exists idx_crm_deal_stage_history_deal on public.crm_deal_stage_history (deal_id);
create index if not exists idx_tg_group_slugs_slug on public.tg_group_slugs (slug);
create index if not exists idx_crm_contacts_telegram on public.crm_contacts (telegram_username);
