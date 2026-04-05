-- Add reference_code column to crm_deals for application status tracking
alter table public.crm_deals add column if not exists reference_code text;

-- Unique index on reference_code (only non-null values)
create unique index if not exists idx_crm_deals_reference_code
  on public.crm_deals (reference_code)
  where reference_code is not null;
