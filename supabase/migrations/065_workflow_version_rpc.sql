-- Atomic workflow version increment (avoids SELECT+UPDATE race condition)
CREATE OR REPLACE FUNCTION increment_workflow_version(wf_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE crm_workflows
  SET version = COALESCE(version, 0) + 1,
      updated_at = now()
  WHERE id = wf_id;
END;
$$ LANGUAGE plpgsql;
