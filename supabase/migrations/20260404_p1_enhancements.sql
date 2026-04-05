-- P1 enhancements: QR→chatbot wiring, voice-to-task support

-- ── Add chatbot_flow_id to QR codes for optional flow triggering ──
ALTER TABLE crm_qr_codes
  ADD COLUMN IF NOT EXISTS chatbot_flow_id uuid REFERENCES crm_chatbot_flows(id) ON DELETE SET NULL;

COMMENT ON COLUMN crm_qr_codes.chatbot_flow_id IS
  'Optional: when set, QR scan triggers this chatbot decision tree instead of TMA apply flow';

-- ── Add source tracking to reminders for voice-to-task ──
ALTER TABLE crm_reminders
  ADD COLUMN IF NOT EXISTS source text DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS source_id text;

COMMENT ON COLUMN crm_reminders.source IS 'Origin of the task: manual, voice_note, chatbot_flow';
COMMENT ON COLUMN crm_reminders.source_id IS 'ID of the source record (e.g., voice transcription ID)';
