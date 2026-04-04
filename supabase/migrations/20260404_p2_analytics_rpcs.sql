-- P2: Move analytics aggregation from JS to Postgres RPCs.
-- These replace client-side aggregation that breaks at 50K+ messages.

-- ── Top Senders RPC ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION crm_analytics_top_senders(
  p_user_id uuid,
  p_chat_id bigint DEFAULT NULL,
  p_after timestamptz DEFAULT NULL,
  p_before timestamptz DEFAULT NULL,
  p_limit int DEFAULT 20
)
RETURNS TABLE(sender_id bigint, sender_name text, message_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT
    m.sender_id,
    max(m.sender_name) AS sender_name,
    count(*) AS message_count
  FROM crm_message_index m
  WHERE m.user_id = p_user_id
    AND m.sender_id IS NOT NULL
    AND (p_chat_id IS NULL OR m.chat_id = p_chat_id)
    AND (p_after IS NULL OR m.sent_at >= p_after)
    AND (p_before IS NULL OR m.sent_at <= p_before)
  GROUP BY m.sender_id
  ORDER BY message_count DESC
  LIMIT p_limit;
$$;

-- ── Response Time RPC ────────────────────────────────────────
CREATE OR REPLACE FUNCTION crm_analytics_response_time(
  p_user_id uuid,
  p_chat_id bigint DEFAULT NULL,
  p_after timestamptz DEFAULT NULL,
  p_before timestamptz DEFAULT NULL,
  p_limit int DEFAULT 20
)
RETURNS TABLE(chat_id bigint, avg_response_ms bigint, avg_response_minutes int, sample_size bigint)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  WITH ordered AS (
    SELECT
      m.chat_id,
      m.sender_id,
      m.sent_at,
      lag(m.sender_id) OVER (PARTITION BY m.chat_id ORDER BY m.sent_at) AS prev_sender,
      lag(m.sent_at) OVER (PARTITION BY m.chat_id ORDER BY m.sent_at) AS prev_sent_at
    FROM crm_message_index m
    WHERE m.user_id = p_user_id
      AND (p_chat_id IS NULL OR m.chat_id = p_chat_id)
      AND (p_after IS NULL OR m.sent_at >= p_after)
      AND (p_before IS NULL OR m.sent_at <= p_before)
  ),
  gaps AS (
    SELECT
      o.chat_id,
      extract(epoch FROM (o.sent_at - o.prev_sent_at)) * 1000 AS gap_ms
    FROM ordered o
    WHERE o.prev_sender IS NOT NULL
      AND o.sender_id IS DISTINCT FROM o.prev_sender
      AND extract(epoch FROM (o.sent_at - o.prev_sent_at)) BETWEEN 0 AND 86400
  )
  SELECT
    g.chat_id,
    round(avg(g.gap_ms))::bigint AS avg_response_ms,
    round(avg(g.gap_ms) / 60000)::int AS avg_response_minutes,
    count(*)::bigint AS sample_size
  FROM gaps g
  GROUP BY g.chat_id
  HAVING count(*) > 0
  ORDER BY avg_response_ms ASC
  LIMIT p_limit;
$$;

-- ── Heatmap RPC ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION crm_analytics_heatmap(
  p_user_id uuid,
  p_chat_id bigint DEFAULT NULL,
  p_after timestamptz DEFAULT NULL,
  p_before timestamptz DEFAULT NULL
)
RETURNS TABLE(day_of_week int, hour_of_day int, message_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT
    extract(dow FROM m.sent_at)::int AS day_of_week,
    extract(hour FROM m.sent_at)::int AS hour_of_day,
    count(*) AS message_count
  FROM crm_message_index m
  WHERE m.user_id = p_user_id
    AND (p_chat_id IS NULL OR m.chat_id = p_chat_id)
    AND (p_after IS NULL OR m.sent_at >= p_after)
    AND (p_before IS NULL OR m.sent_at <= p_before)
  GROUP BY day_of_week, hour_of_day
  ORDER BY day_of_week, hour_of_day;
$$;

-- ── Message Volume RPC (if it doesn't exist yet) ─────────────
CREATE OR REPLACE FUNCTION crm_analytics_message_volume(
  p_user_id uuid,
  p_chat_id bigint DEFAULT NULL,
  p_after timestamptz DEFAULT NULL,
  p_before timestamptz DEFAULT NULL
)
RETURNS TABLE(date text, chat_id bigint, message_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT
    to_char(m.sent_at, 'YYYY-MM-DD') AS date,
    m.chat_id,
    count(*) AS message_count
  FROM crm_message_index m
  WHERE m.user_id = p_user_id
    AND (p_chat_id IS NULL OR m.chat_id = p_chat_id)
    AND (p_after IS NULL OR m.sent_at >= p_after)
    AND (p_before IS NULL OR m.sent_at <= p_before)
  GROUP BY date, m.chat_id
  ORDER BY date DESC;
$$;

COMMENT ON FUNCTION crm_analytics_top_senders IS 'Returns top message senders by count. Replaces JS-side aggregation.';
COMMENT ON FUNCTION crm_analytics_response_time IS 'Computes avg response time between different senders per chat. Replaces JS-side aggregation.';
COMMENT ON FUNCTION crm_analytics_heatmap IS 'Activity heatmap by day of week and hour. Replaces JS-side aggregation.';
COMMENT ON FUNCTION crm_analytics_message_volume IS 'Daily message volume by chat. Replaces JS-side aggregation.';
