-- Junction table: link multiple TG conversations to a deal
CREATE TABLE IF NOT EXISTS crm_deal_linked_chats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL REFERENCES crm_deals(id) ON DELETE CASCADE,
  telegram_chat_id bigint NOT NULL,
  chat_type text NOT NULL DEFAULT 'group' CHECK (chat_type IN ('dm', 'group', 'channel', 'supergroup')),
  chat_title text,
  chat_link text,
  is_primary boolean NOT NULL DEFAULT false,
  linked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  linked_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (deal_id, telegram_chat_id)
);

-- Index for fast lookups by deal
CREATE INDEX idx_deal_linked_chats_deal ON crm_deal_linked_chats(deal_id);

-- Ensure only one primary per deal
CREATE UNIQUE INDEX idx_deal_linked_chats_primary
  ON crm_deal_linked_chats(deal_id) WHERE is_primary = true;

-- RLS
ALTER TABLE crm_deal_linked_chats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read linked chats"
  ON crm_deal_linked_chats FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert linked chats"
  ON crm_deal_linked_chats FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update linked chats"
  ON crm_deal_linked_chats FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can delete linked chats"
  ON crm_deal_linked_chats FOR DELETE
  TO authenticated
  USING (true);
