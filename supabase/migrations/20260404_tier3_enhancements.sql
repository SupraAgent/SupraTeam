-- ── Cache bust table (for bot-side cache invalidation) ──────
CREATE TABLE IF NOT EXISTS crm_cache_bust (
  key text PRIMARY KEY,
  busted_at timestamptz NOT NULL DEFAULT now()
);

-- ── Analytics threshold alerts ───────────────────────────────
CREATE TABLE IF NOT EXISTS crm_analytics_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  metric text NOT NULL, -- volume, top_senders, response_time, heatmap
  chat_id bigint,
  threshold_type text NOT NULL CHECK (threshold_type IN ('above', 'below')),
  threshold_value numeric NOT NULL,
  webhook_url text,
  is_active boolean NOT NULL DEFAULT true,
  last_triggered_at timestamptz,
  last_value numeric,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_crm_analytics_alerts_user ON crm_analytics_alerts(user_id) WHERE is_active = true;

ALTER TABLE crm_analytics_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own alerts"
  ON crm_analytics_alerts FOR ALL
  USING (auth.uid() = user_id);

-- ── Timezone-aware heatmap RPC ───────────────────────────────
-- Replaces the existing heatmap function with timezone support.
-- When p_timezone is NULL, uses UTC (backward compatible).

CREATE OR REPLACE FUNCTION crm_analytics_heatmap(
  p_user_id uuid,
  p_chat_id bigint DEFAULT NULL,
  p_after timestamptz DEFAULT NULL,
  p_before timestamptz DEFAULT NULL,
  p_timezone text DEFAULT 'UTC'
)
RETURNS TABLE(day_of_week int, hour_of_day int, message_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT
    extract(dow FROM m.sent_at AT TIME ZONE coalesce(p_timezone, 'UTC'))::int AS day_of_week,
    extract(hour FROM m.sent_at AT TIME ZONE coalesce(p_timezone, 'UTC'))::int AS hour_of_day,
    count(*)::bigint AS message_count
  FROM crm_message_index m
  WHERE m.user_id = p_user_id
    AND (p_chat_id IS NULL OR m.chat_id = p_chat_id)
    AND (p_after IS NULL OR m.sent_at >= p_after)
    AND (p_before IS NULL OR m.sent_at <= p_before)
  GROUP BY day_of_week, hour_of_day
  ORDER BY day_of_week, hour_of_day;
$$;

COMMENT ON FUNCTION crm_analytics_heatmap IS 'Activity heatmap by day/hour with timezone support. Pass p_timezone (e.g. America/New_York).';

-- ── Background bulk reindex: find unindexed messages ────────
-- Returns unindexed message IDs + metadata so the client can decrypt,
-- extract plaintext, and call crm_bulk_index_messages to update the tsvector.
-- Zero-knowledge: server cannot compute tsvector from encrypted_text.

CREATE OR REPLACE FUNCTION crm_unindexed_messages(
  p_user_id uuid,
  p_batch_size int DEFAULT 500
)
RETURNS TABLE(
  id uuid,
  chat_id bigint,
  message_id bigint,
  sender_id bigint,
  sent_at timestamptz,
  encrypted_text text
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT m.id, m.chat_id, m.message_id, m.sender_id, m.sent_at, m.encrypted_text
  FROM crm_message_index m
  WHERE m.user_id = p_user_id
    AND m.search_vector IS NULL
  ORDER BY m.sent_at DESC
  LIMIT p_batch_size;
$$;

-- Count of unindexed messages (for progress display)
CREATE OR REPLACE FUNCTION crm_unindexed_message_count(p_user_id uuid)
RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT count(*)
  FROM crm_message_index
  WHERE user_id = p_user_id
    AND search_vector IS NULL;
$$;

-- ── Group engagement scoring ────────────────────────────────
-- Computes engagement score per group based on message activity.

CREATE OR REPLACE FUNCTION crm_group_engagement_scores(
  p_user_id uuid,
  p_days int DEFAULT 30,
  p_limit int DEFAULT 50
)
RETURNS TABLE(
  chat_id bigint,
  total_messages bigint,
  unique_senders bigint,
  avg_daily_messages numeric,
  engagement_score numeric
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  WITH activity AS (
    SELECT
      m.chat_id,
      count(*)::bigint AS total_messages,
      count(DISTINCT m.sender_id)::bigint AS unique_senders,
      round(count(*)::numeric / greatest(p_days, 1), 1) AS avg_daily_messages
    FROM crm_message_index m
    WHERE m.user_id = p_user_id
      AND m.sent_at >= now() - (p_days || ' days')::interval
    GROUP BY m.chat_id
  )
  SELECT
    a.chat_id,
    a.total_messages,
    a.unique_senders,
    a.avg_daily_messages,
    -- Score: weighted combo of message volume (40%), sender diversity (40%), recency (20%)
    round(
      (least(a.avg_daily_messages / 10.0, 1.0) * 40) +
      (least(a.unique_senders::numeric / 20.0, 1.0) * 40) +
      (least(a.total_messages::numeric / (p_days * 5.0), 1.0) * 20),
      1
    ) AS engagement_score
  FROM activity a
  ORDER BY engagement_score DESC
  LIMIT p_limit;
$$;

COMMENT ON FUNCTION crm_group_engagement_scores IS 'Computes engagement score per group. Score 0-100 based on message volume, sender diversity, and activity frequency.';

-- ── Language-aware tsvector config helper ────────────────────
-- Detects language from text and returns appropriate tsvector config.

CREATE OR REPLACE FUNCTION crm_detect_ts_config(p_text text)
RETURNS regconfig
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE
    -- Check for CJK characters (Chinese, Japanese, Korean)
    WHEN p_text ~ '[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7a3]' THEN 'simple'::regconfig
    -- Check for Cyrillic
    WHEN p_text ~ '[\u0400-\u04ff]' THEN 'simple'::regconfig
    -- Check for Arabic
    WHEN p_text ~ '[\u0600-\u06ff]' THEN 'simple'::regconfig
    -- Default to English for Latin scripts
    ELSE 'english'::regconfig
  END;
$$;

-- Update bulk_index_messages to use language detection
CREATE OR REPLACE FUNCTION crm_bulk_index_messages(p_user_id uuid, p_messages jsonb)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  msg jsonb;
  v_count integer := 0;
  v_plain text;
  v_config regconfig;
BEGIN
  FOR msg IN SELECT * FROM jsonb_array_elements(p_messages)
  LOOP
    v_plain := coalesce(msg->>'plain_text', '');
    v_config := crm_detect_ts_config(v_plain);

    UPDATE crm_message_index
    SET
      search_vector = to_tsvector(v_config, v_plain),
      encrypted_text = coalesce(msg->>'encrypted_text', encrypted_text)
    WHERE user_id = p_user_id
      AND chat_id = (msg->>'chat_id')::bigint
      AND message_id = (msg->>'message_id')::bigint;

    IF FOUND THEN
      v_count := v_count + 1;
    ELSE
      INSERT INTO crm_message_index (user_id, chat_id, message_id, sender_id, sent_at, encrypted_text, search_vector)
      VALUES (
        p_user_id,
        (msg->>'chat_id')::bigint,
        (msg->>'message_id')::bigint,
        (msg->>'sender_id')::bigint,
        (msg->>'sent_at')::timestamptz,
        msg->>'encrypted_text',
        to_tsvector(v_config, v_plain)
      );
      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$$;

-- Update search to use language-aware config matching the indexing config
CREATE OR REPLACE FUNCTION crm_search_messages_ranked(
  p_user_id uuid,
  p_query text,
  p_chat_id bigint DEFAULT NULL,
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0
)
RETURNS TABLE(
  id uuid,
  chat_id bigint,
  message_id bigint,
  sender_id bigint,
  sent_at timestamptz,
  encrypted_text text,
  rank real
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  -- Use the same language detection for the query as we use for indexing.
  -- This ensures stemmed tokens match at search time.
  SELECT
    m.id, m.chat_id, m.message_id, m.sender_id, m.sent_at, m.encrypted_text,
    greatest(
      ts_rank(m.search_vector, websearch_to_tsquery('english', p_query)),
      ts_rank(m.search_vector, websearch_to_tsquery('simple', p_query))
    ) AS rank
  FROM crm_message_index m
  WHERE m.user_id = p_user_id
    AND (
      m.search_vector @@ websearch_to_tsquery('english', p_query)
      OR m.search_vector @@ websearch_to_tsquery('simple', p_query)
    )
    AND (p_chat_id IS NULL OR m.chat_id = p_chat_id)
  ORDER BY rank DESC, m.sent_at DESC
  LIMIT p_limit
  OFFSET p_offset;
$$;
