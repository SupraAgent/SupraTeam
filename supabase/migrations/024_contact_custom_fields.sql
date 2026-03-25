-- Custom fields for contacts (mirrors crm_deal_fields pattern)
create table if not exists public.crm_contact_fields (
  id uuid default gen_random_uuid() primary key,
  field_name text not null,
  label text not null,
  field_type text not null check (field_type in ('text', 'number', 'select', 'date', 'url', 'textarea')),
  options jsonb,
  required boolean default false,
  position int not null default 0,
  created_at timestamptz default now()
);

create table if not exists public.crm_contact_field_values (
  id uuid default gen_random_uuid() primary key,
  contact_id uuid references public.crm_contacts on delete cascade not null,
  field_id uuid references public.crm_contact_fields on delete cascade not null,
  value text not null,
  unique (contact_id, field_id)
);

create index if not exists idx_contact_field_values_contact on public.crm_contact_field_values (contact_id);
