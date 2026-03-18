-- Add telegram_id to profiles for Telegram login
alter table public.profiles
  add column if not exists telegram_id bigint unique;

-- Index for looking up profiles by telegram_id
create index if not exists idx_profiles_telegram_id
  on public.profiles (telegram_id)
  where telegram_id is not null;
