-- Telegram Client API integration: per-user MTProto sessions, private contacts, group message sync

-- Telegram client sessions: stores encrypted MTProto session strings per user
CREATE TABLE tg_client_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  session_encrypted TEXT NOT NULL,          -- AES-256-GCM encrypted session string
  phone_number_hash TEXT NOT NULL,          -- SHA-256 of phone number (for display, not plaintext)
  phone_last4 TEXT,                         -- Last 4 digits for UI display
  telegram_user_id BIGINT,                 -- Telegram user ID from this session
  is_active BOOLEAN DEFAULT true,
  connected_at TIMESTAMPTZ DEFAULT now(),
  last_used_at TIMESTAMPTZ DEFAULT now(),
  dc_id INT,                               -- Telegram datacenter
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE tg_client_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own TG sessions"
  ON tg_client_sessions FOR ALL
  USING (auth.uid() = user_id);

-- Private Telegram contacts: imported per-user, only visible to the owner
CREATE TABLE tg_private_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  telegram_user_id BIGINT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  username TEXT,
  phone_hash TEXT,                          -- SHA-256 of phone (privacy)
  phone_last4 TEXT,                         -- Last 4 digits for UI
  photo_small_file_id TEXT,
  is_mutual BOOLEAN DEFAULT false,
  is_deleted BOOLEAN DEFAULT false,
  imported_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, telegram_user_id)
);

ALTER TABLE tg_private_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see ONLY own private contacts"
  ON tg_private_contacts FOR ALL
  USING (auth.uid() = user_id);

CREATE INDEX idx_tg_private_contacts_user ON tg_private_contacts(user_id);
CREATE INDEX idx_tg_private_contacts_tg_id ON tg_private_contacts(telegram_user_id);

-- Shared CRM contacts: contacts that users explicitly share with the CRM
-- (links a private contact to a crm_contact, making it visible to the team)
CREATE TABLE tg_shared_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  private_contact_id UUID REFERENCES tg_private_contacts(id) ON DELETE CASCADE,
  crm_contact_id UUID REFERENCES crm_contacts(id) ON DELETE CASCADE,
  shared_by UUID REFERENCES auth.users(id),
  shared_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(private_contact_id, crm_contact_id)
);

ALTER TABLE tg_shared_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users see shared contacts"
  ON tg_shared_contacts FOR SELECT
  USING (auth.uid() IS NOT NULL);
CREATE POLICY "Users share own contacts"
  ON tg_shared_contacts FOR INSERT
  WITH CHECK (auth.uid() = shared_by);
CREATE POLICY "Users unshare own contacts"
  ON tg_shared_contacts FOR DELETE
  USING (auth.uid() = shared_by);

-- Group message sync: stores messages from CRM-linked Telegram groups
-- (DMs are NEVER stored -- fetched live only)
CREATE TABLE tg_group_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tg_group_id UUID REFERENCES tg_groups(id) ON DELETE CASCADE,
  telegram_message_id BIGINT NOT NULL,
  telegram_chat_id BIGINT NOT NULL,
  sender_telegram_id BIGINT,
  sender_name TEXT,
  message_text TEXT,                        -- plaintext content (media excluded)
  message_type TEXT DEFAULT 'text' CHECK (message_type IN ('text', 'photo', 'document', 'sticker', 'voice', 'video', 'other')),
  reply_to_message_id BIGINT,
  sent_at TIMESTAMPTZ NOT NULL,
  synced_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(telegram_chat_id, telegram_message_id)
);

ALTER TABLE tg_group_messages ENABLE ROW LEVEL SECURITY;
-- Group messages visible to anyone with slug access to that group
CREATE POLICY "Users see messages from accessible groups"
  ON tg_group_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM tg_groups g
      JOIN tg_group_slugs gs ON gs.group_id = g.id
      JOIN crm_user_slug_access usa ON usa.slug = gs.slug
      WHERE g.id = tg_group_messages.tg_group_id
        AND usa.user_id = auth.uid()
    )
    OR
    -- Admin leads see all group messages
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.crm_role = 'admin_lead'
    )
  );

CREATE INDEX idx_tg_group_messages_group ON tg_group_messages(tg_group_id, sent_at DESC);
CREATE INDEX idx_tg_group_messages_chat ON tg_group_messages(telegram_chat_id, telegram_message_id);
CREATE INDEX idx_tg_group_messages_sender ON tg_group_messages(sender_telegram_id);

-- Pending QR login tokens (short-lived, for QR auth flow)
CREATE TABLE tg_qr_login_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  qr_url TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'scanned', 'confirmed', 'expired')),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE tg_qr_login_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own QR tokens"
  ON tg_qr_login_tokens FOR ALL
  USING (auth.uid() = user_id);

-- Audit log for Telegram client actions
CREATE TABLE tg_client_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  action TEXT NOT NULL,  -- 'connect', 'disconnect', 'import_contacts', 'send_message', 'share_contact'
  target_type TEXT,      -- 'user', 'group', 'contact'
  target_id TEXT,        -- telegram ID of target
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE tg_client_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own audit log"
  ON tg_client_audit_log FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "System inserts audit log"
  ON tg_client_audit_log FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE INDEX idx_tg_client_audit_user ON tg_client_audit_log(user_id, created_at DESC);
