-- Workflow version history: stores snapshots of nodes/edges before each save
CREATE TABLE IF NOT EXISTS crm_workflow_revisions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  workflow_id UUID NOT NULL REFERENCES crm_workflows(id) ON DELETE CASCADE,
  version INT NOT NULL,
  nodes JSONB NOT NULL,
  edges JSONB NOT NULL,
  saved_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  note TEXT
);

CREATE INDEX idx_workflow_revisions_wf ON crm_workflow_revisions(workflow_id, version DESC);

ALTER TABLE crm_workflow_revisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team can view workflow revisions"
  ON crm_workflow_revisions FOR SELECT USING (true);

CREATE POLICY "Authenticated can insert workflow revisions"
  ON crm_workflow_revisions FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
