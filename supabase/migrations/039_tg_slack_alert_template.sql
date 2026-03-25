-- Migration 036: Add "Telegram → Slack Alert" built-in workflow template
-- Watches a Telegram group for messages and forwards to a Slack channel with @mention

INSERT INTO crm_workflow_templates (name, description, category, tags, trigger_type, nodes, edges) VALUES
(
  'Telegram → Slack Alert',
  'Forward Telegram group messages to a Slack channel with an @mention. Select the TG group to watch, the Slack channel to post in, and the user to tag.',
  'built_in',
  ARRAY['telegram', 'slack', 'alert', 'integration', 'cross-platform'],
  'tg_message',
  '[
    {"id":"t_trigger_0","type":"trigger","position":{"x":400,"y":100},"data":{"nodeType":"trigger","triggerType":"tg_message","label":"TG Message Received","config":{"chat_id":"","keyword":""}}},
    {"id":"t_action_1","type":"action","position":{"x":400,"y":300},"data":{"nodeType":"action","actionType":"send_slack","label":"Send Slack Alert","config":{"channel_id":"","mention_user_id":"","message":"*[{{group_name}}]* {{sender_name}}:\n{{message_text}}\n<{{message_link}}|View in Telegram>"}}}
  ]'::jsonb,
  '[
    {"id":"t_edge_0_1","source":"t_trigger_0","target":"t_action_1","type":"smoothstep","animated":true,"style":{"stroke":"hsl(142, 71%, 45%)","strokeWidth":2}}
  ]'::jsonb
);
