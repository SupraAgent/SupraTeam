-- Add builder_type column to distinguish Loop Builder vs classic workflows
-- This avoids loading full JSONB nodes just to check the builder type.
ALTER TABLE crm_workflows ADD COLUMN IF NOT EXISTS builder_type TEXT DEFAULT 'classic';

-- Also add message_full_text column to notification log for retry with full text
ALTER TABLE crm_notification_log ADD COLUMN IF NOT EXISTS message_full_text TEXT;
