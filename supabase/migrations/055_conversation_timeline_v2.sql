-- 055: Conversation Timeline V2
-- Adds media support, read cursors for unread tracking, and FTS index

-- Media columns on tg_group_messages
ALTER TABLE tg_group_messages ADD COLUMN IF NOT EXISTS media_type text;       -- photo, video, document, sticker, voice, animation
ALTER TABLE tg_group_messages ADD COLUMN IF NOT EXISTS media_file_id text;    -- Telegram file_id for proxy fetch
ALTER TABLE tg_group_messages ADD COLUMN IF NOT EXISTS media_thumb_id text;   -- Thumbnail file_id (for video/document)
ALTER TABLE tg_group_messages ADD COLUMN IF NOT EXISTS media_mime text;       -- MIME type
ALTER TABLE tg_group_messages ADD COLUMN IF NOT EXISTS media_size_bytes int;  -- File size

-- Read cursors: track last-read message per user per deal
CREATE TABLE IF NOT EXISTS crm_deal_read_cursors (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  deal_id uuid NOT NULL REFERENCES crm_deals(id) ON DELETE CASCADE,
  last_read_at timestamptz NOT NULL DEFAULT now(),
  last_read_message_id uuid,
  PRIMARY KEY (user_id, deal_id)
);

-- Upsert RPC for marking messages as read
CREATE OR REPLACE FUNCTION upsert_deal_read_cursor(
  p_user_id uuid,
  p_deal_id uuid,
  p_last_read_at timestamptz DEFAULT now(),
  p_message_id uuid DEFAULT NULL
) RETURNS void AS $$
BEGIN
  INSERT INTO crm_deal_read_cursors (user_id, deal_id, last_read_at, last_read_message_id)
  VALUES (p_user_id, p_deal_id, p_last_read_at, p_message_id)
  ON CONFLICT (user_id, deal_id)
  DO UPDATE SET
    last_read_at = EXCLUDED.last_read_at,
    last_read_message_id = EXCLUDED.last_read_message_id;
END;
$$ LANGUAGE plpgsql;

-- Full-text search index on message_text
CREATE INDEX IF NOT EXISTS idx_tg_messages_fts
  ON tg_group_messages
  USING gin(to_tsvector('english', coalesce(message_text, '')));

-- Index for unread count queries (messages after a cursor timestamp per chat)
CREATE INDEX IF NOT EXISTS idx_tg_messages_chat_sent
  ON tg_group_messages (telegram_chat_id, sent_at DESC);

-- RPC: Count unread messages for a user across their deals
CREATE OR REPLACE FUNCTION get_deal_unread_counts(p_user_id uuid)
RETURNS TABLE(deal_id uuid, unread_count bigint) AS $$
BEGIN
  RETURN QUERY
  SELECT d.id AS deal_id, COUNT(m.id) AS unread_count
  FROM crm_deals d
  JOIN tg_group_messages m ON m.telegram_chat_id = d.telegram_chat_id
  LEFT JOIN crm_deal_read_cursors rc ON rc.deal_id = d.id AND rc.user_id = p_user_id
  WHERE d.telegram_chat_id IS NOT NULL
    AND m.sent_at > COALESCE(rc.last_read_at, '1970-01-01'::timestamptz)
  GROUP BY d.id
  HAVING COUNT(m.id) > 0;
END;
$$ LANGUAGE plpgsql STABLE;
