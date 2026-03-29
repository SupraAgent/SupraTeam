-- Migration 065: Proper RLS policies for CRM tables
-- Replaces the weak "auth.uid() IS NOT NULL" policies with role-based access:
--   - crm_deals: creator, assignee, or lead role
--   - crm_contacts: creator or lead role
--   - crm_deal_stage_history: read-only for authenticated
--   - tg_groups, tg_group_slugs: read all, write lead only
--   - crm_workflows, crm_workflow_runs: creator or lead role
--   - pipeline_stages: read all, write admin_lead only

-- Helper: reusable function to check if the current user has a lead role
CREATE OR REPLACE FUNCTION public.is_crm_lead()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND crm_role IN ('bd_lead', 'marketing_lead', 'admin_lead')
  );
$$;

-- Helper: check if the current user is admin_lead
CREATE OR REPLACE FUNCTION public.is_crm_admin_lead()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND crm_role = 'admin_lead'
  );
$$;

-- ============================================================
-- crm_deals: creator, assignee, or lead role
-- ============================================================
DROP POLICY IF EXISTS "Authenticated full access to deals" ON crm_deals;
DROP POLICY IF EXISTS "crm_deals_select" ON crm_deals;
DROP POLICY IF EXISTS "crm_deals_insert" ON crm_deals;
DROP POLICY IF EXISTS "crm_deals_update" ON crm_deals;
DROP POLICY IF EXISTS "crm_deals_delete" ON crm_deals;

CREATE POLICY "crm_deals_select" ON crm_deals FOR SELECT TO authenticated
  USING (
    created_by = auth.uid()
    OR assigned_to = auth.uid()
    OR public.is_crm_lead()
  );

CREATE POLICY "crm_deals_insert" ON crm_deals FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
  );

CREATE POLICY "crm_deals_update" ON crm_deals FOR UPDATE TO authenticated
  USING (
    created_by = auth.uid()
    OR assigned_to = auth.uid()
    OR public.is_crm_lead()
  );

CREATE POLICY "crm_deals_delete" ON crm_deals FOR DELETE TO authenticated
  USING (
    created_by = auth.uid()
    OR public.is_crm_lead()
  );

-- ============================================================
-- crm_contacts: creator or lead role
-- ============================================================
DROP POLICY IF EXISTS "Authenticated full access to contacts" ON crm_contacts;
DROP POLICY IF EXISTS "crm_contacts_select" ON crm_contacts;
DROP POLICY IF EXISTS "crm_contacts_insert" ON crm_contacts;
DROP POLICY IF EXISTS "crm_contacts_update" ON crm_contacts;
DROP POLICY IF EXISTS "crm_contacts_delete" ON crm_contacts;

CREATE POLICY "crm_contacts_select" ON crm_contacts FOR SELECT TO authenticated
  USING (
    created_by = auth.uid()
    OR public.is_crm_lead()
  );

CREATE POLICY "crm_contacts_insert" ON crm_contacts FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
  );

CREATE POLICY "crm_contacts_update" ON crm_contacts FOR UPDATE TO authenticated
  USING (
    created_by = auth.uid()
    OR public.is_crm_lead()
  );

CREATE POLICY "crm_contacts_delete" ON crm_contacts FOR DELETE TO authenticated
  USING (
    created_by = auth.uid()
    OR public.is_crm_lead()
  );

-- ============================================================
-- crm_deal_stage_history: read-only for authenticated (audit log)
-- ============================================================
DROP POLICY IF EXISTS "Authenticated full access to stage history" ON crm_deal_stage_history;
DROP POLICY IF EXISTS "crm_deal_stage_history_select" ON crm_deal_stage_history;
DROP POLICY IF EXISTS "crm_deal_stage_history_insert" ON crm_deal_stage_history;

CREATE POLICY "crm_deal_stage_history_select" ON crm_deal_stage_history FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

-- Allow inserts (stage changes are logged by the app) but no update/delete
CREATE POLICY "crm_deal_stage_history_insert" ON crm_deal_stage_history FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- ============================================================
-- tg_groups: read all authenticated, write lead only
-- ============================================================
DROP POLICY IF EXISTS "Authenticated full access to groups" ON tg_groups;
DROP POLICY IF EXISTS "tg_groups_select" ON tg_groups;
DROP POLICY IF EXISTS "tg_groups_insert" ON tg_groups;
DROP POLICY IF EXISTS "tg_groups_update" ON tg_groups;
DROP POLICY IF EXISTS "tg_groups_delete" ON tg_groups;

CREATE POLICY "tg_groups_select" ON tg_groups FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "tg_groups_insert" ON tg_groups FOR INSERT TO authenticated
  WITH CHECK (public.is_crm_lead());

