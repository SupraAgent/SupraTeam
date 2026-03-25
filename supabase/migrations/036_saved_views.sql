-- Saved views: persistent filter configurations per user per page
CREATE TABLE IF NOT EXISTS crm_saved_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  page TEXT NOT NULL,          -- 'pipeline' | 'contacts'
  filters JSONB NOT NULL DEFAULT '{}',
  board_type TEXT,             -- for pipeline views: 'All' | 'BD' | 'Marketing' | 'Admin'
  is_default BOOLEAN NOT NULL DEFAULT false,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_saved_views_user_page ON crm_saved_views(user_id, page);

ALTER TABLE crm_saved_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own views"
  ON crm_saved_views FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
