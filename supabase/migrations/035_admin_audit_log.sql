-- Admin audit log for tracking role changes, member removals, etc.

create table if not exists public.crm_audit_log (
  id uuid default gen_random_uuid() primary key,
  actor_id uuid not null references auth.users(id),
  action text not null,
  target_id uuid references auth.users(id),
  details jsonb default '{}',
  created_at timestamptz default now()
);

create index idx_audit_log_actor on public.crm_audit_log (actor_id);
create index idx_audit_log_created on public.crm_audit_log (created_at desc);
create index idx_audit_log_action on public.crm_audit_log (action);

alter table public.crm_audit_log enable row level security;

create policy "Authenticated users can read audit log"
  on public.crm_audit_log for select
  using (auth.uid() is not null);

create policy "Authenticated users can insert audit log"
  on public.crm_audit_log for insert
  with check (auth.uid() is not null);
