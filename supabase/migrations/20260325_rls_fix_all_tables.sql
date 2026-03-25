-- Fix RLS for all CRM tables
-- Part 1: Enable RLS + add simple auth policy on tables that have NO RLS
-- Part 2: Replace USING(true) "fake" policies with auth.uid() IS NOT NULL

-- ============================================================
-- PART 1: Tables with NO RLS at all (enable + add policy)
-- ============================================================

-- crm_deal_fields (004)
ALTER TABLE crm_deal_fields ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage deal fields"
  ON crm_deal_fields FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- crm_deal_field_values (004)
ALTER TABLE crm_deal_field_values ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage deal field values"
  ON crm_deal_field_values FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- crm_notifications (005)
ALTER TABLE crm_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage notifications"
  ON crm_notifications FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- crm_deal_notes (007)
ALTER TABLE crm_deal_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage deal notes"
  ON crm_deal_notes FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- crm_highlights (008)
ALTER TABLE crm_highlights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage highlights"
  ON crm_highlights FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- crm_stage_reminders (009)
ALTER TABLE crm_stage_reminders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage stage reminders"
  ON crm_stage_reminders FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- crm_deal_reminders (009)
ALTER TABLE crm_deal_reminders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage deal reminders"
  ON crm_deal_reminders FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- crm_contact_fields (022)
ALTER TABLE crm_contact_fields ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage contact fields"
  ON crm_contact_fields FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- crm_contact_field_values (022)
ALTER TABLE crm_contact_field_values ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage contact field values"
  ON crm_contact_field_values FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- crm_automation_log (023)
ALTER TABLE crm_automation_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage automation log"
  ON crm_automation_log FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- tg_group_members (025)
ALTER TABLE tg_group_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage group members"
  ON tg_group_members FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- tg_group_member_events (025)
ALTER TABLE tg_group_member_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage group member events"
  ON tg_group_member_events FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- crm_outreach_sequences (026)
ALTER TABLE crm_outreach_sequences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage outreach sequences"
  ON crm_outreach_sequences FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- crm_outreach_steps (026)
ALTER TABLE crm_outreach_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage outreach steps"
  ON crm_outreach_steps FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- crm_outreach_enrollments (026)
ALTER TABLE crm_outreach_enrollments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage outreach enrollments"
  ON crm_outreach_enrollments FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- crm_outreach_step_log (026)
ALTER TABLE crm_outreach_step_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage outreach step log"
  ON crm_outreach_step_log FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- crm_ai_agent_config (027)
ALTER TABLE crm_ai_agent_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage AI agent config"
  ON crm_ai_agent_config FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- crm_ai_conversations (027)
ALTER TABLE crm_ai_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage AI conversations"
  ON crm_ai_conversations FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- crm_webhooks (029)
ALTER TABLE crm_webhooks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage webhooks"
  ON crm_webhooks FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- crm_webhook_deliveries (029)
ALTER TABLE crm_webhook_deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage webhook deliveries"
  ON crm_webhook_deliveries FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- crm_data_retention_policies (030)
ALTER TABLE crm_data_retention_policies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage data retention policies"
  ON crm_data_retention_policies FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- crm_data_deletion_requests (030)
ALTER TABLE crm_data_deletion_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage data deletion requests"
  ON crm_data_deletion_requests FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- crm_consent_records (030)
ALTER TABLE crm_consent_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage consent records"
  ON crm_consent_records FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- crm_slack_channels (040)
ALTER TABLE crm_slack_channels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage slack channels"
  ON crm_slack_channels FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- crm_slack_users (040)
ALTER TABLE crm_slack_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage slack users"
  ON crm_slack_users FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- crm_notification_preferences (019)
ALTER TABLE crm_notification_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage notification preferences"
  ON crm_notification_preferences FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- ============================================================
-- PART 2: Replace USING(true) policies with auth.uid() IS NOT NULL
-- ============================================================

-- crm_bot_templates (013) - has 2 policies
DROP POLICY IF EXISTS "Authenticated users can read templates" ON crm_bot_templates;
DROP POLICY IF EXISTS "Authenticated users can manage templates" ON crm_bot_templates;
CREATE POLICY "Authenticated users can read templates"
  ON crm_bot_templates FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can manage templates"
  ON crm_bot_templates FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- crm_template_versions (017)
