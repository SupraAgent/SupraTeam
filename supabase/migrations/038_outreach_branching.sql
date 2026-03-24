-- Migration 038: Outreach sequence branching support
-- Adds condition routing and reply tracking

-- Branching fields on steps
ALTER TABLE crm_outreach_steps
  ADD COLUMN IF NOT EXISTS on_true_step INT,         -- step_number to jump to if condition met
  ADD COLUMN IF NOT EXISTS on_false_step INT,        -- step_number to jump to if condition not met
  ADD COLUMN IF NOT EXISTS condition_type TEXT;       -- 'reply_received', 'no_reply_timeout'

-- Reply tracking on enrollments
ALTER TABLE crm_outreach_enrollments
  ADD COLUMN IF NOT EXISTS last_reply_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reply_count INT DEFAULT 0;

-- Index for reply detection (active enrollments by chat)
CREATE INDEX IF NOT EXISTS idx_outreach_enrollments_chat_active
  ON crm_outreach_enrollments(tg_chat_id, status)
  WHERE status = 'active';

-- Index for worker polling (due enrollments)
CREATE INDEX IF NOT EXISTS idx_outreach_enrollments_next_send
  ON crm_outreach_enrollments(next_send_at)
  WHERE status = 'active';
