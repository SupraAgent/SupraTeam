-- Telegram Folder Sync: mirror native TG folders into the CRM
-- Builds on top of the existing tg_folder_sync table (slug-based mapping).
-- This migration adds full folder + chat tracking for the folder sync feature.

-- ── crm_tg_folders: user's synced Telegram folders ──────────────
CREATE TABLE IF NOT EXISTS public.crm_tg_folders (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users NOT NULL,
  telegram_folder_id int NOT NULL,
  folder_name text NOT NULL,
  folder_emoji text,
  include_peers jsonb DEFAULT '[]'::jsonb,
  exclude_peers jsonb DEFAULT '[]'::jsonb,
  is_synced boolean DEFAULT true,
  sync_interval_minutes int DEFAULT 30,
  last_synced_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE crm_tg_folders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own TG folders" ON crm_tg_folders
  FOR ALL USING (auth.uid() = user_id);

CREATE UNIQUE INDEX idx_crm_tg_folders_user_tg ON crm_tg_folders (user_id, telegram_folder_id);
CREATE INDEX idx_crm_tg_folders_user ON crm_tg_folders (user_id);

-- ── crm_tg_folder_chats: chats within each synced folder ────────
CREATE TABLE IF NOT EXISTS public.crm_tg_folder_chats (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  folder_id uuid REFERENCES crm_tg_folders ON DELETE CASCADE NOT NULL,
  chat_id bigint NOT NULL,
  chat_title text,
  chat_type text,
  unread_count int DEFAULT 0,
  last_message_at timestamptz,
  is_pinned boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE crm_tg_folder_chats ENABLE ROW LEVEL SECURITY;

-- RLS via parent folder ownership
CREATE POLICY "Users manage own folder chats" ON crm_tg_folder_chats
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM crm_tg_folders
      WHERE crm_tg_folders.id = crm_tg_folder_chats.folder_id
        AND crm_tg_folders.user_id = auth.uid()
    )
  );

CREATE UNIQUE INDEX idx_crm_tg_folder_chats_folder_chat ON crm_tg_folder_chats (folder_id, chat_id);
CREATE INDEX idx_crm_tg_folder_chats_folder ON crm_tg_folder_chats (folder_id);

-- ── updated_at trigger ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_crm_tg_folders_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_crm_tg_folders_updated_at
  BEFORE UPDATE ON crm_tg_folders
  FOR EACH ROW
  EXECUTE FUNCTION update_crm_tg_folders_updated_at();
