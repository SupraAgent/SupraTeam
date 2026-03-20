-- Contact enrichment: lifecycle stages, source tracking, duplicate detection
-- Migration 020

-- Add lifecycle stage to contacts
ALTER TABLE crm_contacts
  ADD COLUMN IF NOT EXISTS lifecycle_stage text DEFAULT 'prospect'
    CHECK (lifecycle_stage IN ('prospect', 'lead', 'opportunity', 'customer', 'churned', 'inactive')),
  ADD COLUMN IF NOT EXISTS lifecycle_changed_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS source text DEFAULT 'manual'
    CHECK (source IN ('manual', 'telegram_import', 'telegram_bot', 'csv_import', 'referral', 'event', 'inbound', 'outbound')),
  ADD COLUMN IF NOT EXISTS last_activity_at timestamptz,
  ADD COLUMN IF NOT EXISTS quality_score int DEFAULT 0
    CHECK (quality_score BETWEEN 0 AND 100);

-- Index for lifecycle filtering
CREATE INDEX IF NOT EXISTS idx_contacts_lifecycle ON crm_contacts(lifecycle_stage);
CREATE INDEX IF NOT EXISTS idx_contacts_source ON crm_contacts(source);
CREATE INDEX IF NOT EXISTS idx_contacts_quality ON crm_contacts(quality_score DESC);

-- Duplicate detection: composite index for fuzzy matching
CREATE INDEX IF NOT EXISTS idx_contacts_name_lower ON crm_contacts(lower(name));
CREATE INDEX IF NOT EXISTS idx_contacts_email_lower ON crm_contacts(lower(email)) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_tg_lower ON crm_contacts(lower(telegram_username)) WHERE telegram_username IS NOT NULL;
