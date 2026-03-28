-- Stage 4: Intelligence Layer — schema additions
-- 1. Highlight auto-triage columns (AI categorization)
-- 2. Indexes for analytics queries

-- Add triage columns to highlights
ALTER TABLE crm_highlights ADD COLUMN IF NOT EXISTS triage_category TEXT;
ALTER TABLE crm_highlights ADD COLUMN IF NOT EXISTS triage_urgency TEXT CHECK (triage_urgency IN ('critical', 'high', 'medium', 'low'));
ALTER TABLE crm_highlights ADD COLUMN IF NOT EXISTS triage_summary TEXT;
ALTER TABLE crm_highlights ADD COLUMN IF NOT EXISTS triaged_at TIMESTAMPTZ;

-- Index for untriaged active highlights
CREATE INDEX IF NOT EXISTS idx_highlights_untriaged
  ON crm_highlights (is_active, triaged_at) WHERE is_active = true AND triaged_at IS NULL;
