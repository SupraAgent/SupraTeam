-- Knowledge graph docs/notes system
-- Standalone docs that can be linked to any CRM entity

create table crm_docs (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  content text not null default '',
  created_by uuid references auth.users(id) not null,
  updated_by uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Junction: link a doc to any entity (deal, contact, group)
create table crm_doc_links (
  id uuid primary key default gen_random_uuid(),
  doc_id uuid references crm_docs(id) on delete cascade not null,
  entity_type text not null check (entity_type in ('deal', 'contact', 'group')),
  entity_id uuid not null,
  created_at timestamptz default now(),
  unique(doc_id, entity_type, entity_id)
);

create index idx_crm_docs_created_by on crm_docs(created_by);
create index idx_crm_doc_links_doc on crm_doc_links(doc_id);
create index idx_crm_doc_links_entity on crm_doc_links(entity_type, entity_id);

-- RLS
alter table crm_docs enable row level security;
alter table crm_doc_links enable row level security;

create policy "Authenticated users can manage docs"
  on crm_docs for all
  to authenticated
  using (true)
  with check (true);

create policy "Authenticated users can manage doc links"
  on crm_doc_links for all
  to authenticated
  using (true)
  with check (true);
