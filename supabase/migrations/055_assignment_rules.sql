-- Feature 2: Smart Assignment & Routing

-- Assignment rules: evaluated in priority order on new messages
CREATE TABLE IF NOT EXISTS crm_assignment_rules (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  priority INT NOT NULL DEFAULT 0,
  match_type TEXT NOT NULL CHECK (match_type IN ('group_slug', 'keyword', 'contact_tag', 'round_robin')),
  match_value TEXT, -- slug name, keyword pattern, tag value (null for round_robin)
  assign_to UUID REFERENCES auth.users(id), -- specific user (null for round_robin)
  team_pool UUID[] DEFAULT '{}', -- user IDs for round-robin rotation
  enabled BOOLEAN DEFAULT true,
  created_by UUID REFERENCES auth.users(id) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE crm_assignment_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY crm_assignment_rules_all ON crm_assignment_rules
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX idx_assignment_rules_priority ON crm_assignment_rules(priority) WHERE enabled = true;

-- Round-robin state: tracks last-assigned index per rule (atomic)
CREATE TABLE IF NOT EXISTS crm_round_robin_state (
  rule_id UUID REFERENCES crm_assignment_rules(id) ON DELETE CASCADE PRIMARY KEY,
  last_index INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE crm_round_robin_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY crm_round_robin_state_all ON crm_round_robin_state
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Atomic round-robin: increment index and return the next user from the pool
-- Returns the user_id to assign to, or null if pool is empty
CREATE OR REPLACE FUNCTION next_round_robin(p_rule_id UUID, p_pool_size INT)
RETURNS INT AS $$
DECLARE
  v_index INT;
BEGIN
  -- Guard: prevent division by zero
  IF p_pool_size <= 0 THEN RETURN NULL; END IF;

  -- Atomic increment with upsert
  INSERT INTO crm_round_robin_state (rule_id, last_index, updated_at)
  VALUES (p_rule_id, 0, now())
  ON CONFLICT (rule_id) DO UPDATE
    SET last_index = (crm_round_robin_state.last_index + 1) % p_pool_size,
        updated_at = now()
  RETURNING last_index INTO v_index;

  RETURN v_index;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add assignment_reason to inbox status for audit trail
ALTER TABLE crm_inbox_status ADD COLUMN IF NOT EXISTS assignment_reason TEXT;
-- Values: 'manual', 'rule:group_slug:defi', 'rule:round_robin', etc.
