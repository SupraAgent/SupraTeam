-- Gmail Pub/Sub push notification state
-- Tracks watch registration per email connection

ALTER TABLE crm_email_connections
  ADD COLUMN IF NOT EXISTS watch_history_id TEXT,
  ADD COLUMN IF NOT EXISTS watch_expiration TIMESTAMPTZ;

-- Push events table — webhook inserts, frontend subscribes via Realtime
CREATE TABLE IF NOT EXISTS crm_email_push_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  email TEXT NOT NULL,
  history_id TEXT NOT NULL,
  thread_ids TEXT[] DEFAULT '{}',
  processed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_push_events_user ON crm_email_push_events(user_id, processed);
CREATE INDEX idx_push_events_created ON crm_email_push_events(created_at);

-- RLS
ALTER TABLE crm_email_push_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own push events"
  ON crm_email_push_events FOR SELECT
  USING (user_id = auth.uid());
CREATE POLICY "Service role inserts push events"
  ON crm_email_push_events FOR INSERT
  WITH CHECK (true);
CREATE POLICY "Service role updates push events"
  ON crm_email_push_events FOR UPDATE
  USING (true);

-- Enable Realtime on push events
ALTER PUBLICATION supabase_realtime ADD TABLE crm_email_push_events;
