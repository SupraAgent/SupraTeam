-- Allow telegram_bot provider patterns in user_tokens
-- The existing constraint only allows specific providers from SupraVibe
-- We need to support telegram_bot_XXXXXX pattern for multi-bot registration

ALTER TABLE user_tokens DROP CONSTRAINT IF EXISTS user_tokens_provider_check;

ALTER TABLE user_tokens ADD CONSTRAINT user_tokens_provider_check
  CHECK (provider IN ('github', 'vercel', 'supabase', 'telegram_bot', 'slack') OR provider LIKE 'telegram_bot_%');
