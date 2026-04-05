-- Opt-in server-side message indexing for bulk search/analytics.
-- Default: zero-knowledge (no server-side message storage).
-- Users explicitly consent to sync message indexes for search capability.

-- ── Indexing Config (per-user opt-in) ────────────────────────

create table if not exists crm_message_index_config (
  user_id uuid primary key references profiles(id) on delete cascade,
  indexing_enabled boolean not null default false,
  consent_given_at timestamptz,
  indexed_chats bigint[] default '{}',
  exclude_chats bigint[] default '{}',
  retention_days int not null default 90 check (retention_days >= 1 and retention_days <= 730),
  last_full_sync_at timestamptz,
  encryption_key_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table crm_message_index_config enable row level security;

create policy "Users manage own indexing config"
  on crm_message_index_config for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create or replace function trg_crm_message_index_config_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger set_crm_message_index_config_updated_at
  before update on crm_message_index_config
  for each row execute function trg_crm_message_index_config_updated_at();

-- ── Message Index ────────────────────────────────────────────

create table if not exists crm_message_index (
  id bigint generated always as identity primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  chat_id bigint not null,
  message_id bigint not null,
  sender_id bigint,
  sender_name text,
  message_text text,
  message_type text not null default 'text'
    check (message_type in ('text', 'photo', 'video', 'document', 'voice', 'sticker')),
  has_media boolean not null default false,
  reply_to_message_id bigint,
  sent_at timestamptz not null,
  indexed_at timestamptz not null default now(),
  -- Full-text search vector, auto-populated from message_text
  search_vector tsvector generated always as (
    to_tsvector('english', coalesce(message_text, ''))
  ) stored
);

alter table crm_message_index enable row level security;

create policy "Users access own indexed messages"
  on crm_message_index for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Primary lookup: user's messages in a chat ordered by time
create index idx_crm_message_index_user_chat_sent
  on crm_message_index(user_id, chat_id, sent_at desc);

-- Deduplication: prevent double-indexing the same message
create unique index idx_crm_message_index_unique_msg
  on crm_message_index(user_id, chat_id, message_id);

-- Full-text search index
create index idx_crm_message_index_search
  on crm_message_index using gin(search_vector);

-- Retention cleanup index
create index idx_crm_message_index_indexed_at
  on crm_message_index(user_id, indexed_at);

-- ── Auto-Cleanup Function ────────────────────────────────────

create or replace function crm_cleanup_expired_indexed_messages()
returns void as $$
begin
  delete from crm_message_index m
  using crm_message_index_config c
  where m.user_id = c.user_id
    and m.indexed_at < now() - make_interval(days => c.retention_days);
end;
$$ language plpgsql security definer;

-- Schedule via pg_cron (if available) or call from application cron:
-- select cron.schedule('cleanup-indexed-messages', '0 3 * * *', 'select crm_cleanup_expired_indexed_messages()');

comment on table crm_message_index is 'Opt-in server-side message index. Users must explicitly enable indexing — ZK architecture is the default.';
comment on table crm_message_index_config is 'Per-user opt-in configuration for message indexing. indexing_enabled=false by default.';
