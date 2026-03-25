-- Migration 031: Multi-bot management
-- Allows teams to register multiple Telegram bots and assign them to groups

-- Bot registry table
CREATE TABLE crm_bots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID, -- reserved for future multi-team
  label TEXT NOT NULL, -- human-friendly name e.g. "BD Bot", "Marketing Bot"
  bot_username TEXT, -- @username from getMe (cached)
  bot_first_name TEXT, -- first_name from getMe (cached)
  bot_telegram_id BIGINT, -- bot user id from getMe
  token_id UUID REFERENCES user_tokens(id) ON DELETE SET NULL, -- link to encrypted token
  is_active BOOLEAN DEFAULT true,
  is_default BOOLEAN DEFAULT false, -- exactly one bot should be default
  webhook_url TEXT,
  webhook_secret TEXT, -- per-bot webhook secret (encrypted)
  groups_count INT DEFAULT 0, -- cached count
  last_verified_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Unique constraint: one default bot at a time
CREATE UNIQUE INDEX crm_bots_default_idx ON crm_bots (is_default) WHERE is_default = true;

-- Unique bot telegram ID (can't register same bot twice)
CREATE UNIQUE INDEX crm_bots_telegram_id_idx ON crm_bots (bot_telegram_id) WHERE bot_telegram_id IS NOT NULL;

-- Add bot_id to tg_groups (which bot manages this group)
ALTER TABLE tg_groups ADD COLUMN bot_id UUID REFERENCES crm_bots(id) ON DELETE SET NULL;

-- Index for looking up groups by bot
CREATE INDEX tg_groups_bot_id_idx ON tg_groups (bot_id);

-- RLS policies
ALTER TABLE crm_bots ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read bots
CREATE POLICY crm_bots_select ON crm_bots FOR SELECT
  TO authenticated USING (true);

-- Only the creator or service role can modify
CREATE POLICY crm_bots_insert ON crm_bots FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = created_by);

CREATE POLICY crm_bots_update ON crm_bots FOR UPDATE
  TO authenticated USING (true);

CREATE POLICY crm_bots_delete ON crm_bots FOR DELETE
  TO authenticated USING (auth.uid() = created_by);

-- Function to maintain groups_count cache
CREATE OR REPLACE FUNCTION update_bot_groups_count()
RETURNS TRIGGER AS $$
BEGIN
  -- Update old bot count
  IF TG_OP = 'UPDATE' AND OLD.bot_id IS DISTINCT FROM NEW.bot_id THEN
    IF OLD.bot_id IS NOT NULL THEN
      UPDATE crm_bots SET groups_count = (
        SELECT count(*) FROM tg_groups WHERE bot_id = OLD.bot_id
      ), updated_at = now() WHERE id = OLD.bot_id;
    END IF;
  END IF;

  -- Update new bot count
  IF NEW.bot_id IS NOT NULL THEN
    UPDATE crm_bots SET groups_count = (
      SELECT count(*) FROM tg_groups WHERE bot_id = NEW.bot_id
    ), updated_at = now() WHERE id = NEW.bot_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER tg_groups_bot_count_trigger
  AFTER INSERT OR UPDATE OF bot_id ON tg_groups
  FOR EACH ROW EXECUTE FUNCTION update_bot_groups_count();

-- Handle deletes too
CREATE OR REPLACE FUNCTION update_bot_groups_count_on_delete()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.bot_id IS NOT NULL THEN
    UPDATE crm_bots SET groups_count = (
      SELECT count(*) FROM tg_groups WHERE bot_id = OLD.bot_id
    ), updated_at = now() WHERE id = OLD.bot_id;
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER tg_groups_bot_count_delete_trigger
  AFTER DELETE ON tg_groups
  FOR EACH ROW EXECUTE FUNCTION update_bot_groups_count_on_delete();
