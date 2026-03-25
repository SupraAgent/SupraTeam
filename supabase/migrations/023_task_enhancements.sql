-- Add snooze, assigned_to, and manual task support to deal reminders
alter table public.crm_deal_reminders
  add column if not exists snoozed_until timestamptz,
  add column if not exists assigned_to uuid references auth.users(id) on delete set null,
  add column if not exists created_by uuid references auth.users(id) on delete set null;

-- Allow 'manual' as a reminder_type
alter table public.crm_deal_reminders
  drop constraint if exists crm_deal_reminders_reminder_type_check;

alter table public.crm_deal_reminders
  add constraint crm_deal_reminders_reminder_type_check
  check (reminder_type in ('follow_up', 'stale', 'stage_suggestion', 'escalation', 'manual'));

-- Make deal_id nullable so we can create tasks not tied to a deal
alter table public.crm_deal_reminders
  alter column deal_id drop not null;

-- Index for snoozed reminders
create index if not exists idx_deal_reminders_snoozed
  on public.crm_deal_reminders (snoozed_until)
  where snoozed_until is not null and is_dismissed = false;
