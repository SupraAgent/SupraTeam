-- Migration 037: Conversation timeline support
-- Adds indexes and columns for efficient deal conversation lookup

-- Fast lookup for deal conversation by chat_id + time ordering
CREATE INDEX IF NOT EXISTS idx_tg_group_messages_chat_sent
  ON tg_group_messages(telegram_chat_id, sent_at DESC);

-- Add sender_username for richer display in chat bubbles
ALTER TABLE tg_group_messages ADD COLUMN IF NOT EXISTS sender_username TEXT;

-- Flag to distinguish bot-captured messages from user-synced
ALTER TABLE tg_group_messages ADD COLUMN IF NOT EXISTS is_from_bot BOOLEAN DEFAULT false;
