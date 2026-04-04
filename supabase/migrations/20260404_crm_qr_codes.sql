-- QR Code Lead Capture
-- Stores QR code campaigns that generate Telegram bot deep links for lead capture.

create table if not exists crm_qr_codes (
  id          uuid primary key default gen_random_uuid(),
  short_code  text not null unique,
  name        text not null,
  stage_id    uuid not null references pipeline_stages(id) on delete restrict,
  board_type  text not null default 'BD' check (board_type in ('BD', 'Marketing', 'Admin', 'Applications')),
  created_by  uuid not null references auth.users(id) on delete cascade,
  scan_count  integer not null default 0,
  lead_count  integer not null default 0,
  created_at  timestamptz not null default now()
);

-- Index for fast lookup by short_code (bot capture endpoint)
create index if not exists idx_crm_qr_codes_short_code on crm_qr_codes(short_code);

-- RLS
alter table crm_qr_codes enable row level security;

-- Authenticated users can view all QR codes (team visibility)
create policy "qr_codes_select" on crm_qr_codes
  for select to authenticated
  using (true);

-- Users can insert their own QR codes
create policy "qr_codes_insert" on crm_qr_codes
  for insert to authenticated
  with check (auth.uid() = created_by);

-- Users can update their own QR codes
create policy "qr_codes_update" on crm_qr_codes
  for update to authenticated
  using (auth.uid() = created_by);

-- Users can delete their own QR codes
create policy "qr_codes_delete" on crm_qr_codes
  for delete to authenticated
  using (auth.uid() = created_by);
