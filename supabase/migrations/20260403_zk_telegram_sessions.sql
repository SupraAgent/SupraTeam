-- Add encryption_method column to tg_client_sessions
-- 'server' = legacy (encrypted with TOKEN_ENCRYPTION_KEY on server)
-- 'client' = zero-knowledge (encrypted with device-bound key in browser)
ALTER TABLE tg_client_sessions
ADD COLUMN IF NOT EXISTS encryption_method text NOT NULL DEFAULT 'server';

-- Allow session_encrypted to be nullable (cleared on disconnect)
ALTER TABLE tg_client_sessions
ALTER COLUMN session_encrypted DROP NOT NULL;

-- Allow phone_number_hash to be nullable (ZK flow doesn't hash on server)
ALTER TABLE tg_client_sessions
ALTER COLUMN phone_number_hash DROP NOT NULL;

COMMENT ON COLUMN tg_client_sessions.encryption_method IS
  'server = legacy server-side encryption, client = zero-knowledge browser-side encryption';
