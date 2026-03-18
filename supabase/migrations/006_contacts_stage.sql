-- Add stage_id to contacts so contacts can flow through pipeline independently
alter table public.crm_contacts
  add column if not exists stage_id uuid references public.pipeline_stages on delete set null;

create index if not exists idx_contacts_stage on public.crm_contacts (stage_id);
