-- Migration 058: Stage 2 Smart Automation
-- 2a: SLA configuration
-- 2b: Sequence goal-based completion
-- 2c: Broadcast suppression rules
-- 2e: Broadcast retry tracking

-- ── 2a: SLA config table ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_sla_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  board_type text, -- null = applies to all boards
  warning_hours numeric NOT NULL DEFAULT 2,
  breach_hours numeric NOT NULL DEFAULT 4,
  escalate_to_role text DEFAULT 'admin_lead',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(board_type)
);

-- Insert default SLA config (applies to all boards)
INSERT INTO crm_sla_config (board_type, warning_hours, breach_hours)
VALUES (NULL, 2, 4)
ON CONFLICT (board_type) DO NOTHING;

-- SLA breach log
CREATE TABLE IF NOT EXISTS crm_sla_breaches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid REFERENCES crm_deals(id) ON DELETE CASCADE,
  breach_type text NOT NULL CHECK (breach_type IN ('warning', 'breach')),
  hours_elapsed numeric NOT NULL,
  notified_at timestamptz DEFAULT now(),
  resolved_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sla_breaches_deal ON crm_sla_breaches(deal_id);
CREATE INDEX IF NOT EXISTS idx_sla_breaches_unresolved ON crm_sla_breaches(breach_type)
  WHERE resolved_at IS NULL;

-- ── 2b: Goal-based completion for outreach sequences ──────────
ALTER TABLE crm_outreach_sequences
  ADD COLUMN IF NOT EXISTS goal_stage_id uuid REFERENCES pipeline_stages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS goal_event text; -- e.g. 'reply_received', 'deal_won'

-- ── 2c: Broadcast suppression rules ──────────────────────────
ALTER TABLE crm_broadcasts
  ADD COLUMN IF NOT EXISTS suppression_hours int,
  ADD COLUMN IF NOT EXISTS exclude_stage_ids uuid[] DEFAULT '{}';

-- ── 2e: Broadcast retry tracking ──────────────────────────────
ALTER TABLE crm_broadcast_recipients
  ADD COLUMN IF NOT EXISTS delivery_attempts int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_attempt_at timestamptz;

-- RLS
ALTER TABLE crm_sla_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_sla_breaches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read SLA config"
  ON crm_sla_config FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can manage SLA config"
  ON crm_sla_config FOR ALL TO authenticated USING (true);
CREATE POLICY "Authenticated users can read SLA breaches"
  ON crm_sla_breaches FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can manage SLA breaches"
  ON crm_sla_breaches FOR ALL TO authenticated USING (true);
