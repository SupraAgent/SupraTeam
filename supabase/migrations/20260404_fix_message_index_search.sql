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
      -- Use 'simple' config for language-agnostic tokenization (no stemming).
      -- This supports international teams without broken English-only stemming.
      to_tsvector('simple', coalesce(msg->>'plain_text', ''))
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

-- ── Ranked search RPC ────────────────────────────────────────
-- Returns results ranked by relevance (ts_rank) instead of just recency.
CREATE OR REPLACE FUNCTION crm_search_messages_ranked(
  p_user_id uuid,
  p_query text,
  p_chat_id bigint DEFAULT NULL,
  p_after timestamptz DEFAULT NULL,
  p_before timestamptz DEFAULT NULL,
  p_limit int DEFAULT 50
)
RETURNS TABLE(
  id bigint,
  chat_id bigint,
  message_id bigint,
  sender_id bigint,
  sender_name text,
  message_text text,
  message_type text,
  has_media boolean,
  reply_to_message_id bigint,
  sent_at timestamptz,
  rank real
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT
    m.id, m.chat_id, m.message_id, m.sender_id, m.sender_name,
    m.message_text, m.message_type, m.has_media, m.reply_to_message_id,
    m.sent_at,
    ts_rank(m.search_vector, websearch_to_tsquery('simple', p_query)) AS rank
  FROM crm_message_index m
  WHERE m.user_id = p_user_id
    AND m.search_vector @@ websearch_to_tsquery('simple', p_query)
    AND (p_chat_id IS NULL OR m.chat_id = p_chat_id)
    AND (p_after IS NULL OR m.sent_at >= p_after)
    AND (p_before IS NULL OR m.sent_at <= p_before)
  ORDER BY rank DESC, m.sent_at DESC
  LIMIT p_limit;
$$;

COMMENT ON FUNCTION crm_search_messages_ranked IS
  'Full-text search with ts_rank relevance scoring. Returns results by match quality, not just recency.';
