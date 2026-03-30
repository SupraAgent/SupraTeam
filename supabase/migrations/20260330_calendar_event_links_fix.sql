-- Fix #23: Prevent orphaned rows in crm_calendar_event_links
-- Change ON DELETE SET NULL to ON DELETE CASCADE for deal_id and contact_id
-- Add CHECK constraint to ensure at least one link target exists

-- Drop existing foreign key constraints
ALTER TABLE crm_calendar_event_links
  DROP CONSTRAINT IF EXISTS crm_calendar_event_links_deal_id_fkey;

ALTER TABLE crm_calendar_event_links
  DROP CONSTRAINT IF EXISTS crm_calendar_event_links_contact_id_fkey;

-- Re-add with ON DELETE CASCADE
ALTER TABLE crm_calendar_event_links
  ADD CONSTRAINT crm_calendar_event_links_deal_id_fkey
    FOREIGN KEY (deal_id) REFERENCES crm_deals(id) ON DELETE CASCADE;

ALTER TABLE crm_calendar_event_links
  ADD CONSTRAINT crm_calendar_event_links_contact_id_fkey
    FOREIGN KEY (contact_id) REFERENCES crm_contacts(id) ON DELETE CASCADE;

-- Ensure at least one of deal_id or contact_id is set
ALTER TABLE crm_calendar_event_links
  ADD CONSTRAINT chk_event_link_has_target
    CHECK (deal_id IS NOT NULL OR contact_id IS NOT NULL);

-- Clean up any existing orphaned rows (both null)
DELETE FROM crm_calendar_event_links
  WHERE deal_id IS NULL AND contact_id IS NULL;

-- Fix #28: Add unique index on nonce for TOCTOU protection
CREATE UNIQUE INDEX IF NOT EXISTS idx_audit_log_cal_oauth_nonce
  ON crm_email_audit_log (((metadata->>'nonce')))
  WHERE action = 'cal_oauth_nonce_consumed';
