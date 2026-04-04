-- Feature suggestions v2: module-based categories, pain level, workaround, close reason, shipped status

-- Drop the old category CHECK and replace with module-based values
ALTER TABLE crm_feature_suggestions
  DROP CONSTRAINT IF EXISTS crm_feature_suggestions_category_check;

ALTER TABLE crm_feature_suggestions
  ADD CONSTRAINT crm_feature_suggestions_category_check
  CHECK (category IN (
    'platform', 'telegram', 'email', 'pipeline', 'inbox',
    'tg_groups', 'contacts', 'companies', 'automation',
    'calendar', 'broadcasts', 'outreach', 'settings', 'tma'
  ));

-- Update any existing 'other', 'ux', 'reporting', 'integration' rows to 'platform'
UPDATE crm_feature_suggestions
  SET category = 'platform'
  WHERE category IN ('other', 'ux', 'reporting', 'integration');

-- Drop old status CHECK and add 'shipped' + 'planned'
ALTER TABLE crm_feature_suggestions
  DROP CONSTRAINT IF EXISTS crm_feature_suggestions_status_check;

ALTER TABLE crm_feature_suggestions
  ADD CONSTRAINT crm_feature_suggestions_status_check
  CHECK (status IN ('pending', 'evaluating', 'approved', 'planned', 'shipped', 'deferred', 'rejected'));

-- Add new columns
ALTER TABLE crm_feature_suggestions
  ADD COLUMN IF NOT EXISTS suggestion_type TEXT DEFAULT 'improvement'
    CHECK (suggestion_type IN ('bug', 'improvement', 'feature')),
  ADD COLUMN IF NOT EXISTS pain_level TEXT DEFAULT 'nice_to_have'
    CHECK (pain_level IN ('nice_to_have', 'slows_me_down', 'blocks_my_work')),
  ADD COLUMN IF NOT EXISTS workaround TEXT,
  ADD COLUMN IF NOT EXISTS close_reason TEXT;
