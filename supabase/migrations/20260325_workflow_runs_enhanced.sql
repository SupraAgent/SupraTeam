-- Tier 2: Enhanced run details and version tracking

-- Extend workflow runs with retry, version, and performance tracking
ALTER TABLE crm_workflow_runs ADD COLUMN IF NOT EXISTS duration_ms INT;
ALTER TABLE crm_workflow_runs ADD COLUMN IF NOT EXISTS retry_count INT DEFAULT 0;
ALTER TABLE crm_workflow_runs ADD COLUMN IF NOT EXISTS parent_run_id UUID REFERENCES crm_workflow_runs(id);
ALTER TABLE crm_workflow_runs ADD COLUMN IF NOT EXISTS failure_type TEXT;
ALTER TABLE crm_workflow_runs ADD COLUMN IF NOT EXISTS workflow_version INT;
ALTER TABLE crm_workflow_runs ADD COLUMN IF NOT EXISTS workflow_snapshot JSONB;

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

CREATE INDEX IF NOT EXISTS idx_node_exec_run ON crm_workflow_node_executions(run_id);
CREATE INDEX IF NOT EXISTS idx_node_exec_status ON crm_workflow_node_executions(status) WHERE status IN ('running', 'pending');

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
