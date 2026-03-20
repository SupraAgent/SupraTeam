-- Migration 018: Access control improvements
-- Enhanced audit logging, role enforcement tracking

-- Make audit log more comprehensive by logging ALL access operations (not just bulk)
alter table crm_slug_access_log
  add column if not exists action_detail text,
  add column if not exists ip_address text;

-- Add a general CRM audit log for all sensitive operations
create table if not exists crm_audit_log (
  id uuid primary key default gen_random_uuid(),
  action text not null,          -- 'grant_access', 'revoke_access', 'bulk_add', 'bulk_remove', 'template_edit', 'automation_create', 'broadcast_sent', 'deal_move'
  entity_type text,              -- 'access', 'template', 'automation', 'broadcast', 'deal'
  entity_id text,                -- the id of the affected entity
  actor_id uuid references auth.users(id),
  actor_name text,
  details jsonb default '{}',    -- action-specific metadata
  created_at timestamptz default now()
);

create index if not exists idx_audit_log_action on crm_audit_log(action);
create index if not exists idx_audit_log_entity on crm_audit_log(entity_type, entity_id);
create index if not exists idx_audit_log_actor on crm_audit_log(actor_id);
create index if not exists idx_audit_log_created on crm_audit_log(created_at desc);

alter table crm_audit_log enable row level security;
create policy "Authenticated users can read audit log"
  on crm_audit_log for all to authenticated using (true) with check (true);
