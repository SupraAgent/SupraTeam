-- Deal <-> Telegram Conversation many-to-many junction table
-- Replaces the single telegram_chat_id on crm_deals with a proper junction
-- Old columns (telegram_chat_id, telegram_chat_name, telegram_chat_link) kept for backward compat

CREATE TABLE crm_deal_linked_chats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL REFERENCES crm_deals(id) ON DELETE CASCADE,
  telegram_chat_id bigint NOT NULL,
  chat_type text NOT NULL CHECK (chat_type IN ('dm', 'group', 'channel', 'supergroup')),
  chat_title text,
  chat_link text,
  is_primary boolean DEFAULT false,
  linked_by uuid REFERENCES auth.users(id),
  linked_at timestamptz DEFAULT now(),
  UNIQUE(deal_id, telegram_chat_id)
);

CREATE INDEX idx_deal_linked_chats_deal ON crm_deal_linked_chats(deal_id);
CREATE INDEX idx_deal_linked_chats_chat ON crm_deal_linked_chats(telegram_chat_id);

-- RLS
ALTER TABLE crm_deal_linked_chats ENABLE ROW LEVEL SECURITY;

-- Policies match crm_deals pattern: authenticated users with role-based access
CREATE POLICY "crm_deal_linked_chats_select" ON crm_deal_linked_chats FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "crm_deal_linked_chats_insert" ON crm_deal_linked_chats FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "crm_deal_linked_chats_update" ON crm_deal_linked_chats FOR UPDATE TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "crm_deal_linked_chats_delete" ON crm_deal_linked_chats FOR DELETE TO authenticated
  USING (auth.uid() IS NOT NULL);

-- Data migration: copy existing telegram_chat_id links into the junction table
INSERT INTO crm_deal_linked_chats (deal_id, telegram_chat_id, chat_type, chat_title, chat_link, is_primary, linked_by)
SELECT
  id,
  telegram_chat_id,
  'group',  -- default to group since we don't have the type stored
  telegram_chat_name,
  telegram_chat_link,
  true,     -- mark existing links as primary
  created_by
FROM crm_deals
WHERE telegram_chat_id IS NOT NULL;
