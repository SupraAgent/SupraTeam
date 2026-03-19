-- Email connections: stores OAuth tokens for Gmail/Outlook per user
CREATE TABLE crm_email_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('gmail', 'outlook')),
  email TEXT NOT NULL,
  access_token_encrypted TEXT NOT NULL,
  refresh_token_encrypted TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ,
  scopes TEXT[],
  is_default BOOLEAN DEFAULT false,
  connected_at TIMESTAMPTZ DEFAULT now(),
  last_sync_at TIMESTAMPTZ,
  sync_state JSONB DEFAULT '{}',
  writing_style_json JSONB,
  UNIQUE(user_id, email)
);

ALTER TABLE crm_email_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own email connections"
  ON crm_email_connections FOR ALL
  USING (auth.uid() = user_id);

-- Thread ↔ Deal/Contact links (E3)
CREATE TABLE crm_email_thread_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  email_account TEXT NOT NULL,
  deal_id UUID REFERENCES crm_deals(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES crm_contacts(id) ON DELETE SET NULL,
  linked_at TIMESTAMPTZ DEFAULT now(),
  linked_by UUID REFERENCES auth.users(id),
  auto_linked BOOLEAN DEFAULT false
);

ALTER TABLE crm_email_thread_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own thread links"
  ON crm_email_thread_links FOR ALL
  USING (auth.uid() = linked_by);

CREATE INDEX idx_thread_links_deal ON crm_email_thread_links(deal_id);
CREATE INDEX idx_thread_links_contact ON crm_email_thread_links(contact_id);
CREATE INDEX idx_thread_links_thread ON crm_email_thread_links(thread_id);

-- Scheduled email actions: send later, snooze, follow-up reminders (E5)
CREATE TABLE crm_email_scheduled (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  connection_id UUID REFERENCES crm_email_connections(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('send_later', 'snooze', 'follow_up_reminder')),
  thread_id TEXT,
  draft_data JSONB,
  scheduled_for TIMESTAMPTZ NOT NULL,
  executed_at TIMESTAMPTZ,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'executed', 'cancelled')),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE crm_email_scheduled ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own scheduled emails"
  ON crm_email_scheduled FOR ALL
  USING (auth.uid() = user_id);

CREATE INDEX idx_scheduled_pending
  ON crm_email_scheduled(scheduled_for)
  WHERE status = 'pending';

-- Email templates (E6)
CREATE TABLE crm_email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  subject TEXT,
  body TEXT NOT NULL,
  variables TEXT[] DEFAULT '{}',
  board_type TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE crm_email_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users manage templates"
  ON crm_email_templates FOR ALL
  USING (auth.uid() IS NOT NULL);

-- Email sequences (E6)
CREATE TABLE crm_email_sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  steps JSONB NOT NULL,
  board_type TEXT,
  created_by UUID REFERENCES auth.users(id),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE crm_email_sequences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users manage sequences"
  ON crm_email_sequences FOR ALL
  USING (auth.uid() IS NOT NULL);

-- Sequence enrollments (E6)
CREATE TABLE crm_email_sequence_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id UUID REFERENCES crm_email_sequences(id) ON DELETE CASCADE,
  deal_id UUID REFERENCES crm_deals(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES crm_contacts(id) ON DELETE CASCADE,
  current_step INT DEFAULT 0,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'replied', 'bounced')),
  next_send_at TIMESTAMPTZ,
  enrolled_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

ALTER TABLE crm_email_sequence_enrollments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users manage enrollments"
  ON crm_email_sequence_enrollments FOR ALL
  USING (auth.uid() IS NOT NULL);

CREATE INDEX idx_enrollments_next_send
  ON crm_email_sequence_enrollments(next_send_at)
  WHERE status = 'active';

-- Email audit log (security recommendation)
CREATE TABLE crm_email_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  action TEXT NOT NULL,
  thread_id TEXT,
  recipient TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE crm_email_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own audit log"
  ON crm_email_audit_log FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "System inserts audit log"
  ON crm_email_audit_log FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);
