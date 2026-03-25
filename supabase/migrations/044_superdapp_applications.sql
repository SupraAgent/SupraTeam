-- SuperDapp Competition Applications Board
-- Adds 'Applications' board type with custom pipeline stages and form fields

-- 1. Extend board_type CHECK on crm_deals
alter table public.crm_deals drop constraint crm_deals_board_type_check;
alter table public.crm_deals add constraint crm_deals_board_type_check
  check (board_type in ('BD', 'Marketing', 'Admin', 'Applications'));

-- 2. Extend board_type CHECK on crm_deal_fields
alter table public.crm_deal_fields drop constraint crm_deal_fields_board_type_check;
alter table public.crm_deal_fields add constraint crm_deal_fields_board_type_check
  check (board_type in ('BD', 'Marketing', 'Admin', 'Applications'));

-- 3. Add board_type column to pipeline_stages (NULL = legacy shared stages for BD/Marketing/Admin)
alter table public.pipeline_stages add column if not exists board_type text;

-- 4. Add source column to crm_deals
alter table public.crm_deals add column if not exists source text default 'manual';

-- 5. Seed Applications pipeline stages
insert into public.pipeline_stages (name, position, color, board_type) values
  ('Submitted', 1, '#6366f1', 'Applications'),
  ('Under Review', 2, '#f59e0b', 'Applications'),
  ('Shortlisted', 3, '#3b82f6', 'Applications'),
  ('Approved', 4, '#10b981', 'Applications'),
  ('Rejected', 5, '#ef4444', 'Applications');

-- 6. Seed custom fields for Applications board
insert into public.crm_deal_fields (field_name, label, field_type, options, required, board_type, position) values
  ('project_category', 'Project Category', 'select',
    '["DeFi", "Gaming", "NFT/Digital Assets", "Infrastructure", "Social/Community", "DAO/Governance", "Developer Tools", "Other"]',
    true, 'Applications', 1),
  ('project_stage', 'Project Stage', 'select',
    '["Idea", "MVP/Prototype", "Beta", "Live/Production"]',
    true, 'Applications', 2),
  ('applying_for', 'Applying For', 'select',
    '["Grant", "Funding/Investment", "Marketing Support", "Technical Support", "Partnership"]',
    true, 'Applications', 3),
  ('supra_tech_used', 'Supra Tech Used', 'select',
    '["Move VM", "dVRF", "Automation Network", "Cross-chain Bridge", "Oracle/Price Feeds", "Other"]',
    true, 'Applications', 4),
  ('project_website', 'Project Website', 'url', null, false, 'Applications', 5),
  ('github_url', 'GitHub Repository', 'url', null, false, 'Applications', 6),
  ('project_description', 'Project Description', 'textarea', null, true, 'Applications', 7),
  ('funding_requested', 'Funding Requested (USD)', 'number', null, false, 'Applications', 8);

-- 7. RLS: allow public read of Applications stages (for TMA without auth)
create policy "Anyone can read application stages"
  on public.pipeline_stages for select
  using (board_type = 'Applications');

-- 8. RLS: allow public insert of deals with source = tma_submission (via service role, but safety net)
-- The submission API uses the service role client so RLS is bypassed,
-- but we add an index for performance
create index if not exists idx_pipeline_stages_board_type on public.pipeline_stages (board_type);
create index if not exists idx_crm_deals_source on public.crm_deals (source) where source = 'tma_submission';
