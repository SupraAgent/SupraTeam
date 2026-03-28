-- Track response times on highlights and awaiting-response state on deals

-- Response tracking on crm_highlights
ALTER TABLE crm_highlights
  ADD COLUMN IF NOT EXISTS responded_at timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS response_time_ms bigint DEFAULT NULL;

COMMENT ON COLUMN crm_highlights.responded_at IS 'When a team member responded to this highlight';
COMMENT ON COLUMN crm_highlights.response_time_ms IS 'Milliseconds between highlight creation and team response';

-- Awaiting response flag on deals
ALTER TABLE crm_deals
  ADD COLUMN IF NOT EXISTS awaiting_response_since timestamptz DEFAULT NULL;

COMMENT ON COLUMN crm_deals.awaiting_response_since IS 'Set when external TG message creates a highlight, cleared when team responds';

-- Index for fast lookup of deals awaiting response
CREATE INDEX IF NOT EXISTS idx_deals_awaiting_response
  ON crm_deals (awaiting_response_since)
  WHERE awaiting_response_since IS NOT NULL;
