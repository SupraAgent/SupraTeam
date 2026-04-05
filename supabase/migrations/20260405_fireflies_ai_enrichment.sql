-- Fireflies AI Enrichment: New columns for AI extraction and match confidence
-- Also encrypts webhook_secret and adds meeting_transcribed trigger support

-- 1. Add AI extraction column for Claude-processed insights
ALTER TABLE crm_meeting_transcripts
  ADD COLUMN IF NOT EXISTS ai_extraction JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS match_confidence TEXT DEFAULT 'unmatched'
    CHECK (match_confidence IN ('high', 'medium', 'low', 'unmatched'));

COMMENT ON COLUMN crm_meeting_transcripts.ai_extraction IS
  'Structured AI extraction from Claude: company details, deal updates, follow-up recs, suggested TG message';
COMMENT ON COLUMN crm_meeting_transcripts.match_confidence IS
  'How confidently the transcript was matched to a deal: high (tier 1/2), medium (tier 3), unmatched';

-- 2. Rename webhook_secret to webhook_secret_encrypted (now stores encrypted value)
ALTER TABLE crm_fireflies_connections
  RENAME COLUMN webhook_secret TO webhook_secret_encrypted;

-- 3. Add suggested_followup activity type for AI-generated TG drafts
ALTER TABLE crm_deal_activities
  DROP CONSTRAINT IF EXISTS crm_deal_activities_activity_type_check;
ALTER TABLE crm_deal_activities
  ADD CONSTRAINT crm_deal_activities_activity_type_check
  CHECK (activity_type IN (
    'stage_change', 'note_added', 'email_sent', 'email_received',
    'tg_message', 'booking_link_sent', 'meeting_scheduled',
    'meeting_completed', 'meeting_canceled', 'meeting_rescheduled',
    'meeting_no_show', 'transcript_received', 'task_created',
    'contact_linked', 'suggested_followup', 'ai_extraction_complete'
  ));

-- 4. Index for unmatched transcripts (for "Unlinked Meetings" UI)
CREATE INDEX IF NOT EXISTS idx_transcripts_unmatched
  ON crm_meeting_transcripts(user_id, created_at DESC)
  WHERE deal_id IS NULL;

-- 5. Index for AI extraction status
CREATE INDEX IF NOT EXISTS idx_transcripts_ai_extraction
  ON crm_meeting_transcripts(id)
  WHERE ai_extraction IS NULL AND deal_id IS NOT NULL;
