-- Unique index on OAuth nonce values to prevent replay attacks.
-- The callback code assumes this index exists for nonce deduplication via
-- crm_email_audit_log entries with action = 'oauth_nonce_consumed' or 'cal_oauth_nonce_consumed'.
CREATE UNIQUE INDEX IF NOT EXISTS idx_audit_log_cal_oauth_nonce
ON crm_email_audit_log ((metadata->>'nonce'))
WHERE action = 'cal_oauth_nonce_consumed';

-- Also cover the email OAuth nonce action
CREATE UNIQUE INDEX IF NOT EXISTS idx_audit_log_email_oauth_nonce
ON crm_email_audit_log ((metadata->>'nonce'))
WHERE action = 'oauth_nonce_consumed';
