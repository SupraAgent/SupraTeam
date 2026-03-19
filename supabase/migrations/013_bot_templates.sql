-- Bot message templates (customizable per stage or event type)
-- Allows team to customize notification messages without code changes

create table if not exists crm_bot_templates (
  id uuid primary key default gen_random_uuid(),
  template_key text not null unique,           -- e.g. 'stage_change', 'daily_digest', 'broadcast', 'stage_change:mou_signed'
  name text not null,                          -- Display name
  body_template text not null,                 -- Template with {{placeholders}}
  description text,                            -- Help text for editors
  is_active boolean not null default true,
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- RLS: only authenticated users can read/write
alter table crm_bot_templates enable row level security;

create policy "Authenticated users can read templates"
  on crm_bot_templates for select
  to authenticated
  using (true);

create policy "Authenticated users can manage templates"
  on crm_bot_templates for all
  to authenticated
  using (true)
  with check (true);

-- Seed default templates
insert into crm_bot_templates (template_key, name, body_template, description) values
  ('stage_change', 'Stage Change Notification', '<b>Deal Update</b>

<b>{{deal_name}}</b>
{{from_stage}} → {{to_stage}}
Board: {{board_type}}
By: {{changed_by}}', 'Sent to linked Telegram group when a deal moves stages. Available variables: {{deal_name}}, {{from_stage}}, {{to_stage}}, {{board_type}}, {{changed_by}}'),

  ('daily_digest', 'Daily Pipeline Digest', '<b>📊 Daily Pipeline Digest</b>

<b>Deals by Board</b> ({{total_deals}} total)
{{board_summary}}

<b>Deals by Stage</b>
{{stage_summary}}

<b>Activity</b>: {{moves_today}} deal(s) moved today

{{top_deals_section}}', 'Sent daily to all bot-admin groups. Available variables: {{total_deals}}, {{board_summary}}, {{stage_summary}}, {{moves_today}}, {{top_deals_section}}'),

  ('broadcast', 'Broadcast Message', '<b>Broadcast</b>

{{message}}

<i>— {{sender_name}}</i>', 'Template for broadcast messages. Available variables: {{message}}, {{sender_name}}'),

  ('welcome_group', 'Group Welcome', 'SupraCRM Bot is now active in this group.

I''ll send deal updates and pipeline notifications here. Use /deal to see linked deals.', 'Sent when bot is added to a new group as admin.')
on conflict (template_key) do nothing;
