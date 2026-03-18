-- Smart highlight system: tracks which deals/contacts have active TG messages
-- Highlights appear on pipeline cards and contact list
-- Auto-clears when someone from the team responds, or after 24h
create table if not exists public.crm_highlights (
  id uuid default gen_random_uuid() primary key,
  deal_id uuid references public.crm_deals on delete cascade,
  contact_id uuid references public.crm_contacts on delete cascade,
  tg_group_id uuid references public.tg_groups on delete cascade,
  sender_name text,
  message_preview text,
  tg_deep_link text,
  highlight_type text not null check (highlight_type in ('tg_message', 'mention')),
  is_active boolean default true,
  created_at timestamptz default now(),
  cleared_at timestamptz,
  cleared_by text  -- 'response' or 'expired' or 'manual'
);

create index if not exists idx_highlights_active on public.crm_highlights (is_active) where is_active = true;
create index if not exists idx_highlights_deal on public.crm_highlights (deal_id) where is_active = true;
create index if not exists idx_highlights_contact on public.crm_highlights (contact_id) where is_active = true;

-- Also add tg_group_id to deals for direct linking
alter table public.crm_deals
  add column if not exists tg_group_id uuid references public.tg_groups on delete set null;
