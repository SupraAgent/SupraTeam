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
ALTER TABLE crm_outreach_step_log
  ADD COLUMN IF NOT EXISTS ab_variant text CHECK (ab_variant IN ('A', 'B'));
