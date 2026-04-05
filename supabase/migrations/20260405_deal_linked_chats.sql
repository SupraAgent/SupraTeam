-- Junction table: deals linked to Telegram chats (many-to-many)
CREATE TABLE IF NOT EXISTS crm_deal_linked_chats (
  deal_id       uuid        NOT NULL REFERENCES crm_deals(id) ON DELETE CASCADE,
  telegram_chat_id bigint   NOT NULL,
  chat_type     text        NOT NULL DEFAULT 'group' CHECK (chat_type IN ('group','supergroup','channel','private')),
  chat_title    text,
  chat_link     text,
  is_primary    boolean     NOT NULL DEFAULT false,
  linked_by     uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  linked_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (deal_id, telegram_chat_id)
);

-- Index for looking up deals by chat
CREATE INDEX IF NOT EXISTS idx_deal_linked_chats_chat_id
  ON crm_deal_linked_chats (telegram_chat_id);

-- RLS
ALTER TABLE crm_deal_linked_chats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read deal linked chats"
  ON crm_deal_linked_chats FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert deal linked chats"
  ON crm_deal_linked_chats FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete deal linked chats"
  ON crm_deal_linked_chats FOR DELETE
  TO authenticated
  USING (true);
