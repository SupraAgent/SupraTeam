-- 057: Relationship Intelligence — explicit contact relationships + helper function
-- Phase A of Knowledge Graph upgrade

-- Explicit contact-to-contact relationships
create table if not exists public.crm_contact_relationships (
  id uuid default gen_random_uuid() primary key,
  contact_a_id uuid not null references public.crm_contacts on delete cascade,
  contact_b_id uuid not null references public.crm_contacts on delete cascade,
  relationship_type text not null check (relationship_type in (
    'colleague', 'reports_to', 'manages', 'introduced_by', 'partner', 'advisor', 'investor', 'custom'
  )),
  label text,                     -- free-text label for 'custom' type
  strength numeric default 0,     -- computed score 0-100
  notes text,
  created_by uuid references auth.users on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint no_self_relationship check (contact_a_id <> contact_b_id)
);

-- Bidirectional unique: prevent both (A,B) and (B,A)
create unique index idx_contact_rel_pair on crm_contact_relationships(
  least(contact_a_id, contact_b_id), greatest(contact_a_id, contact_b_id)
);

create index idx_contact_rel_a on crm_contact_relationships(contact_a_id);
create index idx_contact_rel_b on crm_contact_relationships(contact_b_id);

-- RLS
alter table crm_contact_relationships enable row level security;
create policy "Authenticated users can manage contact relationships"
  on crm_contact_relationships for all to authenticated using (true) with check (true);

-- Helper function: return contact-group edges from tg_group_members
create or replace function get_contact_group_edges()
returns table(contact_id uuid, group_id uuid, engagement_tier text, message_count_30d int)
language sql stable
as $$
  select crm_contact_id, group_id, engagement_tier, message_count_30d
  from tg_group_members
  where crm_contact_id is not null;
$$;
