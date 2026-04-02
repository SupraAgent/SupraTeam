-- Telegram Chat Groups: user-created folders for organizing TG conversations.
-- Chats and contacts can be dragged into groups for quick filtering.

-- ── Groups ──────────────────────────────────────────────────
create table if not exists crm_tg_chat_groups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) > 0 and length(name) <= 100),
  color text not null default '#3b82f6' check (color ~* '^#[0-9a-f]{6}$'),
  icon text default null,
  position int not null default 0,
  is_collapsed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, name)
);

alter table crm_tg_chat_groups enable row level security;

create policy "Users manage own tg chat groups"
  on crm_tg_chat_groups for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index idx_tg_chat_groups_user on crm_tg_chat_groups(user_id, position);

create or replace function trg_tg_chat_groups_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger set_tg_chat_groups_updated_at
  before update on crm_tg_chat_groups
  for each row execute function trg_tg_chat_groups_updated_at();

-- ── Group Members (junction: group <-> telegram chat) ───────
create table if not exists crm_tg_chat_group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references crm_tg_chat_groups(id) on delete cascade,
  telegram_chat_id bigint not null,
  chat_title text,
  added_at timestamptz not null default now(),
  unique(group_id, telegram_chat_id)
);

alter table crm_tg_chat_group_members enable row level security;

create policy "Users manage own tg chat group members"
  on crm_tg_chat_group_members for all
  using (
    exists (
      select 1 from crm_tg_chat_groups g
      where g.id = crm_tg_chat_group_members.group_id
        and g.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from crm_tg_chat_groups g
      where g.id = crm_tg_chat_group_members.group_id
        and g.user_id = auth.uid()
    )
  );

create index idx_tg_chat_group_members_group on crm_tg_chat_group_members(group_id);
create index idx_tg_chat_group_members_chat on crm_tg_chat_group_members(telegram_chat_id);

-- ── Group Contacts (junction: group <-> CRM contact) ────────
create table if not exists crm_tg_chat_group_contacts (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references crm_tg_chat_groups(id) on delete cascade,
  contact_id uuid not null references crm_contacts(id) on delete cascade,
  added_at timestamptz not null default now(),
  unique(group_id, contact_id)
);

alter table crm_tg_chat_group_contacts enable row level security;

create policy "Users manage own tg chat group contacts"
  on crm_tg_chat_group_contacts for all
  using (
    exists (
      select 1 from crm_tg_chat_groups g
      where g.id = crm_tg_chat_group_contacts.group_id
        and g.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from crm_tg_chat_groups g
      where g.id = crm_tg_chat_group_contacts.group_id
        and g.user_id = auth.uid()
    )
  );

create index idx_tg_chat_group_contacts_group on crm_tg_chat_group_contacts(group_id);
create index idx_tg_chat_group_contacts_contact on crm_tg_chat_group_contacts(contact_id);

-- ── Atomic group creation with count guard ─────────────────
create or replace function create_tg_chat_group(
  p_name text,
  p_color text default '#3b82f6',
  p_icon text default null,
  p_max_groups int default 50
) returns uuid as $$
declare
  v_uid uuid := auth.uid();
  v_count int;
  v_next_pos int;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'UNAUTHORIZED';
  end if;

  -- Lock the user's groups to prevent concurrent inserts
  perform 1 from crm_tg_chat_groups where user_id = v_uid for update;

  select count(*) into v_count from crm_tg_chat_groups where user_id = v_uid;
  if v_count >= p_max_groups then
    raise exception 'MAX_GROUPS_EXCEEDED';
  end if;

  select coalesce(max(position), -1) + 1 into v_next_pos
  from crm_tg_chat_groups where user_id = v_uid;

  insert into crm_tg_chat_groups (user_id, name, color, icon, position)
  values (v_uid, p_name, p_color, p_icon, v_next_pos)
  returning id into v_id;

  return v_id;
end;
$$ language plpgsql security definer;
