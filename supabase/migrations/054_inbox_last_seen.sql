-- G1: Unread indicators — track when each user last viewed each conversation
CREATE TABLE IF NOT EXISTS crm_inbox_last_seen (
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  chat_id BIGINT NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, chat_id)
);

ALTER TABLE crm_inbox_last_seen ENABLE ROW LEVEL SECURITY;
CREATE POLICY crm_inbox_last_seen_own ON crm_inbox_last_seen
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
