-- Add assigned_at column to track when a deal was assigned
-- Used to show "New Assignment" badge on deal cards for recently assigned deals
ALTER TABLE crm_deals ADD COLUMN IF NOT EXISTS assigned_at timestamptz;

-- Backfill existing assigned deals with updated_at as a reasonable approximation
UPDATE crm_deals SET assigned_at = updated_at WHERE assigned_to IS NOT NULL AND assigned_at IS NULL;

-- Index for efficient filtering of recent assignments per user
CREATE INDEX IF NOT EXISTS idx_crm_deals_assigned_at ON crm_deals (assigned_to, assigned_at DESC) WHERE assigned_to IS NOT NULL;
