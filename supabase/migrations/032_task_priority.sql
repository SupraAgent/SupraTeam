-- Add priority column to tasks/reminders
ALTER TABLE crm_deal_reminders
  ADD COLUMN IF NOT EXISTS priority text DEFAULT 'normal'
  CHECK (priority IN ('urgent', 'high', 'normal', 'low'));

-- Index for priority-based sorting
CREATE INDEX IF NOT EXISTS idx_deal_reminders_priority
  ON crm_deal_reminders (priority, due_at)
  WHERE is_dismissed = false;
