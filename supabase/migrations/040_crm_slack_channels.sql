-- Saved Slack channels & users for workflow automation dropdowns
-- Allows manual entry when Slack OAuth isn't connected

CREATE TABLE IF NOT EXISTS crm_slack_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id text NOT NULL UNIQUE,
  channel_name text NOT NULL,
  is_private boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS crm_slack_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL UNIQUE,
  display_name text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Seed the first channel
INSERT INTO crm_slack_channels (channel_id, channel_name) VALUES ('C06CTNC7LKU', 'Node-Operation') ON CONFLICT DO NOTHING;
