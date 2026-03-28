-- 058: Deal Influence Network — many-to-many deal participants
-- Phase B of Knowledge Graph upgrade

create table if not exists public.crm_deal_participants (
  id uuid default gen_random_uuid() primary key,
  deal_id uuid not null references public.crm_deals on delete cascade,
  contact_id uuid not null references public.crm_contacts on delete cascade,
  role text not null default 'involved' check (role in (
    'primary', 'champion', 'influencer', 'blocker', 'decision_maker', 'involved'
  )),
  influence_score numeric default 0,  -- computed 0-100
  added_by uuid references auth.users on delete set null,
  added_at timestamptz default now(),
  notes text,
  unique(deal_id, contact_id)
);

create index idx_deal_participants_deal on crm_deal_participants(deal_id);
create index idx_deal_participants_contact on crm_deal_participants(contact_id);
create index idx_deal_participants_role on crm_deal_participants(role);

-- RLS
alter table crm_deal_participants enable row level security;
create policy "Authenticated users can manage deal participants"
  on crm_deal_participants for all to authenticated using (true) with check (true);

-- Backfill: insert existing primary contacts from crm_deals
insert into crm_deal_participants (deal_id, contact_id, role)
select id, contact_id, 'primary'
from crm_deals
where contact_id is not null
on conflict (deal_id, contact_id) do nothing;
