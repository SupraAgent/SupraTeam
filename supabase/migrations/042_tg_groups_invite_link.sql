-- Add invite_link column to tg_groups
ALTER TABLE tg_groups ADD COLUMN IF NOT EXISTS invite_link text;
