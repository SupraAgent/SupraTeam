-- Feature suggestion system with CPO AI evaluation

CREATE TABLE crm_feature_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  submitted_by UUID REFERENCES auth.users ON DELETE SET NULL,
  submitted_by_name TEXT,
  category TEXT DEFAULT 'other' CHECK (category IN ('ux', 'telegram', 'pipeline', 'automation', 'reporting', 'integration', 'other')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'evaluating', 'approved', 'deferred', 'rejected')),
  cpo_score INTEGER CHECK (cpo_score >= 0 AND cpo_score <= 100),
  cpo_analysis TEXT,
  cpo_priority TEXT CHECK (cpo_priority IN ('p0', 'p1', 'p2', 'p3')),
  cpo_effort TEXT CHECK (cpo_effort IN ('low', 'medium', 'high')),
  cpo_impact TEXT CHECK (cpo_impact IN ('low', 'medium', 'high')),
  cpo_evaluated_at TIMESTAMPTZ,
  upvotes INTEGER DEFAULT 0,
  upvoted_by UUID[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for listing by status and score
CREATE INDEX idx_suggestions_status ON crm_feature_suggestions (status, cpo_score DESC NULLS LAST);
CREATE INDEX idx_suggestions_created ON crm_feature_suggestions (created_at DESC);

-- RLS
ALTER TABLE crm_feature_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view suggestions"
  ON crm_feature_suggestions FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can insert suggestions"
  ON crm_feature_suggestions FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update suggestions"
  ON crm_feature_suggestions FOR UPDATE
  USING (auth.uid() IS NOT NULL);
