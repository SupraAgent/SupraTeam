-- 056: Outreach Branching V2
-- Adds A/B split support, step labels, enhanced analytics tracking

-- Step labels for visual builder
ALTER TABLE crm_outreach_steps ADD COLUMN IF NOT EXISTS step_label text;

-- A/B split support
ALTER TABLE crm_outreach_steps ADD COLUMN IF NOT EXISTS split_percentage int;  -- 0-100 for A/B splits

-- Track which step_id was executed (for branching analytics)
ALTER TABLE crm_outreach_step_log ADD COLUMN IF NOT EXISTS step_id uuid REFERENCES crm_outreach_steps(id) ON DELETE SET NULL;

-- Track A/B variant assignment
ALTER TABLE crm_outreach_enrollments ADD COLUMN IF NOT EXISTS ab_variant text;  -- 'A' or 'B'

-- New condition types
COMMENT ON COLUMN crm_outreach_steps.condition_type IS 'reply_received | no_reply_timeout | engagement_score | deal_stage | message_keyword | days_since_enroll | ab_split';

-- Index for step analytics queries
CREATE INDEX IF NOT EXISTS idx_step_log_step_id ON crm_outreach_step_log (step_id);

-- RPC: Get per-step analytics for a sequence
CREATE OR REPLACE FUNCTION get_sequence_step_analytics(p_sequence_id uuid)
RETURNS TABLE(
  step_id uuid,
  step_number int,
  sent_count bigint,
  failed_count bigint,
  skipped_count bigint,
  reply_count bigint
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.id AS step_id,
    s.step_number,
    COUNT(*) FILTER (WHERE sl.status = 'sent') AS sent_count,
    COUNT(*) FILTER (WHERE sl.status = 'failed') AS failed_count,
    COUNT(*) FILTER (WHERE sl.status = 'skipped') AS skipped_count,
    -- Count enrollments that replied while on this step
    COUNT(DISTINCT e.id) FILTER (WHERE e.reply_count > 0 AND e.current_step >= s.step_number) AS reply_count
  FROM crm_outreach_steps s
  LEFT JOIN crm_outreach_step_log sl ON sl.step_id = s.id
  LEFT JOIN crm_outreach_enrollments e ON e.sequence_id = s.sequence_id
  WHERE s.sequence_id = p_sequence_id
  GROUP BY s.id, s.step_number
  ORDER BY s.step_number;
END;
$$ LANGUAGE plpgsql STABLE;
