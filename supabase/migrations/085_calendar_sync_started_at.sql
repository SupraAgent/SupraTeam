-- Add sync_started_at for stale lock detection
ALTER TABLE crm_calendar_sync_state
  ADD COLUMN IF NOT EXISTS sync_started_at timestamptz;
