-- Voice Transcriptions: stores Telegram voice message transcriptions with AI analysis
create table if not exists crm_voice_transcriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete set null,
  chat_id bigint not null,
  message_id bigint not null,
  telegram_file_id text not null,
  duration_seconds int,
  file_size_bytes int,
  transcription_text text,
  transcription_status text not null default 'pending'
    check (transcription_status in ('pending', 'processing', 'completed', 'failed')),
  language text,
  confidence_score numeric,
  action_items jsonb default '[]'::jsonb,
  sentiment text check (sentiment in ('positive', 'neutral', 'negative')),
  summary text,
  linked_deal_id uuid references crm_deals(id) on delete set null,
  linked_contact_id uuid references crm_contacts(id) on delete set null,
  error_message text,
  created_at timestamptz not null default now(),
  transcribed_at timestamptz,
  updated_at timestamptz not null default now()
);

-- Full-text search index on transcription text
create index idx_voice_transcriptions_fts
  on crm_voice_transcriptions
  using gin (to_tsvector('english', coalesce(transcription_text, '')));

-- Lookup by chat + message
create unique index idx_voice_transcriptions_chat_msg
  on crm_voice_transcriptions (chat_id, message_id);

-- Lookup by linked deal
create index idx_voice_transcriptions_deal
  on crm_voice_transcriptions (linked_deal_id)
  where linked_deal_id is not null;

-- Lookup by user
create index idx_voice_transcriptions_user
  on crm_voice_transcriptions (user_id);

-- RLS
alter table crm_voice_transcriptions enable row level security;

create policy "Users can view own transcriptions"
  on crm_voice_transcriptions for select
  using (user_id = auth.uid());

create policy "Users can insert own transcriptions"
  on crm_voice_transcriptions for insert
  with check (user_id = auth.uid());

create policy "Users can update own transcriptions"
  on crm_voice_transcriptions for update
  using (user_id = auth.uid());

-- Service role (bot) can insert/update any row via admin client (bypasses RLS)
