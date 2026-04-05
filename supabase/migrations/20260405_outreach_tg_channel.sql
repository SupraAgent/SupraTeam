-- Add channel support to outreach sequence steps
-- Enables cross-channel sequences: Telegram DM → Email → etc.

-- Channel per step (backward compatible — defaults to 'telegram' for existing steps)
ALTER TABLE crm_outreach_steps
  ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'telegram'
    CHECK (channel IN ('telegram', 'email'));

-- Email-specific fields for email-channel steps
ALTER TABLE crm_outreach_steps
  ADD COLUMN IF NOT EXISTS email_subject text,
  ADD COLUMN IF NOT EXISTS email_template text;

-- Track contact email on enrollment for email steps
ALTER TABLE crm_outreach_enrollments
  ADD COLUMN IF NOT EXISTS contact_email text;

COMMENT ON COLUMN crm_outreach_steps.channel IS 'Delivery channel: telegram (default) or email';
COMMENT ON COLUMN crm_outreach_steps.email_subject IS 'Subject line for email-channel steps';
COMMENT ON COLUMN crm_outreach_steps.email_template IS 'HTML body for email-channel steps (overrides message_template)';
