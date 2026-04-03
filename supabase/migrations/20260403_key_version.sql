-- Add key_version column to all tables that store AES-256-GCM encrypted data.
-- Enables key rotation: new encryptions use the latest version, decryption
-- looks up the correct key by version. Default 1 = current TOKEN_ENCRYPTION_KEY.

ALTER TABLE user_tokens
  ADD COLUMN IF NOT EXISTS key_version smallint NOT NULL DEFAULT 1;

ALTER TABLE crm_bots
  ADD COLUMN IF NOT EXISTS key_version smallint NOT NULL DEFAULT 1;

ALTER TABLE email_connections
  ADD COLUMN IF NOT EXISTS key_version smallint NOT NULL DEFAULT 1;

ALTER TABLE calendar_connections
  ADD COLUMN IF NOT EXISTS key_version smallint NOT NULL DEFAULT 1;
