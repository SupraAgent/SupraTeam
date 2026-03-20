-- Migration 032: Workflow templates
-- Reusable automation templates (built-in + user-saved)

create table if not exists crm_workflow_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  category text not null default 'custom' check (category in ('built_in', 'custom')),
  tags text[] default '{}',
  trigger_type text,
  nodes jsonb not null default '[]',
  edges jsonb not null default '[]',
  is_public boolean default true,
  use_count int default 0,
  created_by uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_workflow_templates_category on crm_workflow_templates(category);

alter table crm_workflow_templates enable row level security;
create policy "Authenticated users can manage workflow templates"
  on crm_workflow_templates for all to authenticated using (true) with check (true);

-- Seed built-in templates

INSERT INTO crm_workflow_templates (name, description, category, tags, trigger_type, nodes, edges) VALUES
(
  'Deal Won Notification',
  'Send a Telegram message when a deal reaches MOU Signed stage.',
  'built_in',
  ARRAY['deal', 'notification', 'telegram'],
  'deal_stage_change',
  '[
    {"id":"t_trigger_0","type":"trigger","position":{"x":400,"y":100},"data":{"nodeType":"trigger","triggerType":"deal_stage_change","label":"Deal → MOU Signed","config":{"to_stage":"MOU Signed"}}},
    {"id":"t_action_1","type":"action","position":{"x":400,"y":260},"data":{"nodeType":"action","actionType":"send_telegram","label":"Send Congrats","config":{"message":"🎉 {{deal_name}} just signed MOU! Contact: {{contact_name}}"}}}
  ]'::jsonb,
  '[
    {"id":"t_edge_0_1","source":"t_trigger_0","target":"t_action_1","type":"smoothstep","animated":true,"style":{"stroke":"hsl(142, 71%, 45%)","strokeWidth":2}}
  ]'::jsonb
),
(
  'New Deal Follow-up Task',
  'When a deal is created, wait 1 hour then create a follow-up task.',
  'built_in',
  ARRAY['deal', 'task', 'follow-up'],
  'deal_created',
  '[
    {"id":"t_trigger_0","type":"trigger","position":{"x":400,"y":100},"data":{"nodeType":"trigger","triggerType":"deal_created","label":"New Deal Created","config":{}}},
    {"id":"t_delay_1","type":"delay","position":{"x":400,"y":260},"data":{"nodeType":"delay","label":"Wait 1 Hour","config":{"duration":1,"unit":"hours"}}},
    {"id":"t_action_2","type":"action","position":{"x":400,"y":420},"data":{"nodeType":"action","actionType":"create_task","label":"Create Follow-up Task","config":{"title":"Follow up on {{deal_name}}","description":"New deal created — reach out to {{contact_name}}","due_hours":24}}}
  ]'::jsonb,
  '[
    {"id":"t_edge_0_1","source":"t_trigger_0","target":"t_delay_1","type":"smoothstep","animated":true,"style":{"stroke":"hsl(142, 71%, 45%)","strokeWidth":2}},
    {"id":"t_edge_1_2","source":"t_delay_1","target":"t_action_2","type":"smoothstep","animated":true,"style":{"stroke":"hsl(142, 71%, 45%)","strokeWidth":2}}
  ]'::jsonb
),
(
  'BD Deal Stage Notification',
  'When a BD deal changes stage, check the board type and send a Telegram notification.',
  'built_in',
  ARRAY['deal', 'telegram', 'condition', 'BD'],
  'deal_stage_change',
  '[
    {"id":"t_trigger_0","type":"trigger","position":{"x":400,"y":100},"data":{"nodeType":"trigger","triggerType":"deal_stage_change","label":"Any Stage Change","config":{}}},
    {"id":"t_condition_1","type":"condition","position":{"x":400,"y":260},"data":{"nodeType":"condition","label":"Is BD Deal?","config":{"field":"board_type","operator":"equals","value":"BD"}}},
    {"id":"t_action_2","type":"action","position":{"x":250,"y":420},"data":{"nodeType":"action","actionType":"send_telegram","label":"Notify BD Group","config":{"message":"📊 BD Update: {{deal_name}} moved to {{stage}}"}}},
    {"id":"t_action_3","type":"action","position":{"x":550,"y":420},"data":{"nodeType":"action","actionType":"create_task","label":"Log Non-BD Move","config":{"title":"Stage change: {{deal_name}} → {{stage}}"}}}
  ]'::jsonb,
  '[
    {"id":"t_edge_0_1","source":"t_trigger_0","target":"t_condition_1","type":"smoothstep","animated":true,"style":{"stroke":"hsl(142, 71%, 45%)","strokeWidth":2}},
    {"id":"t_edge_1_2","source":"t_condition_1","target":"t_action_2","type":"smoothstep","animated":true,"sourceHandle":"true","style":{"stroke":"hsl(142, 71%, 45%)","strokeWidth":2}},
    {"id":"t_edge_1_3","source":"t_condition_1","target":"t_action_3","type":"smoothstep","animated":true,"sourceHandle":"false","style":{"stroke":"hsl(142, 71%, 45%)","strokeWidth":2}}
  ]'::jsonb
),
(
  'Video Call Prep',
  'When a deal moves to Video Call stage, create a prep task and send a reminder email.',
  'built_in',
  ARRAY['deal', 'task', 'email', 'video-call'],
  'deal_stage_change',
  '[
    {"id":"t_trigger_0","type":"trigger","position":{"x":400,"y":100},"data":{"nodeType":"trigger","triggerType":"deal_stage_change","label":"Deal → Video Call","config":{"to_stage":"Video Call"}}},
    {"id":"t_action_1","type":"action","position":{"x":250,"y":260},"data":{"nodeType":"action","actionType":"create_task","label":"Prep for Call","config":{"title":"Prepare for video call: {{deal_name}}","description":"Review deal notes and prepare talking points","due_hours":2}}},
    {"id":"t_action_2","type":"action","position":{"x":550,"y":260},"data":{"nodeType":"action","actionType":"send_email","label":"Send Reminder","config":{"subject":"Video call coming up: {{deal_name}}","body":"Hi {{contact_name}},\\n\\nJust confirming our upcoming video call. Looking forward to speaking with you!\\n\\nBest regards"}}}
  ]'::jsonb,
  '[
    {"id":"t_edge_0_1","source":"t_trigger_0","target":"t_action_1","type":"smoothstep","animated":true,"style":{"stroke":"hsl(142, 71%, 45%)","strokeWidth":2}},
    {"id":"t_edge_0_2","source":"t_trigger_0","target":"t_action_2","type":"smoothstep","animated":true,"style":{"stroke":"hsl(142, 71%, 45%)","strokeWidth":2}}
  ]'::jsonb
),
(
  'Webhook → Telegram Alert',
  'Receive an external webhook and send a Telegram alert.',
  'built_in',
  ARRAY['webhook', 'telegram', 'integration'],
  'webhook',
  '[
    {"id":"t_trigger_0","type":"trigger","position":{"x":400,"y":100},"data":{"nodeType":"trigger","triggerType":"webhook","label":"Incoming Webhook","config":{}}},
    {"id":"t_action_1","type":"action","position":{"x":400,"y":260},"data":{"nodeType":"action","actionType":"send_telegram","label":"Send Alert","config":{"message":"⚡ Webhook received! Check the dashboard for details."}}}
  ]'::jsonb,
  '[
    {"id":"t_edge_0_1","source":"t_trigger_0","target":"t_action_1","type":"smoothstep","animated":true,"style":{"stroke":"hsl(142, 71%, 45%)","strokeWidth":2}}
  ]'::jsonb
);
