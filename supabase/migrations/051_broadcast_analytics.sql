-- Stage 3f: Broadcast Analytics — A/B testing, response tracking

-- A/B variant assignment per recipient
ALTER TABLE crm_broadcast_recipients
  ADD COLUMN IF NOT EXISTS variant TEXT CHECK (variant IN ('A', 'B')),
  ADD COLUMN IF NOT EXISTS responded_at TIMESTAMPTZ;

-- A/B variant message on broadcast
ALTER TABLE crm_broadcasts
  ADD COLUMN IF NOT EXISTS variant_b_message TEXT,
  ADD COLUMN IF NOT EXISTS variant_b_parse_mode TEXT;

-- Cached aggregate metrics on broadcast (updated by response tracker)
ALTER TABLE crm_broadcasts
  ADD COLUMN IF NOT EXISTS response_count INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS response_rate NUMERIC(5,2) DEFAULT 0;

-- Index for response tracking cron (find recent broadcasts with untracked responses)
CREATE INDEX IF NOT EXISTS idx_broadcast_recipients_response
  ON crm_broadcast_recipients(broadcast_id, sent_at)
  WHERE status = 'sent' AND responded_at IS NULL;

-- Index for best send time analysis
CREATE INDEX IF NOT EXISTS idx_broadcasts_sent_hour
  ON crm_broadcasts(sent_at);
