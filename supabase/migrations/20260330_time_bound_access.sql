-- Time-bound access grants: add expiry to slug access table
ALTER TABLE crm_user_slug_access
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS auto_revoked_at timestamptz,
  ADD COLUMN IF NOT EXISTS revoke_reason text;

-- Index for efficient expiry lookups
CREATE INDEX IF NOT EXISTS idx_slug_access_expires
  ON crm_user_slug_access (expires_at)
  WHERE expires_at IS NOT NULL AND auto_revoked_at IS NULL;

-- Re-engagement tracking for quiet groups
CREATE TABLE IF NOT EXISTS crm_group_reengagement (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES tg_groups(id) ON DELETE CASCADE,
  triggered_at timestamptz NOT NULL DEFAULT now(),
  health_status text NOT NULL,
  message_sent text,
  sent_by text NOT NULL DEFAULT 'system', -- 'system' or user_id
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reengagement_group
  ON crm_group_reengagement (group_id, triggered_at DESC);
