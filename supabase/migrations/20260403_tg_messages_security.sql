-- Security hardening for tg_group_messages: INSERT RLS, sync_enabled, synced_by audit

-- 1. Add synced_by column to track which CRM user submitted each message batch
ALTER TABLE tg_group_messages ADD COLUMN IF NOT EXISTS synced_by uuid REFERENCES auth.users(id);

-- 2. Add sync_enabled flag to tg_groups (default true so existing groups aren't broken)
ALTER TABLE tg_groups ADD COLUMN IF NOT EXISTS sync_enabled boolean NOT NULL DEFAULT true;

-- 3. INSERT policy: authenticated users can only insert messages for groups that exist in tg_groups
CREATE POLICY "Authenticated users insert messages for known groups"
  ON tg_group_messages FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM tg_groups g WHERE g.id = tg_group_messages.tg_group_id
    )
  );
