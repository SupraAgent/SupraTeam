-- Calendar Sync: Google Calendar integration tables
-- Enables syncing Google Calendar events into SupraCRM

-- ── Calendar Connections ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_calendar_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  google_email text NOT NULL,
  access_token_encrypted text NOT NULL,
  refresh_token_encrypted text,
  token_expires_at timestamptz,
  scopes text[] DEFAULT '{}',
  selected_calendars text[] DEFAULT '{primary}',
  is_active boolean DEFAULT true,
  connected_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, google_email)
);

ALTER TABLE crm_calendar_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own calendar connections"
  ON crm_calendar_connections FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── Sync State ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_calendar_sync_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL REFERENCES crm_calendar_connections(id) ON DELETE CASCADE,
  calendar_id text NOT NULL,
  sync_token text,
  last_full_sync_at timestamptz,
  last_incremental_sync_at timestamptz,
  sync_status text DEFAULT 'pending' CHECK (sync_status IN ('pending', 'syncing', 'synced', 'error')),
  error_message text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(connection_id, calendar_id)
);

ALTER TABLE crm_calendar_sync_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own sync state"
  ON crm_calendar_sync_state FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM crm_calendar_connections c
      WHERE c.id = crm_calendar_sync_state.connection_id
        AND c.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM crm_calendar_connections c
      WHERE c.id = crm_calendar_sync_state.connection_id
        AND c.user_id = auth.uid()
    )
  );

-- ── Calendar Events ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_calendar_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  connection_id uuid NOT NULL REFERENCES crm_calendar_connections(id) ON DELETE CASCADE,
  calendar_id text NOT NULL,
  google_event_id text NOT NULL,
  summary text,
  description text,
  location text,
  start_at timestamptz,
  end_at timestamptz,
  start_date date,
  end_date date,
  is_all_day boolean DEFAULT false,
  status text DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'tentative', 'cancelled')),
  organizer jsonb,
  attendees jsonb,
  recurring_event_id text,
  html_link text,
  hangout_link text,
  etag text,
  synced_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, calendar_id, google_event_id)
);

CREATE INDEX idx_calendar_events_user_start ON crm_calendar_events(user_id, start_at);
CREATE INDEX idx_calendar_events_connection ON crm_calendar_events(connection_id);

ALTER TABLE crm_calendar_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own calendar events"
  ON crm_calendar_events FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── Event Links (deal/contact associations) ───────────────────
CREATE TABLE IF NOT EXISTS crm_calendar_event_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES crm_calendar_events(id) ON DELETE CASCADE,
  deal_id uuid REFERENCES crm_deals(id) ON DELETE SET NULL,
  contact_id uuid REFERENCES crm_contacts(id) ON DELETE SET NULL,
  linked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  auto_linked boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  UNIQUE(event_id, deal_id),
  UNIQUE(event_id, contact_id)
);

ALTER TABLE crm_calendar_event_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own event links"
  ON crm_calendar_event_links FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM crm_calendar_events e
      WHERE e.id = crm_calendar_event_links.event_id
        AND e.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM crm_calendar_events e
      WHERE e.id = crm_calendar_event_links.event_id
        AND e.user_id = auth.uid()
    )
  );

-- ── Updated-at triggers ───────────────────────────────────────
CREATE OR REPLACE FUNCTION update_calendar_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_calendar_connections_updated
  BEFORE UPDATE ON crm_calendar_connections
  FOR EACH ROW EXECUTE FUNCTION update_calendar_updated_at();

CREATE TRIGGER trg_calendar_sync_state_updated
  BEFORE UPDATE ON crm_calendar_sync_state
  FOR EACH ROW EXECUTE FUNCTION update_calendar_updated_at();

CREATE TRIGGER trg_calendar_events_updated
  BEFORE UPDATE ON crm_calendar_events
  FOR EACH ROW EXECUTE FUNCTION update_calendar_updated_at();
