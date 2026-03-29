-- Atomic increment for reply hour stats (fixes read-modify-write race)
CREATE OR REPLACE FUNCTION increment_reply_hour_stat(
  p_tg_group_id UUID,
  p_hour_utc SMALLINT
)
RETURNS VOID
LANGUAGE sql
AS $$
  INSERT INTO crm_reply_hour_stats (tg_group_id, hour_utc, reply_count, last_updated_at)
  VALUES (p_tg_group_id, p_hour_utc, 1, now())
  ON CONFLICT (tg_group_id, hour_utc)
  DO UPDATE SET
    reply_count = crm_reply_hour_stats.reply_count + 1,
    last_updated_at = now();
$$;

-- Atomic broadcast counter adjustment for retry success (fixes read-modify-write race)
CREATE OR REPLACE FUNCTION adjust_broadcast_retry_counts(
  p_broadcast_id UUID
)
RETURNS VOID
LANGUAGE sql
AS $$
  UPDATE crm_broadcasts
  SET sent_count = COALESCE(sent_count, 0) + 1,
      failed_count = GREATEST(COALESCE(failed_count, 0) - 1, 0)
  WHERE id = p_broadcast_id;
$$;
