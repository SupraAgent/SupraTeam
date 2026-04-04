-- QR Code feature: scan → bot creates TG group → auto-add members/bots
-- Each QR code is a reusable "group creation recipe"

CREATE TABLE crm_qr_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID NOT NULL REFERENCES auth.users(id),
  name TEXT NOT NULL,                          -- "Conference Dubai", "Business Card", etc.
  type TEXT NOT NULL DEFAULT 'personal' CHECK (type IN ('personal', 'company')),
  bot_id UUID NOT NULL REFERENCES crm_bots(id) ON DELETE CASCADE,  -- creator bot (handles /start)

  -- Group creation config
  auto_create_group BOOLEAN NOT NULL DEFAULT true,
  group_name_template TEXT NOT NULL DEFAULT '{contact_name} × {company}',  -- supports variables
  welcome_message TEXT,                        -- bot sends this when group is created

  -- Auto-add roster: array of {type: "person"|"bot", id: uuid}
  auto_add_members JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Pipeline integration
  auto_create_deal BOOLEAN NOT NULL DEFAULT false,
  deal_stage_id UUID REFERENCES pipeline_stages(id) ON DELETE SET NULL,
  deal_board_type TEXT CHECK (deal_board_type IN ('bd', 'marketing', 'admin')),

  -- Campaign attribution
  campaign_source TEXT,                        -- "dubai-conference-2026", "business-card", etc.
  slug_tags TEXT[] DEFAULT '{}',               -- auto-apply these slug tags to created groups

  -- Limits
  max_scans INT,                               -- null = unlimited
  expires_at TIMESTAMPTZ,                      -- null = never
  is_active BOOLEAN NOT NULL DEFAULT true,
  scan_count INT NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Track every scan
CREATE TABLE crm_qr_scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  qr_code_id UUID NOT NULL REFERENCES crm_qr_codes(id) ON DELETE CASCADE,
  telegram_user_id BIGINT NOT NULL,
  telegram_username TEXT,
  telegram_first_name TEXT,
  group_id UUID REFERENCES tg_groups(id) ON DELETE SET NULL,
  deal_id UUID REFERENCES crm_deals(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES crm_contacts(id) ON DELETE SET NULL,
  scanned_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_qr_codes_created_by ON crm_qr_codes(created_by);
CREATE INDEX idx_qr_codes_bot_id ON crm_qr_codes(bot_id);
CREATE INDEX idx_qr_codes_active ON crm_qr_codes(is_active) WHERE is_active = true;
CREATE INDEX idx_qr_scans_qr_code ON crm_qr_scans(qr_code_id);
CREATE INDEX idx_qr_scans_telegram_user ON crm_qr_scans(telegram_user_id);

-- RLS
ALTER TABLE crm_qr_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_qr_scans ENABLE ROW LEVEL SECURITY;

-- QR codes: authenticated users can read all, create their own, update their own
CREATE POLICY "qr_codes_select" ON crm_qr_codes FOR SELECT TO authenticated USING (true);
CREATE POLICY "qr_codes_insert" ON crm_qr_codes FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "qr_codes_update" ON crm_qr_codes FOR UPDATE TO authenticated USING (auth.uid() = created_by);
CREATE POLICY "qr_codes_delete" ON crm_qr_codes FOR DELETE TO authenticated USING (auth.uid() = created_by);

-- QR scans: authenticated users can read all (team visibility)
CREATE POLICY "qr_scans_select" ON crm_qr_scans FOR SELECT TO authenticated USING (true);

-- Service role can insert scans (bot handler)
CREATE POLICY "qr_scans_insert_service" ON crm_qr_scans FOR INSERT TO service_role WITH CHECK (true);
-- Also allow authenticated insert for API routes
CREATE POLICY "qr_scans_insert_auth" ON crm_qr_scans FOR INSERT TO authenticated WITH CHECK (true);
