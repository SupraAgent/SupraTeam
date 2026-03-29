-- Migration 062: Contact enrichment (X/wallet) + A/B testing on outreach sequences
-- Part of Apollo-inspired feature set

-- ============================================================
-- 1. Contact enrichment: X handle, wallet address, on-chain score
-- ============================================================

ALTER TABLE crm_contacts
  ADD COLUMN IF NOT EXISTS x_handle text,
  ADD COLUMN IF NOT EXISTS wallet_address text,
  ADD COLUMN IF NOT EXISTS wallet_chain text DEFAULT 'supra',
  ADD COLUMN IF NOT EXISTS on_chain_score integer DEFAULT 0 CHECK (on_chain_score >= 0 AND on_chain_score <= 100);

-- Index for X handle lookups
CREATE INDEX IF NOT EXISTS idx_contacts_x_handle ON crm_contacts (lower(x_handle)) WHERE x_handle IS NOT NULL;

-- Index for wallet lookups
CREATE INDEX IF NOT EXISTS idx_contacts_wallet ON crm_contacts (lower(wallet_address)) WHERE wallet_address IS NOT NULL;

-- ============================================================
-- 2. A/B testing: variant B template on outreach steps
-- ============================================================

ALTER TABLE crm_outreach_steps
  ADD COLUMN IF NOT EXISTS variant_b_template text;

-- Add variant tracking to step log for per-variant analytics
-- CHECK constraint added at bottom of migration to include all variants (A, B, C)
ALTER TABLE crm_outreach_step_log
  ADD COLUMN IF NOT EXISTS ab_variant text;

-- Stage 1b: Configurable split ratio for message-level A/B
ALTER TABLE crm_outreach_steps
  ADD COLUMN IF NOT EXISTS ab_split_pct integer DEFAULT 50 CHECK (ab_split_pct >= 1 AND ab_split_pct <= 99);

-- Stage 5a: X/Twitter enrichment data
ALTER TABLE crm_contacts
  ADD COLUMN IF NOT EXISTS x_bio text,
  ADD COLUMN IF NOT EXISTS x_followers integer,
  ADD COLUMN IF NOT EXISTS x_last_tweet_at timestamptz,
  ADD COLUMN IF NOT EXISTS enriched_at timestamptz,
  ADD COLUMN IF NOT EXISTS enrichment_source text;

-- Stage 5c: Enrichment audit log
CREATE TABLE IF NOT EXISTS crm_enrichment_log (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id uuid NOT NULL REFERENCES crm_contacts(id) ON DELETE CASCADE,
  field_name text NOT NULL,
  old_value text,
  new_value text,
  source text NOT NULL CHECK (source IN ('manual', 'x_api', 'onchain_rpc', 'csv_import', 'ai_enrichment', 'bulk_import')),
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_enrichment_log_contact ON crm_enrichment_log (contact_id);

-- Stage 3c: Tone/persona on sequences
ALTER TABLE crm_outreach_sequences
  ADD COLUMN IF NOT EXISTS tone text DEFAULT 'professional' CHECK (tone IN ('professional', 'casual', 'web3_native', 'formal'));

-- Stage 4b: Auto-recommendations alerts
CREATE TABLE IF NOT EXISTS crm_outreach_alerts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  sequence_id uuid NOT NULL REFERENCES crm_outreach_sequences(id) ON DELETE CASCADE,
  alert_type text NOT NULL CHECK (alert_type IN ('low_reply_rate', 'high_drop_off', 'stale_sequence')),
  message text NOT NULL,
  dismissed boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Stage 2a: Track auto-winner events
ALTER TABLE crm_outreach_step_log
  ADD COLUMN IF NOT EXISTS metadata jsonb;

-- Stage 2c: Multi-variant testing (A/B/C)
ALTER TABLE crm_outreach_steps
  ADD COLUMN IF NOT EXISTS variant_c_template text;

-- Update CHECK constraint on ab_variant to include 'C'
ALTER TABLE crm_outreach_step_log
  DROP CONSTRAINT IF EXISTS crm_outreach_step_log_ab_variant_check;
ALTER TABLE crm_outreach_step_log
  ADD CONSTRAINT crm_outreach_step_log_ab_variant_check CHECK (ab_variant IN ('A', 'B', 'C'));

-- Stage 2d: A/B timing test
ALTER TABLE crm_outreach_steps
  ADD COLUMN IF NOT EXISTS variant_b_delay_hours integer;
