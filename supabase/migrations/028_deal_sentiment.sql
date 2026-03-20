-- AI sentiment analysis fields on deals
alter table public.crm_deals
  add column if not exists ai_sentiment jsonb,
  add column if not exists ai_sentiment_at timestamptz;
