-- Migration: Ensure all A1 workflows have explicit builder_type
-- A1 workflows defaulted to 'classic', Loop/A2 workflows are explicitly 'loop'
-- After this, the A1 page should filter by builder_type = 'classic'

-- Set builder_type for any workflows that still have the default
UPDATE crm_workflows
SET builder_type = 'classic'
WHERE builder_type IS NULL OR builder_type = '';

-- Add NOT NULL constraint now that all rows have a value
ALTER TABLE crm_workflows
ALTER COLUMN builder_type SET NOT NULL;

-- Add check constraint for valid builder types
ALTER TABLE crm_workflows
ADD CONSTRAINT crm_workflows_builder_type_check
CHECK (builder_type IN ('classic', 'loop'));
