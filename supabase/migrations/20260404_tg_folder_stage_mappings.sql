-- TG Folder Stage Mappings: map Telegram dialog folders to pipeline stages for deal auto-creation
CREATE TABLE IF NOT EXISTS public.tg_folder_stage_mappings (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users NOT NULL,
  tg_folder_id int NOT NULL,
  folder_title text NOT NULL,
  stage_id uuid REFERENCES public.pipeline_stages(id) ON DELETE SET NULL,
  board_type text NOT NULL DEFAULT 'BD' CHECK (board_type IN ('BD', 'Marketing', 'Admin', 'Applications')),
  auto_create boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (user_id, tg_folder_id)
);

ALTER TABLE tg_folder_stage_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own folder stage mappings" ON tg_folder_stage_mappings
  FOR ALL USING (auth.uid() = user_id);

CREATE INDEX idx_tg_folder_stage_mappings_user ON tg_folder_stage_mappings (user_id);
