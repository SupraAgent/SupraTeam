-- Tier 2: Enhanced run details and version tracking

-- Extend workflow runs with retry, version, and performance tracking
ALTER TABLE crm_workflow_runs ADD COLUMN IF NOT EXISTS duration_ms INT;
ALTER TABLE crm_workflow_runs ADD COLUMN IF NOT EXISTS retry_count INT DEFAULT 0;
ALTER TABLE crm_workflow_runs ADD COLUMN IF NOT EXISTS parent_run_id UUID REFERENCES crm_workflow_runs(id) ON DELETE SET NULL;
ALTER TABLE crm_workflow_runs ADD COLUMN IF NOT EXISTS failure_type TEXT;
ALTER TABLE crm_workflow_runs ADD COLUMN IF NOT EXISTS workflow_version INT DEFAULT 1;
ALTER TABLE crm_workflow_runs ADD COLUMN IF NOT EXISTS workflow_snapshot JSONB;

-- Index for querying retry chains
CREATE INDEX IF NOT EXISTS idx_workflow_runs_parent ON crm_workflow_runs(parent_run_id) WHERE parent_run_id IS NOT NULL;

-- Version tracking on workflows
ALTER TABLE crm_workflows ADD COLUMN IF NOT EXISTS version INT DEFAULT 1;

-- Per-node execution log for waterfall timeline
CREATE TABLE IF NOT EXISTS crm_workflow_node_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES crm_workflow_runs(id) ON DELETE CASCADE,
  node_id TEXT NOT NULL,
  node_type TEXT,
  node_label TEXT,
  input_data JSONB,
  output_data JSONB,
  error_message TEXT,
  status TEXT DEFAULT 'pending', -- pending, running, completed, failed, skipped
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  duration_ms INT
);

-- Unique constraint for proper upsert support
CREATE UNIQUE INDEX IF NOT EXISTS idx_node_exec_run_node ON crm_workflow_node_executions(run_id, node_id);
CREATE INDEX IF NOT EXISTS idx_node_exec_status ON crm_workflow_node_executions(status) WHERE status IN ('running', 'pending');

-- RLS for node executions
ALTER TABLE crm_workflow_node_executions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage node executions"
  ON crm_workflow_node_executions FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Tier 3: Workflow alert configuration
CREATE TABLE IF NOT EXISTS crm_workflow_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES crm_workflows(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL, -- 'failure', 'slow_run', 'consecutive_failures'
  channel TEXT NOT NULL, -- 'telegram', 'slack', 'in_app'
  config JSONB DEFAULT '{}', -- {threshold_ms, consecutive_count, chat_id, channel_id}
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workflow_alerts_workflow ON crm_workflow_alerts(workflow_id) WHERE is_active = true;

-- RLS for alerts
ALTER TABLE crm_workflow_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage workflow alerts"
  ON crm_workflow_alerts FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Auto-update updated_at on alerts
CREATE OR REPLACE FUNCTION update_workflow_alerts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_workflow_alerts_updated_at
  BEFORE UPDATE ON crm_workflow_alerts
  FOR EACH ROW EXECUTE FUNCTION update_workflow_alerts_updated_at();

-- Extend notification type check to include workflow_alert
ALTER TABLE crm_notifications DROP CONSTRAINT IF EXISTS crm_notifications_type_check;
ALTER TABLE crm_notifications ADD CONSTRAINT crm_notifications_type_check
  CHECK (type IN ('tg_message', 'stage_change', 'deal_created', 'deal_assigned', 'mention', 'workflow_alert'));

-- Add metadata column for workflow alerts (if not exists)
ALTER TABLE crm_notifications ADD COLUMN IF NOT EXISTS metadata JSONB;

-- Atomic run_count increment to avoid race conditions
CREATE OR REPLACE FUNCTION increment_workflow_run_count(wf_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE crm_workflows
  SET run_count = COALESCE(run_count, 0) + 1,
      last_run_at = now()
  WHERE id = wf_id;
END;
$$ LANGUAGE plpgsql;
