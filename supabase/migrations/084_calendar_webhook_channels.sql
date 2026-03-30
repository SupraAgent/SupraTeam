-- Add webhook channel tracking columns to sync state
ALTER TABLE crm_calendar_sync_state
  ADD COLUMN IF NOT EXISTS watch_channel_id text,
  ADD COLUMN IF NOT EXISTS watch_resource_id text,
  ADD COLUMN IF NOT EXISTS watch_channel_expiry timestamptz;
