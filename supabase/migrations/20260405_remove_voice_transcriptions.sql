-- Remove voice transcriptions feature (Task 0.3)
-- Crypto BD doesn't happen through voice memos; Fireflies covers call recording.
DROP TABLE IF EXISTS crm_voice_transcriptions CASCADE;
