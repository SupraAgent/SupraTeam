-- Atomic reply hour stat increment (prevents race condition)
CREATE OR REPLACE FUNCTION increment_reply_hour_stat(
  p_tg_group_id UUID,
  p_hour_utc INT
) RETURNS VOID AS $$
BEGIN
  INSERT INTO crm_reply_hour_stats (tg_group_id, hour_utc, reply_count, last_updated_at)
  VALUES (p_tg_group_id, p_hour_utc, 1, NOW())
  ON CONFLICT (tg_group_id, hour_utc)
  DO UPDATE SET
    reply_count = crm_reply_hour_stats.reply_count + 1,
    last_updated_at = NOW();
END;
$$ LANGUAGE plpgsql;
