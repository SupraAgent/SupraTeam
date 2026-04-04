-- QR Code Lead Capture: event booth QR -> TMA apply flow -> auto-create deal.
-- Scan QR at booth, opens Telegram bot, starts qualification chat.

-- ── QR Codes ──────────────────────────────────────────────────
create table if not exists crm_qr_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) > 0 and length(name) <= 200),
  campaign text,
  source text,
  pipeline_stage_id uuid references pipeline_stages(id) on delete set null,
  assigned_to uuid references auth.users(id) on delete set null,
  custom_fields jsonb default '{}'::jsonb,
  redirect_url text,
  scan_count int not null default 0,
  is_active boolean not null default true,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table crm_qr_codes enable row level security;

create policy "Users manage own qr codes"
  on crm_qr_codes for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index idx_crm_qr_codes_user on crm_qr_codes(user_id);
create index idx_crm_qr_codes_active on crm_qr_codes(is_active) where is_active = true;

create or replace function trg_crm_qr_codes_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger set_crm_qr_codes_updated_at
  before update on crm_qr_codes
  for each row execute function trg_crm_qr_codes_updated_at();

-- ── QR Scans ──────────────────────────────────────────────────
create table if not exists crm_qr_scans (
  id uuid primary key default gen_random_uuid(),
  qr_code_id uuid not null references crm_qr_codes(id) on delete cascade,
  telegram_user_id bigint,
  scanned_at timestamptz not null default now(),
  ip_hint text,
  converted_to_deal_id uuid references crm_deals(id) on delete set null
);

alter table crm_qr_scans enable row level security;

-- Users can read scans for their own QR codes
create policy "Users read own qr scans"
  on crm_qr_scans for select
  using (
    exists (
      select 1 from crm_qr_codes
      where crm_qr_codes.id = crm_qr_scans.qr_code_id
        and crm_qr_codes.user_id = auth.uid()
    )
  );

-- Service role inserts scans (bot handler uses admin client)
create policy "Service role inserts qr scans"
  on crm_qr_scans for insert
  with check (true);

create index idx_crm_qr_scans_qr_code on crm_qr_scans(qr_code_id);
create index idx_crm_qr_scans_telegram_user on crm_qr_scans(telegram_user_id);
