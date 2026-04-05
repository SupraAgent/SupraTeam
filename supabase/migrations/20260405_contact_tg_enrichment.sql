-- Add Telegram enrichment fields to crm_contacts
ALTER TABLE crm_contacts
  ADD COLUMN IF NOT EXISTS tg_bio text,
  ADD COLUMN IF NOT EXISTS tg_photo_url text;
