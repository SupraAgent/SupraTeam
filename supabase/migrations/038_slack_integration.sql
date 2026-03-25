-- Slack integration: TG → Slack message forwarding via workflow automations

-- Optional: TG user → Slack user mapping for automatic @mentions
CREATE TABLE IF NOT EXISTS crm_tg_slack_user_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_user_id bigint NOT NULL,
  telegram_username text,
  slack_user_id text NOT NULL,
  slack_display_name text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(telegram_user_id)
);

ALTER TABLE crm_tg_slack_user_map ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage TG-Slack mappings"
  ON crm_tg_slack_user_map FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Built-in workflow template: TG Group → Slack Channel
INSERT INTO crm_workflow_templates (
  id, name, description, category, tags, trigger_type, nodes, edges, is_public, use_count
) VALUES (
  gen_random_uuid(),
  'TG Group → Slack Channel',
  'Forward Telegram group messages to a Slack channel with @mention and link back to the original message.',
  'built_in',
  ARRAY['telegram', 'slack', 'notifications'],
  'tg_message',
  '[
    {
      "id": "trigger-1",
      "type": "trigger",
      "position": { "x": 100, "y": 200 },
      "data": {
        "nodeType": "trigger",
        "triggerType": "tg_message",
        "label": "TG Message Received",
        "config": { "chat_id": "", "keyword": "" }
      }
    },
    {
      "id": "action-1",
      "type": "action",
      "position": { "x": 450, "y": 200 },
      "data": {
        "nodeType": "action",
        "actionType": "send_slack",
        "label": "Send to Slack",
        "config": {
          "channel_id": "",
          "channel_name": "",
          "message": "*[{{group_name}}]* {{sender_name}}: {{message_text}}\n<{{message_link}}|View in Telegram>",
          "mention_user_id": "",
          "mention_user_name": ""
        }
      }
    }
  ]'::jsonb,
  '[
    {
      "id": "edge-1",
      "source": "trigger-1",
      "target": "action-1",
      "type": "smoothstep",
      "animated": true
    }
  ]'::jsonb,
  true,
  0
) ON CONFLICT DO NOTHING;
