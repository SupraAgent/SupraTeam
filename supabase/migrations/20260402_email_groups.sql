-- Email Groups: user-created groups for organizing email threads
-- Scoped per email connection so each account has its own groups.
-- Threads can be dragged into groups; future emails from primary contacts auto-route.

-- ── Groups ──────────────────────────────────────────────────
create table if not exists crm_email_groups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  connection_id uuid not null references crm_email_connections(id) on delete cascade,
  name text not null check (length(trim(name)) > 0 and length(name) <= 100),
  color text not null default '#3b82f6' check (color ~* '^#[0-9a-f]{6}$'),
  position int not null default 0,
  is_collapsed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(connection_id, name)
);

alter table crm_email_groups enable row level security;

create policy "Users manage own email groups"
  on crm_email_groups for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index idx_email_groups_conn on crm_email_groups(connection_id, position);

-- Auto-update updated_at on row changes
create or replace function trg_email_groups_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger set_email_groups_updated_at
  before update on crm_email_groups
  for each row execute function trg_email_groups_updated_at();

-- ── Group Threads (junction) ────────────────────────────────
create table if not exists crm_email_group_threads (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references crm_email_groups(id) on delete cascade,
  thread_id text not null check (length(trim(thread_id)) > 0),
  subject text,
  snippet text,
  from_email text,
  from_name text,
  last_message_at timestamptz,
  added_at timestamptz not null default now(),
  auto_added boolean not null default false,
  unique(group_id, thread_id)
);

alter table crm_email_group_threads enable row level security;

create policy "Users manage own group threads"
  on crm_email_group_threads for all
  using (
    exists (
      select 1 from crm_email_groups g
      where g.id = crm_email_group_threads.group_id
        and g.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from crm_email_groups g
      where g.id = crm_email_group_threads.group_id
        and g.user_id = auth.uid()
    )
  );

create index idx_email_group_threads_group on crm_email_group_threads(group_id, last_message_at desc);
create index idx_email_group_threads_thread on crm_email_group_threads(thread_id);

-- ── Auto-route contacts ─────────────────────────────────────
-- When a primary sender (not CC) in a grouped thread sends new mail,
-- that thread auto-routes to the same group.
create table if not exists crm_email_group_contacts (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references crm_email_groups(id) on delete cascade,
  email text not null check (email ~* '^[^@]+@[^@]+$'),
  name text,
  added_at timestamptz not null default now(),
  unique(group_id, email)
);

alter table crm_email_group_contacts enable row level security;

create policy "Users manage own group contacts"
  on crm_email_group_contacts for all
  using (
    exists (
      select 1 from crm_email_groups g
      where g.id = crm_email_group_contacts.group_id
        and g.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from crm_email_groups g
      where g.id = crm_email_group_contacts.group_id
        and g.user_id = auth.uid()
    )
  );

create index idx_email_group_contacts_email on crm_email_group_contacts(email);
create index idx_email_group_contacts_group on crm_email_group_contacts(group_id);

-- ── Atomic group insert (avoids position race condition) ────
-- Uses auth.uid() to prevent caller from inserting groups for other users.
create or replace function insert_email_group_atomic(
  p_user_id uuid,
  p_connection_id uuid,
  p_name text,
  p_color text default '#3b82f6'
)
returns crm_email_groups as $$
declare
  result crm_email_groups;
begin
  -- Verify the caller is the user they claim to be
  if auth.uid() is distinct from p_user_id then
    raise exception 'Unauthorized: user_id mismatch';
  end if;

  insert into crm_email_groups (user_id, connection_id, name, color, position)
  values (
    p_user_id,
    p_connection_id,
    p_name,
    p_color,
    coalesce((select max(position) + 1 from crm_email_groups where connection_id = p_connection_id and user_id = p_user_id), 0)
  )
  returning * into result;
  return result;
end;
$$ language plpgsql;
