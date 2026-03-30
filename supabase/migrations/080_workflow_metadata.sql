-- Add metadata JSONB column to crm_workflows for storing webhook secrets, last payload, etc.
ALTER TABLE crm_workflows ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';
