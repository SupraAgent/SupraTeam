-- Chat labels: VIP, archived, pinned, muted per user per conversation
CREATE TABLE IF NOT EXISTS crm_chat_labels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  telegram_chat_id BIGINT NOT NULL,
  chat_title TEXT, -- cached for display
  chat_type TEXT, -- private, group, supergroup, channel
  is_vip BOOLEAN NOT NULL DEFAULT false,
  is_archived BOOLEAN NOT NULL DEFAULT false,
  is_pinned BOOLEAN NOT NULL DEFAULT false,
  is_muted BOOLEAN NOT NULL DEFAULT false,
  color_tag TEXT, -- hot_lead, partner, investor, vip_client, urgent, custom
  color_tag_color TEXT, -- hex color for custom tags e.g. #ff6b6b
  note TEXT, -- quick sticky note per conversation
  snoozed_until TIMESTAMPTZ, -- hide until this time, then resurface
  last_user_message_at TIMESTAMPTZ, -- when the CRM user last sent a message
  last_contact_message_at TIMESTAMPTZ, -- when the other party last messaged
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, telegram_chat_id)
);

-- Index for fast lookups
CREATE INDEX idx_chat_labels_user ON crm_chat_labels(user_id);
CREATE INDEX idx_chat_labels_vip ON crm_chat_labels(user_id, is_vip) WHERE is_vip = true;
CREATE INDEX idx_chat_labels_archived ON crm_chat_labels(user_id, is_archived) WHERE is_archived = true;
CREATE INDEX idx_chat_labels_snoozed ON crm_chat_labels(user_id, snoozed_until) WHERE snoozed_until IS NOT NULL;
CREATE INDEX idx_chat_labels_color_tag ON crm_chat_labels(user_id, color_tag) WHERE color_tag IS NOT NULL;

-- RLS
ALTER TABLE crm_chat_labels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own chat labels"
  ON crm_chat_labels FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_chat_labels_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_chat_labels_updated_at
  BEFORE UPDATE ON crm_chat_labels
  FOR EACH ROW EXECUTE FUNCTION update_chat_labels_updated_at();
