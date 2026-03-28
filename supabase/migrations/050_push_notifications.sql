-- Stage 3c: TMA Push Notifications
-- Adds push notification preferences and tracking

-- Add push notification preference to existing notification preferences table
ALTER TABLE crm_notification_preferences
  ADD COLUMN IF NOT EXISTS push_enabled BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS push_stage_changes BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS push_tg_messages BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS push_escalations BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS push_outreach_replies BOOLEAN DEFAULT true;

-- Track push notifications sent (for dedup and rate limiting)
CREATE TABLE IF NOT EXISTS crm_push_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  telegram_user_id BIGINT NOT NULL,
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('stage_change', 'tg_message', 'escalation', 'outreach_reply')),
  deal_id UUID REFERENCES crm_deals(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  tma_path TEXT,
  sent_at TIMESTAMPTZ DEFAULT now(),
  delivered BOOLEAN DEFAULT true
);

-- Index for rate limiting (recent pushes per user)
CREATE INDEX IF NOT EXISTS idx_push_log_user_recent
  ON crm_push_log(user_id, sent_at DESC);

-- Index for dedup (don't send same trigger twice)
CREATE INDEX IF NOT EXISTS idx_push_log_dedup
  ON crm_push_log(user_id, trigger_type, deal_id, sent_at DESC);

-- RLS
ALTER TABLE crm_push_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY push_log_select ON crm_push_log
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