DROP POLICY IF EXISTS "Authenticated users can manage template versions" ON crm_template_versions;
CREATE POLICY "Authenticated users can manage template versions"
  ON crm_template_versions FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- crm_docs (010)
DROP POLICY IF EXISTS "Authenticated users can manage docs" ON crm_docs;
CREATE POLICY "Authenticated users can manage docs"
  ON crm_docs FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- crm_doc_links (010)
DROP POLICY IF EXISTS "Authenticated users can manage doc links" ON crm_doc_links;
CREATE POLICY "Authenticated users can manage doc links"
  ON crm_doc_links FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- crm_automation_rules (015)
DROP POLICY IF EXISTS "Authenticated users can manage automation rules" ON crm_automation_rules;
CREATE POLICY "Authenticated users can manage automation rules"
  ON crm_automation_rules FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- crm_scheduled_messages (015)
DROP POLICY IF EXISTS "Authenticated users can manage scheduled messages" ON crm_scheduled_messages;
CREATE POLICY "Authenticated users can manage scheduled messages"
  ON crm_scheduled_messages FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- crm_notification_log (015)
DROP POLICY IF EXISTS "Authenticated users can read notification log" ON crm_notification_log;
CREATE POLICY "Authenticated users can read notification log"
  ON crm_notification_log FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- crm_broadcasts (016)
DROP POLICY IF EXISTS "Authenticated users can manage broadcasts" ON crm_broadcasts;
CREATE POLICY "Authenticated users can manage broadcasts"
  ON crm_broadcasts FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- crm_broadcast_recipients (016)
DROP POLICY IF EXISTS "Authenticated users can manage broadcast recipients" ON crm_broadcast_recipients;
CREATE POLICY "Authenticated users can manage broadcast recipients"
  ON crm_broadcast_recipients FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- crm_audit_log (018)
DROP POLICY IF EXISTS "Authenticated users can read audit log" ON crm_audit_log;
CREATE POLICY "Authenticated users can read audit log"
  ON crm_audit_log FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- crm_workflows (024)
DROP POLICY IF EXISTS "Authenticated users can manage workflows" ON crm_workflows;
CREATE POLICY "Authenticated users can manage workflows"
  ON crm_workflows FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- crm_workflow_runs (024)
DROP POLICY IF EXISTS "Authenticated users can manage workflow runs" ON crm_workflow_runs;
CREATE POLICY "Authenticated users can manage workflow runs"
  ON crm_workflow_runs FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- crm_workflow_templates (032)
DROP POLICY IF EXISTS "Authenticated users can manage workflow templates" ON crm_workflow_templates;
CREATE POLICY "Authenticated users can manage workflow templates"
  ON crm_workflow_templates FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- crm_workflow_node_executions (20260325)
DROP POLICY IF EXISTS "Authenticated users can manage node executions" ON crm_workflow_node_executions;
CREATE POLICY "Authenticated users can manage node executions"
  ON crm_workflow_node_executions FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- crm_workflow_alerts (20260325)
DROP POLICY IF EXISTS "Authenticated users can manage workflow alerts" ON crm_workflow_alerts;
CREATE POLICY "Authenticated users can manage workflow alerts"
  ON crm_workflow_alerts FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- crm_tg_slack_user_map (035)
DROP POLICY IF EXISTS "Authenticated users can manage TG-Slack mappings" ON crm_tg_slack_user_map;
CREATE POLICY "Authenticated users can manage TG-Slack mappings"
  ON crm_tg_slack_user_map FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- crm_bots (031) - SELECT and UPDATE use USING(true), keep INSERT/DELETE as-is
DROP POLICY IF EXISTS crm_bots_select ON crm_bots;
DROP POLICY IF EXISTS crm_bots_update ON crm_bots;
CREATE POLICY crm_bots_select ON crm_bots FOR SELECT
  TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY crm_bots_update ON crm_bots FOR UPDATE
  TO authenticated USING (auth.uid() IS NOT NULL);

-- crm_email_push_events (017) - UPDATE uses USING(true)
DROP POLICY IF EXISTS "Service role updates push events" ON crm_email_push_events;
CREATE POLICY "Service role updates push events"
  ON crm_email_push_events FOR UPDATE
  USING (auth.uid() IS NOT NULL);
