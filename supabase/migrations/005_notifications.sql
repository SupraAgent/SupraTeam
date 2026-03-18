-- Smart notification center
create table if not exists public.crm_notifications (
  id uuid default gen_random_uuid() primary key,
  type text not null check (type in ('tg_message', 'stage_change', 'deal_created', 'deal_assigned', 'mention')),
  deal_id uuid references public.crm_deals on delete cascade,
  contact_id uuid references public.crm_contacts on delete set null,
  tg_group_id uuid references public.tg_groups on delete set null,
  title text not null,
  body text,
  tg_deep_link text,              -- t.me/c/{chat_id}/{message_id}
  tg_sender_name text,
  pipeline_link text,              -- /pipeline?highlight={deal_id}
  is_read boolean default false,
  created_at timestamptz default now()
);

create index if not exists idx_notifications_created on public.crm_notifications (created_at desc);
create index if not exists idx_notifications_deal on public.crm_notifications (deal_id);
create index if not exists idx_notifications_unread on public.crm_notifications (is_read) where is_read = false;
