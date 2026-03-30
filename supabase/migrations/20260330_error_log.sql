-- Error log for client-side and server-side errors
-- Reviewable at /settings/privacy/errors

CREATE TABLE IF NOT EXISTS crm_error_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Error classification
  severity text NOT NULL DEFAULT 'error' CHECK (severity IN ('error', 'warning', 'fatal')),
  source text NOT NULL DEFAULT 'client' CHECK (source IN ('client', 'server', 'api')),
  -- Error details
  message text NOT NULL,
  stack text,
  component text,          -- React component or API route
  action text,             -- What the user was doing (e.g. "email.archive", "deal.move")
  -- Context
  url text,                -- Page URL where error occurred
  user_agent text,
  metadata jsonb DEFAULT '{}',
  -- Dedup: fingerprint = hash of message+component+stack first line
  fingerprint text,
  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index for querying recent errors
CREATE INDEX idx_crm_error_log_created ON crm_error_log (created_at DESC);
CREATE INDEX idx_crm_error_log_fingerprint ON crm_error_log (fingerprint);
CREATE INDEX idx_crm_error_log_severity ON crm_error_log (severity);

-- RLS: authenticated users can insert their own errors, admins can read all
ALTER TABLE crm_error_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert their own errors"
  ON crm_error_log FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can read their own errors"
  ON crm_error_log FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Service role can do everything (for API route with admin client)
CREATE POLICY "Service role full access"
  ON crm_error_log FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Auto-cleanup: delete errors older than 30 days (run via pg_cron or manual)
-- SELECT cron.schedule('cleanup-error-log', '0 3 * * *', $$DELETE FROM crm_error_log WHERE created_at < now() - interval '30 days'$$);
