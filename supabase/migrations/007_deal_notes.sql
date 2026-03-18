-- Deal notes for conversation/timeline
create table if not exists public.crm_deal_notes (
  id uuid default gen_random_uuid() primary key,
  deal_id uuid references public.crm_deals on delete cascade not null,
  text text not null,
  created_by uuid references auth.users on delete set null,
  created_at timestamptz default now()
);

create index if not exists idx_deal_notes_deal on public.crm_deal_notes (deal_id, created_at desc);
