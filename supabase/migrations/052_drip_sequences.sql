-- Stage 4a: Bot Drip Sequences — event-triggered, bot-initiated messaging
-- Unlike outreach sequences (manual enrollment), drips fire automatically from TG events.

CREATE TABLE IF NOT EXISTS crm_drip_sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  trigger_event TEXT NOT NULL CHECK (trigger_event IN (
    'group_join',       -- User joins a TG group where bot is admin
    'first_message',    -- User sends first message in a group
    'keyword_match',    -- Message contains a keyword
    'silence_48h',      -- No message from user in 48h after last activity
    'engagement_drop'   -- Contact engagement score drops below threshold
  )),
  trigger_config JSONB DEFAULT '{}',  -- e.g. { keywords: ["pricing","demo"], group_ids: [...], threshold: 30 }
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused')),
  board_type TEXT,                     -- Optional: only for deals on this board
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS crm_drip_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id UUID REFERENCES crm_drip_sequences(id) ON DELETE CASCADE NOT NULL,
  step_number INT NOT NULL,
  step_type TEXT DEFAULT 'message' CHECK (step_type IN ('message', 'wait', 'condition')),
  delay_hours NUMERIC DEFAULT 0,      -- 0 = send immediately
  message_template TEXT NOT NULL DEFAULT '',
  condition_type TEXT,
  condition_config JSONB DEFAULT '{}',
  on_true_step INT,
  on_false_step INT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(sequence_id, step_number)
);

CREATE TABLE IF NOT EXISTS crm_drip_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id UUID REFERENCES crm_drip_sequences(id) ON DELETE CASCADE NOT NULL,
  tg_user_id BIGINT NOT NULL,          -- Telegram user who triggered the drip
  tg_chat_id BIGINT NOT NULL,          -- Chat where the trigger occurred
  contact_id UUID REFERENCES crm_contacts(id) ON DELETE SET NULL,
  deal_id UUID REFERENCES crm_deals(id) ON DELETE SET NULL,
  current_step INT DEFAULT 1,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'paused', 'cancelled')),
  next_send_at TIMESTAMPTZ,
  last_reply_at TIMESTAMPTZ,
  reply_count INT DEFAULT 0,
  trigger_event TEXT NOT NULL,
  trigger_data JSONB DEFAULT '{}',     -- Snapshot of what triggered enrollment
  enrolled_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS crm_drip_step_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id UUID REFERENCES crm_drip_enrollments(id) ON DELETE CASCADE NOT NULL,
  step_id UUID REFERENCES crm_drip_steps(id) ON DELETE SET NULL,
  status TEXT NOT NULL CHECK (status IN ('sent', 'failed', 'evaluated', 'skipped')),
  error TEXT,
  metadata JSONB,
  sent_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_drip_enrollments_active
  ON crm_drip_enrollments(status, next_send_at)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_drip_enrollments_user_seq
  ON crm_drip_enrollments(tg_user_id, sequence_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_drip_sequences_trigger
  ON crm_drip_sequences(trigger_event, status)
  WHERE status = 'active';

-- Atomic reply count increment for drip enrollments (mirrors outreach RPC)
CREATE OR REPLACE FUNCTION increment_drip_enrollment_reply(p_enrollment_id UUID)
RETURNS VOID
LANGUAGE sql
AS $$
  UPDATE crm_drip_enrollments
  SET reply_count = COALESCE(reply_count, 0) + 1,
      last_reply_at = now()
  WHERE id = p_enrollment_id;
$$;

-- RLS
ALTER TABLE crm_drip_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_drip_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_drip_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_drip_step_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY drip_seq_select ON crm_drip_sequences FOR SELECT TO authenticated USING (true);
CREATE POLICY drip_seq_modify ON crm_drip_sequences FOR ALL TO authenticated
  USING (auth.uid() = created_by OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND crm_role = 'admin_lead'));

CREATE POLICY drip_steps_select ON crm_drip_steps FOR SELECT TO authenticated USING (true);
CREATE POLICY drip_enrollments_select ON crm_drip_enrollments FOR SELECT TO authenticated USING (true);
CREATE POLICY drip_log_select ON crm_drip_step_log FOR SELECT TO authenticated USING (true);
