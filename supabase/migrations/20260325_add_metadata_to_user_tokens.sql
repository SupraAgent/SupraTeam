ALTER TABLE user_tokens ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT null;
