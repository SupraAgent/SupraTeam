-- Additive migration for environments that already applied 20260404_calendly_fireflies_integration.sql
-- Adds columns and indexes from the CPO audit follow-ups.

-- 1. google_calendar_event_id on booking links (deterministic join key for Fireflies Phase 2)
ALTER TABLE crm_booking_links
  ADD COLUMN IF NOT EXISTS google_calendar_event_id TEXT;

CREATE INDEX IF NOT EXISTS idx_booking_links_gcal_event
  ON crm_booking_links(google_calendar_event_id)
  WHERE google_calendar_event_id IS NOT NULL;

-- 2. Composite index for Phase 2 fuzzy matching (scheduled_at + invitee_email)
CREATE INDEX IF NOT EXISTS idx_booking_links_match
  ON crm_booking_links(scheduled_at, invitee_email)
  WHERE scheduled_at IS NOT NULL;

-- 3. Make transcript_url nullable (Fireflies may not have URL ready at webhook time)
ALTER TABLE crm_meeting_transcripts
  ALTER COLUMN transcript_url DROP NOT NULL;

-- 4. Add updated_at to transcripts (for reprocessing/backfill tracking)
ALTER TABLE crm_meeting_transcripts
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- 5. UPDATE RLS policy on transcripts (needed for Phase 2 reconciliation backfill)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'crm_meeting_transcripts'
    AND policyname = 'Users update own transcripts'
  ) THEN
    CREATE POLICY "Users update own transcripts"
      ON crm_meeting_transcripts FOR UPDATE USING (auth.uid() = user_id);
  END IF;
END
$$;
