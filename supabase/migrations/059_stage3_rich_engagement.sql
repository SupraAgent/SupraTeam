-- Stage 3: Rich Engagement
-- Rich media broadcasts, media proxying, send-time optimization, inline CRM actions, A/B auto-send

-- Rich media on broadcasts (photo/document support)
ALTER TABLE crm_broadcasts
  ADD COLUMN IF NOT EXISTS media_type TEXT CHECK (media_type IN ('photo', 'document')),
  ADD COLUMN IF NOT EXISTS media_file_id TEXT,
  ADD COLUMN IF NOT EXISTS media_filename TEXT,
  ADD COLUMN IF NOT EXISTS inline_buttons JSONB;  -- [{text, url}] for inline keyboard

ALTER TABLE crm_broadcasts
  ADD COLUMN IF NOT EXISTS variant_b_media_file_id TEXT;

-- A/B winner auto-send tracking
ALTER TABLE crm_broadcasts
  ADD COLUMN IF NOT EXISTS ab_winner TEXT CHECK (ab_winner IN ('A', 'B')),
  ADD COLUMN IF NOT EXISTS ab_winner_sent_at TIMESTAMPTZ;

-- Send-time optimization: track hourly reply patterns per group
CREATE TABLE IF NOT EXISTS crm_reply_hour_stats (
  tg_group_id uuid NOT NULL REFERENCES tg_groups(id) ON DELETE CASCADE,
  hour_utc SMALLINT NOT NULL CHECK (hour_utc >= 0 AND hour_utc < 24),
  reply_count INT DEFAULT 0,
  last_updated_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (tg_group_id, hour_utc)
);

ALTER TABLE crm_reply_hour_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage reply hour stats"
  ON crm_reply_hour_stats FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Inline CRM actions: track callback actions from TG inline keyboards
CREATE TABLE IF NOT EXISTS crm_tg_callback_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid REFERENCES crm_deals(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id),
  action TEXT NOT NULL,  -- 'view_deal', 'mark_followup', 'skip_stage'
  telegram_user_id BIGINT,
  callback_data TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE crm_tg_callback_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage callback actions"
  ON crm_tg_callback_actions FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Add media_file_id to broadcast recipients for per-recipient media tracking
ALTER TABLE crm_broadcast_recipients
  ADD COLUMN IF NOT EXISTS media_file_id TEXT;

-- Index for send-time optimization queries
CREATE INDEX IF NOT EXISTS idx_reply_hours_group
  ON crm_reply_hour_stats(tg_group_id, reply_count DESC);