CREATE POLICY "tg_groups_update" ON tg_groups FOR UPDATE TO authenticated
  USING (public.is_crm_lead());

CREATE POLICY "tg_groups_delete" ON tg_groups FOR DELETE TO authenticated
  USING (public.is_crm_lead());

-- ============================================================
-- tg_group_slugs: read all authenticated, write lead only
-- ============================================================
DROP POLICY IF EXISTS "Authenticated full access to group slugs" ON tg_group_slugs;
DROP POLICY IF EXISTS "tg_group_slugs_select" ON tg_group_slugs;
DROP POLICY IF EXISTS "tg_group_slugs_insert" ON tg_group_slugs;
DROP POLICY IF EXISTS "tg_group_slugs_update" ON tg_group_slugs;
DROP POLICY IF EXISTS "tg_group_slugs_delete" ON tg_group_slugs;

CREATE POLICY "tg_group_slugs_select" ON tg_group_slugs FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "tg_group_slugs_insert" ON tg_group_slugs FOR INSERT TO authenticated
  WITH CHECK (public.is_crm_lead());

CREATE POLICY "tg_group_slugs_update" ON tg_group_slugs FOR UPDATE TO authenticated
  USING (public.is_crm_lead());

CREATE POLICY "tg_group_slugs_delete" ON tg_group_slugs FOR DELETE TO authenticated
  USING (public.is_crm_lead());

-- ============================================================
-- crm_workflows: creator or lead role
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can manage workflows" ON crm_workflows;
DROP POLICY IF EXISTS "crm_workflows_select" ON crm_workflows;
DROP POLICY IF EXISTS "crm_workflows_insert" ON crm_workflows;
DROP POLICY IF EXISTS "crm_workflows_update" ON crm_workflows;
DROP POLICY IF EXISTS "crm_workflows_delete" ON crm_workflows;

CREATE POLICY "crm_workflows_select" ON crm_workflows FOR SELECT TO authenticated
  USING (
    created_by = auth.uid()
    OR public.is_crm_lead()
  );

CREATE POLICY "crm_workflows_insert" ON crm_workflows FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "crm_workflows_update" ON crm_workflows FOR UPDATE TO authenticated
  USING (
    created_by = auth.uid()
    OR public.is_crm_lead()
  );

CREATE POLICY "crm_workflows_delete" ON crm_workflows FOR DELETE TO authenticated
  USING (
    created_by = auth.uid()
    OR public.is_crm_lead()
  );

-- ============================================================
-- crm_workflow_runs: creator (via workflow) or lead role
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can manage workflow runs" ON crm_workflow_runs;
DROP POLICY IF EXISTS "crm_workflow_runs_select" ON crm_workflow_runs;
DROP POLICY IF EXISTS "crm_workflow_runs_insert" ON crm_workflow_runs;
DROP POLICY IF EXISTS "crm_workflow_runs_update" ON crm_workflow_runs;

CREATE POLICY "crm_workflow_runs_select" ON crm_workflow_runs FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM crm_workflows w
      WHERE w.id = crm_workflow_runs.workflow_id
        AND (w.created_by = auth.uid() OR public.is_crm_lead())
    )
  );

CREATE POLICY "crm_workflow_runs_insert" ON crm_workflow_runs FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "crm_workflow_runs_update" ON crm_workflow_runs FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM crm_workflows w
      WHERE w.id = crm_workflow_runs.workflow_id
        AND (w.created_by = auth.uid() OR public.is_crm_lead())
    )
  );

-- ============================================================
-- pipeline_stages: read all authenticated, write admin_lead only
-- ============================================================
DROP POLICY IF EXISTS "Authenticated full access to stages" ON pipeline_stages;
DROP POLICY IF EXISTS "pipeline_stages_select" ON pipeline_stages;
DROP POLICY IF EXISTS "pipeline_stages_insert" ON pipeline_stages;
DROP POLICY IF EXISTS "pipeline_stages_update" ON pipeline_stages;
DROP POLICY IF EXISTS "pipeline_stages_delete" ON pipeline_stages;

CREATE POLICY "pipeline_stages_select" ON pipeline_stages FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "pipeline_stages_insert" ON pipeline_stages FOR INSERT TO authenticated
  WITH CHECK (public.is_crm_admin_lead());

CREATE POLICY "pipeline_stages_update" ON pipeline_stages FOR UPDATE TO authenticated
  USING (public.is_crm_admin_lead());

CREATE POLICY "pipeline_stages_delete" ON pipeline_stages FOR DELETE TO authenticated
  USING (public.is_crm_admin_lead());
