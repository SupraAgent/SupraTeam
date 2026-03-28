-- Group custom fields (replicates crm_deal_fields pattern for TG groups)
create table if not exists public.crm_group_fields (
  id uuid default gen_random_uuid() primary key,
  field_name text not null,
  label text not null,
  field_type text not null check (field_type in ('text', 'number', 'select', 'date', 'url', 'textarea')),
  options jsonb,
  required boolean default false,
  position int not null default 0,
  created_at timestamptz default now()
);

create table if not exists public.crm_group_field_values (
  id uuid default gen_random_uuid() primary key,
  group_id uuid references public.tg_groups on delete cascade not null,
  field_id uuid references public.crm_group_fields on delete cascade not null,
  value text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (group_id, field_id)
);

-- RLS
alter table public.crm_group_fields enable row level security;
create policy "Authenticated users can read group fields" on public.crm_group_fields
  for select using (auth.uid() is not null);
create policy "Authenticated users can manage group fields" on public.crm_group_fields
  for all using (auth.uid() is not null);

alter table public.crm_group_field_values enable row level security;
create policy "Authenticated users can read group field values" on public.crm_group_field_values
  for select using (auth.uid() is not null);
create policy "Authenticated users can manage group field values" on public.crm_group_field_values
  for all using (auth.uid() is not null);

-- Indexes
create index if not exists idx_group_fields_position on public.crm_group_fields (position);
create index if not exists idx_group_field_values_group on public.crm_group_field_values (group_id);

-- API keys table for public REST API
create table if not exists public.crm_api_keys (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  key_hash text not null,
  key_prefix text not null,
  scopes text[] not null default '{"read"}',
  is_active boolean default true,
  last_used_at timestamptz,
  request_count int default 0,
  created_by uuid references auth.users on delete cascade not null,
  created_at timestamptz default now(),
  expires_at timestamptz
);

alter table public.crm_api_keys enable row level security;
create policy "Authenticated users can read api keys" on public.crm_api_keys
  for select using (auth.uid() is not null);
create policy "Authenticated users can manage api keys" on public.crm_api_keys
  for all using (auth.uid() is not null);

create index if not exists idx_api_keys_hash on public.crm_api_keys (key_hash) where is_active = true;
