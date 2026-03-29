-- Add gmail_app_password provider for personal Gmail via IMAP/SMTP
-- This allows users to connect personal Gmail accounts using App Passwords,
-- bypassing the need for the Gmail API to be enabled in GCP.

-- Expand the provider check constraint
ALTER TABLE crm_email_connections
  DROP CONSTRAINT IF EXISTS crm_email_connections_provider_check;

ALTER TABLE crm_email_connections
  ADD CONSTRAINT crm_email_connections_provider_check
  CHECK (provider IN ('gmail', 'gmail_app_password', 'outlook'));

-- For app password connections, refresh_token is not used.
-- Make the column nullable so we can store just the app password in access_token_encrypted.
ALTER TABLE crm_email_connections
  ALTER COLUMN refresh_token_encrypted DROP NOT NULL;
