-- Add notified_at to track which stage changes have been sent to Telegram
alter table public.crm_deal_stage_history
  add column if not exists notified_at timestamptz;

-- Index for polling unnotified changes
create index if not exists idx_stage_history_unnotified
  on public.crm_deal_stage_history (notified_at)
  where notified_at is null;
