-- Migration 057: Highlight burst grouping
-- Adds message_count to crm_highlights for burst grouping (multiple messages = 1 highlight)
-- Adds last_message_at for burst window tracking

ALTER TABLE crm_highlights
  ADD COLUMN IF NOT EXISTS message_count int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS last_message_at timestamptz DEFAULT now();

-- Update existing highlights
UPDATE crm_highlights SET last_message_at = created_at WHERE last_message_at IS NULL;
