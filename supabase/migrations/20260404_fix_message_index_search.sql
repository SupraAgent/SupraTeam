-- Fix: search_vector was a generated column computed from message_text,
-- but message_text is now stored encrypted (AES-256-GCM).
-- Postgres can't build tsvector from ciphertext, so search always returned 0 results.
--
-- Solution: make search_vector a regular column, populated at insert time
-- from the plaintext (before encryption). The tsvector stores only stemmed
-- tokens — not full plaintext — so this is an acceptable privacy tradeoff
-- for users who explicitly opt in to message indexing.

-- Drop the generated column and recreate as regular tsvector
ALTER TABLE crm_message_index DROP COLUMN IF EXISTS search_vector;
ALTER TABLE crm_message_index ADD COLUMN search_vector tsvector;

-- Recreate GIN index for full-text search
CREATE INDEX IF NOT EXISTS idx_crm_message_index_search
  ON crm_message_index USING gin(search_vector);

-- RPC: bulk-index messages with proper search vector computation.
-- Accepts plaintext for tsvector generation + encrypted text for storage.
-- Plaintext is never persisted — only the stemmed tsvector tokens are stored.
CREATE OR REPLACE FUNCTION crm_bulk_index_messages(
  p_user_id uuid,
  p_messages jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  msg jsonb;
  cnt integer := 0;
BEGIN
  FOR msg IN SELECT * FROM jsonb_array_elements(p_messages)
  LOOP
    INSERT INTO crm_message_index (
      user_id, chat_id, message_id, sender_id, sender_name,
      message_text, message_type, has_media, reply_to_message_id,
      sent_at, search_vector
    ) VALUES (
      p_user_id,
      (msg->>'chat_id')::bigint,
      (msg->>'message_id')::bigint,
      (msg->>'sender_id')::bigint,
      msg->>'sender_name',
      msg->>'encrypted_text',
      coalesce(msg->>'message_type', 'text'),
      coalesce((msg->>'has_media')::boolean, false),
      (msg->>'reply_to_message_id')::bigint,
      (msg->>'sent_at')::timestamptz,
      to_tsvector('english', coalesce(msg->>'plain_text', ''))
    )
    ON CONFLICT (user_id, chat_id, message_id) DO UPDATE SET
      message_text = EXCLUDED.message_text,
      search_vector = EXCLUDED.search_vector,
      sender_name = EXCLUDED.sender_name;
    cnt := cnt + 1;
  END LOOP;
  RETURN cnt;
END;
$$;

COMMENT ON FUNCTION crm_bulk_index_messages IS
  'Bulk-indexes messages: stores encrypted message_text + computes search_vector from plaintext. Plaintext is never persisted.';
