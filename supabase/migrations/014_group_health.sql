-- Migration 014: Group health & activity metrics
-- Adds activity tracking columns, archive support, and health status to tg_groups

ALTER TABLE tg_groups
  ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_message_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS message_count_7d INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS message_count_30d INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_bot_check_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS health_status TEXT DEFAULT 'unknown'
    CHECK (health_status IN ('active', 'quiet', 'stale', 'dead', 'unknown'));

CREATE INDEX IF NOT EXISTS idx_tg_groups_archived ON tg_groups(is_archived);
CREATE INDEX IF NOT EXISTS idx_tg_groups_health ON tg_groups(health_status);
CREATE INDEX IF NOT EXISTS idx_tg_groups_last_message ON tg_groups(last_message_at DESC NULLS LAST);
