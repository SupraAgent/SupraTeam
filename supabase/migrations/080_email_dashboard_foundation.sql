-- ── Email Dashboard Foundation ──────────────────────────────
-- Adds last_activity_at on deals + email tags tables

-- 1. Add last_activity_at to crm_deals for unified staleness tracking
ALTER TABLE crm_deals ADD COLUMN IF NOT EXISTS last_activity_at timestamptz DEFAULT now();

-- Backfill from updated_at
UPDATE crm_deals SET last_activity_at = COALESCE(stage_changed_at, updated_at, created_at)
WHERE last_activity_at IS NULL OR last_activity_at = created_at;

-- Index for follow-up queries
CREATE INDEX IF NOT EXISTS idx_crm_deals_last_activity ON crm_deals (last_activity_at DESC);

-- 2. Email tags
CREATE TABLE IF NOT EXISTS crm_email_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text NOT NULL DEFAULT '#6366f1',
  icon text,
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, name)
);

ALTER TABLE crm_email_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own tags" ON crm_email_tags
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 3. Email thread tags (junction)
CREATE TABLE IF NOT EXISTS crm_email_thread_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id text NOT NULL,
  tag_id uuid NOT NULL REFERENCES crm_email_tags(id) ON DELETE CASCADE,
  tagged_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  auto_tagged boolean NOT NULL DEFAULT false,
  tagged_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(thread_id, tag_id)
);

ALTER TABLE crm_email_thread_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own thread tags" ON crm_email_thread_tags
  FOR ALL USING (auth.uid() = tagged_by)
  WITH CHECK (auth.uid() = tagged_by);

CREATE INDEX IF NOT EXISTS idx_email_thread_tags_thread ON crm_email_thread_tags (thread_id);
CREATE INDEX IF NOT EXISTS idx_email_thread_tags_tag ON crm_email_thread_tags (tag_id);

-- 4. Trigger to update last_activity_at on stage changes
CREATE OR REPLACE FUNCTION update_deal_last_activity()
RETURNS trigger AS $$
BEGIN
  NEW.last_activity_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_deal_last_activity ON crm_deals;
CREATE TRIGGER trg_deal_last_activity
  BEFORE UPDATE ON crm_deals
  FOR EACH ROW
  WHEN (OLD.stage_id IS DISTINCT FROM NEW.stage_id OR OLD.outcome IS DISTINCT FROM NEW.outcome OR OLD.contact_id IS DISTINCT FROM NEW.contact_id)
  EXECUTE FUNCTION update_deal_last_activity();
