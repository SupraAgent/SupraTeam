-- Track delivery status and retry attempts for stage-change notifications
ALTER TABLE crm_deal_stage_history
  ADD COLUMN IF NOT EXISTS delivery_status text DEFAULT NULL
    CHECK (delivery_status IN ('delivered', 'failed')),
  ADD COLUMN IF NOT EXISTS delivery_attempts integer DEFAULT 0;

COMMENT ON COLUMN crm_deal_stage_history.delivery_status IS 'Notification delivery result: delivered or failed after max retries';
COMMENT ON COLUMN crm_deal_stage_history.delivery_attempts IS 'Number of Telegram API send attempts';
