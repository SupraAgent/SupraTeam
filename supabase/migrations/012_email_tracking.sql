-- Email open tracking events
CREATE TABLE crm_email_tracking_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tracking_id TEXT NOT NULL, -- maps to thread_id or a unique send ID
  event_type TEXT NOT NULL DEFAULT 'open' CHECK (event_type IN ('open', 'click')),
  user_agent TEXT,
  ip_hash TEXT, -- privacy-safe hash, not raw IP
  opened_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_tracking_events_tracking_id ON crm_email_tracking_events(tracking_id);
CREATE INDEX idx_tracking_events_opened_at ON crm_email_tracking_events(opened_at);

-- RLS: tracking pixel endpoint uses service role, read via user auth
ALTER TABLE crm_email_tracking_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role inserts tracking events"
  ON crm_email_tracking_events FOR INSERT
  WITH CHECK (true);
CREATE POLICY "Authenticated users read tracking events"
  ON crm_email_tracking_events FOR SELECT
  USING (auth.uid() IS NOT NULL);
