-- Fix: Create missing crm_email_tracking registry table
-- The tracking pixel endpoint looks up this table but it was never created
CREATE TABLE IF NOT EXISTS crm_email_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  thread_id TEXT,
  message_id TEXT,
  recipient TEXT,
  subject TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_email_tracking_user ON crm_email_tracking(user_id);

ALTER TABLE crm_email_tracking ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own tracking records"
  ON crm_email_tracking FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "Service role inserts tracking records"
  ON crm_email_tracking FOR INSERT
  WITH CHECK (true);

-- Fix: Add user_id column to crm_email_tracking_events
ALTER TABLE crm_email_tracking_events
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

CREATE INDEX IF NOT EXISTS idx_tracking_events_user ON crm_email_tracking_events(user_id);

-- Fix: Tighten tracking events SELECT RLS to user-scoped
DROP POLICY IF EXISTS "Authenticated users read tracking events" ON crm_email_tracking_events;
CREATE POLICY "Users read own tracking events"
  ON crm_email_tracking_events FOR SELECT
  USING (auth.uid() = user_id);

-- Fix: Tighten tracking events INSERT to service role only
DROP POLICY IF EXISTS "Service role inserts tracking events" ON crm_email_tracking_events;
CREATE POLICY "Service role inserts tracking events"
  ON crm_email_tracking_events FOR INSERT
  WITH CHECK (false);

-- Fix: Tighten push events INSERT and UPDATE to service role only
DROP POLICY IF EXISTS "Service role inserts push events" ON crm_email_push_events;
CREATE POLICY "Service role inserts push events"
  ON crm_email_push_events FOR INSERT
  WITH CHECK (false);

DROP POLICY IF EXISTS "Service role updates push events" ON crm_email_push_events;
CREATE POLICY "Service role updates push events"
  ON crm_email_push_events FOR UPDATE
  USING (false);
