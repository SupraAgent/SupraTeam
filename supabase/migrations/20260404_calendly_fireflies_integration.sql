-- Calendly + Fireflies Integration: Tables, Indexes, RLS
-- Phase 1: Foundation + Calendly connection + booking links + deal activities

-- ============================================================
-- 1. Calendly Connections
-- ============================================================
CREATE TABLE IF NOT EXISTS crm_calendly_connections (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  calendly_user_uri TEXT NOT NULL,
  calendly_email TEXT NOT NULL,
  calendly_name TEXT,
  access_token_encrypted TEXT NOT NULL,
  refresh_token_encrypted TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ NOT NULL,
  organization_uri TEXT,
  webhook_subscription_uri TEXT,
  scheduling_url TEXT,
  event_types_cache JSONB,
  event_types_cached_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  connected_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

ALTER TABLE crm_calendly_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own calendly connections"
  ON crm_calendly_connections FOR ALL USING (auth.uid() = user_id);

-- ============================================================
-- 2. Fireflies Connections
-- ============================================================
CREATE TABLE IF NOT EXISTS crm_fireflies_connections (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  api_key_encrypted TEXT NOT NULL,
  fireflies_email TEXT NOT NULL,
  webhook_secret TEXT,
  last_sync_cursor TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  connected_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

ALTER TABLE crm_fireflies_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own fireflies connections"
  ON crm_fireflies_connections FOR ALL USING (auth.uid() = user_id);

-- ============================================================
-- 3. Tracked Booking Links
-- ============================================================
CREATE TABLE IF NOT EXISTS crm_booking_links (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  deal_id UUID REFERENCES crm_deals(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES crm_contacts(id) ON DELETE SET NULL,
  calendly_event_type_uri TEXT NOT NULL,
  calendly_event_type_name TEXT,
  calendly_event_type_duration INTEGER,
  calendly_scheduling_link TEXT NOT NULL,
  utm_params JSONB DEFAULT '{}',
  status TEXT DEFAULT 'pending'
    CHECK (status IN ('pending', 'booked', 'canceled', 'rescheduled', 'completed', 'no_show')),
  invitee_email TEXT,
  invitee_name TEXT,
  scheduled_at TIMESTAMPTZ,
  calendly_event_uri TEXT,
  booked_at TIMESTAMPTZ,
  canceled_at TIMESTAMPTZ,
  no_show_detected_at TIMESTAMPTZ,
  google_calendar_event_id TEXT,
  tg_chat_id BIGINT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_booking_links_deal ON crm_booking_links(deal_id);
CREATE INDEX idx_booking_links_contact ON crm_booking_links(contact_id);
CREATE INDEX idx_booking_links_status ON crm_booking_links(status);
CREATE INDEX idx_booking_links_invitee_email ON crm_booking_links(invitee_email);
CREATE INDEX idx_booking_links_scheduled ON crm_booking_links(scheduled_at)
  WHERE status = 'booked';
CREATE UNIQUE INDEX idx_booking_links_event_uri ON crm_booking_links(calendly_event_uri)
  WHERE calendly_event_uri IS NOT NULL;
CREATE INDEX idx_booking_links_gcal_event ON crm_booking_links(google_calendar_event_id)
  WHERE google_calendar_event_id IS NOT NULL;
CREATE INDEX idx_booking_links_match ON crm_booking_links(scheduled_at, invitee_email)
  WHERE scheduled_at IS NOT NULL;

ALTER TABLE crm_booking_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team reads booking links"
  ON crm_booking_links FOR SELECT USING (true);
CREATE POLICY "Users create booking links"
  ON crm_booking_links FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own booking links"
  ON crm_booking_links FOR UPDATE USING (auth.uid() = user_id);

-- ============================================================
-- 4. Meeting Transcripts (Fireflies)
-- ============================================================
CREATE TABLE IF NOT EXISTS crm_meeting_transcripts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  deal_id UUID REFERENCES crm_deals(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES crm_contacts(id) ON DELETE SET NULL,
  booking_link_id UUID REFERENCES crm_booking_links(id) ON DELETE SET NULL,
  fireflies_meeting_id TEXT NOT NULL,
  title TEXT,
  duration_minutes INTEGER,
  scheduled_at TIMESTAMPTZ,
  attendees JSONB DEFAULT '[]',
  summary TEXT,
  action_items JSONB DEFAULT '[]',
  key_topics JSONB DEFAULT '[]',
  sentiment JSONB DEFAULT '{}',
  transcript_url TEXT,
  speakers JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(fireflies_meeting_id)
);

CREATE INDEX idx_transcripts_deal ON crm_meeting_transcripts(deal_id);
CREATE INDEX idx_transcripts_booking ON crm_meeting_transcripts(booking_link_id);

ALTER TABLE crm_meeting_transcripts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team reads transcripts"
  ON crm_meeting_transcripts FOR SELECT USING (true);
CREATE POLICY "Users create transcripts"
  ON crm_meeting_transcripts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own transcripts"
  ON crm_meeting_transcripts FOR UPDATE USING (auth.uid() = user_id);

-- ============================================================
-- 5. Unified Deal Activity Timeline
-- ============================================================
CREATE TABLE IF NOT EXISTS crm_deal_activities (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  deal_id UUID NOT NULL REFERENCES crm_deals(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  activity_type TEXT NOT NULL
    CHECK (activity_type IN (
      'stage_change', 'note_added', 'email_sent', 'email_received',
      'tg_message', 'booking_link_sent', 'meeting_scheduled',
      'meeting_completed', 'meeting_canceled', 'meeting_rescheduled',
      'meeting_no_show', 'transcript_received', 'task_created',
      'contact_linked'
    )),
  title TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  reference_id UUID,
  reference_type TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_deal_activities_deal ON crm_deal_activities(deal_id);
CREATE INDEX idx_deal_activities_type ON crm_deal_activities(activity_type);
CREATE INDEX idx_deal_activities_created ON crm_deal_activities(created_at DESC);

ALTER TABLE crm_deal_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team reads activities"
  ON crm_deal_activities FOR SELECT USING (true);
CREATE POLICY "Users create activities"
  ON crm_deal_activities FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- 6. Contact email unique index for deduplication
-- ============================================================
CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_email_unique
  ON crm_contacts(email, created_by)
  WHERE email IS NOT NULL;
