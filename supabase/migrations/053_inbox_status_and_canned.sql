-- Feature 1: Actionable Inbox — conversation status + canned responses

-- 1b: Conversation status tracking
CREATE TABLE IF NOT EXISTS crm_inbox_status (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  chat_id BIGINT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'snoozed', 'closed')),
  assigned_to UUID REFERENCES auth.users(id),
  snoozed_until TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id),
  UNIQUE(chat_id)
);

ALTER TABLE crm_inbox_status ENABLE ROW LEVEL SECURITY;
CREATE POLICY crm_inbox_status_all ON crm_inbox_status
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX idx_inbox_status_assigned ON crm_inbox_status(assigned_to) WHERE status != 'closed';
CREATE INDEX idx_inbox_status_snoozed ON crm_inbox_status(snoozed_until) WHERE status = 'snoozed';

-- 1c: Canned responses
CREATE TABLE IF NOT EXISTS crm_canned_responses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  shortcut TEXT,
  category TEXT,
  created_by UUID REFERENCES auth.users(id) NOT NULL,
  usage_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE crm_canned_responses ENABLE ROW LEVEL SECURITY;
CREATE POLICY crm_canned_responses_all ON crm_canned_responses
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX idx_canned_shortcut ON crm_canned_responses(shortcut) WHERE shortcut IS NOT NULL;

-- Atomic usage count increment (avoids read-then-write race condition)
CREATE OR REPLACE FUNCTION increment_canned_usage(row_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE crm_canned_responses
  SET usage_count = usage_count + 1
  WHERE id = row_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Auto un-snooze: reopen expired snoozed conversations
-- Called by the status GET endpoint; can also be run via pg_cron
CREATE OR REPLACE FUNCTION unsnooze_expired()
RETURNS void AS $$
BEGIN
  UPDATE crm_inbox_status
  SET status = 'open', snoozed_until = NULL, updated_at = now()
  WHERE status = 'snoozed' AND snoozed_until <= now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
