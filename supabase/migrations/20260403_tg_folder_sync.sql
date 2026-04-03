-- TG Folder Sync: map CRM slugs to Telegram dialog folders per user
CREATE TABLE IF NOT EXISTS public.tg_folder_sync (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users NOT NULL,
  slug text NOT NULL,
  tg_filter_id int NOT NULL,
  folder_name text NOT NULL,
  last_synced_at timestamptz,
  sync_status text DEFAULT 'active' CHECK (sync_status IN ('active', 'paused', 'error')),
  error_message text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (user_id, slug),
  UNIQUE (user_id, tg_filter_id)
);

ALTER TABLE tg_folder_sync ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own folder syncs" ON tg_folder_sync
  FOR ALL USING (auth.uid() = user_id);

CREATE INDEX idx_tg_folder_sync_user ON tg_folder_sync (user_id);
CREATE INDEX idx_tg_folder_sync_slug ON tg_folder_sync (slug);
