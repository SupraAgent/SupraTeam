-- Custom deal fields (dynamic form schema)
-- Each row defines a field that appears in the Create Deal form
create table if not exists public.crm_deal_fields (
  id uuid default gen_random_uuid() primary key,
  field_name text not null,           -- internal key (e.g. "campaign_name")
  label text not null,                -- display label (e.g. "Campaign Name")
  field_type text not null check (field_type in ('text', 'number', 'select', 'date', 'url', 'textarea')),
  options jsonb,                      -- for select type: ["Option A", "Option B"]
  required boolean default false,
  board_type text check (board_type in ('BD', 'Marketing', 'Admin')),  -- null = all boards
  position int not null default 0,
  created_at timestamptz default now()
);

-- Store custom field values per deal
create table if not exists public.crm_deal_field_values (
  id uuid default gen_random_uuid() primary key,
  deal_id uuid references public.crm_deals on delete cascade not null,
  field_id uuid references public.crm_deal_fields on delete cascade not null,
  value text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (deal_id, field_id)
);

-- RLS
alter table public.crm_deal_fields enable row level security;
create policy "Authenticated users can read deal fields" on public.crm_deal_fields
  for select using (auth.uid() is not null);
create policy "Authenticated users can manage deal fields" on public.crm_deal_fields
  for all using (auth.uid() is not null);

alter table public.crm_deal_field_values enable row level security;
create policy "Authenticated users can read field values" on public.crm_deal_field_values
  for select using (auth.uid() is not null);
create policy "Authenticated users can manage field values" on public.crm_deal_field_values
  for all using (auth.uid() is not null);

-- Indexes
create index if not exists idx_deal_fields_board on public.crm_deal_fields (board_type, position);
create index if not exists idx_deal_field_values_deal on public.crm_deal_field_values (deal_id);
