-- Stage 3a: Data isolation layer
-- Ensures bot never leaks data between groups/orgs

-- 1. Privacy level per group: controls what data the bot exposes
--    full = internal team groups (show everything)
--    limited = partner groups (stage names but not values)
--    minimal = external groups (generic messages only)
-- Default to 'minimal' (safest) — admins explicitly upgrade trusted groups to 'limited' or 'full'
ALTER TABLE tg_groups ADD COLUMN IF NOT EXISTS privacy_level TEXT DEFAULT 'minimal'
  CHECK (privacy_level IN ('full', 'limited', 'minimal'));

-- 2. DM flag on AI conversations for visibility scoping
ALTER TABLE crm_ai_conversations ADD COLUMN IF NOT EXISTS is_private_dm BOOLEAN DEFAULT false;

-- 3. Fix bot RLS: restrict to creator + admin_lead
DROP POLICY IF EXISTS crm_bots_select ON crm_bots;
CREATE POLICY crm_bots_select ON crm_bots FOR SELECT TO authenticated
  USING (
    auth.uid() = created_by
    OR EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND crm_role = 'admin_lead'
    )
  );

DROP POLICY IF EXISTS crm_bots_update ON crm_bots;
CREATE POLICY crm_bots_update ON crm_bots FOR UPDATE TO authenticated
  USING (
    auth.uid() = created_by
    OR EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND crm_role = 'admin_lead'
    )
  );

-- 4. Index for group-scoped deal queries in daily digest
CREATE INDEX IF NOT EXISTS idx_crm_deals_tg_group_id ON crm_deals (tg_group_id)
  WHERE tg_group_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_crm_deals_telegram_chat_id ON crm_deals (telegram_chat_id)
  WHERE telegram_chat_id IS NOT NULL;
