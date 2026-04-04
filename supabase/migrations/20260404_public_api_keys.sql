-- API keys for public endpoint access
CREATE TABLE IF NOT EXISTS crm_api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label text NOT NULL DEFAULT 'Default',
  key_hash text NOT NULL UNIQUE,
  key_prefix text NOT NULL, -- first 8 chars for display (e.g., "sk_crm_ab")
  scopes text[] NOT NULL DEFAULT '{enroll,read}',
  is_active boolean NOT NULL DEFAULT true,
  expires_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_crm_api_keys_hash ON crm_api_keys(key_hash) WHERE is_active = true;
CREATE INDEX idx_crm_api_keys_user ON crm_api_keys(user_id);

ALTER TABLE crm_api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own API keys"
  ON crm_api_keys FOR ALL
  USING (auth.uid() = user_id);
