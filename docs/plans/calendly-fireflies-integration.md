# Calendly + Fireflies Integration Plan

> **CPO Review Score: 8.2/10 (Sarah Chen) | 69/100 (Elena Voronova)**
> Plan updated with all CPO feedback incorporated. See [CPO Review Notes](#cpo-review-notes) at bottom.

## Strategic Context

SupraCRM's thesis: **the CRM that lives inside Telegram**. BD reps share Calendly links in TG groups/DMs as part of their outreach flow. Today, the pipeline stages "Calendly Sent" and "Video Call" exist but have zero automation between them — reps manually drag cards after bookings happen. This plan closes that gap.

### Why Calendly + Fireflies (Not Custom)

In web3/crypto — SupraCRM's core market — clicking unfamiliar links is a security risk. Users are trained to distrust unknown domains. `calendly.com` and Fireflies are trusted brands. A custom scheduler on `book.supracrm.com` would create friction, not reduce it.

Additionally:
- **Cal.com is AGPLv3** — modifications must be open-sourced, exposing proprietary TG integration code
- **Calendly handles timezone, availability, reminders, rescheduling** — commodity infrastructure we shouldn't rebuild
- **Fireflies handles transcription, speaker diarization, sentiment, action items** — ML infrastructure that's not our moat
- **Our users already have Calendly/Fireflies accounts** — zero onboarding friction

**Decision: Integrate both via their APIs. Our value is the Telegram-native experience and pipeline automation on top, not the scheduling/transcription itself.**

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    SupraCRM Frontend                     │
│                                                         │
│  TG Conversation UI    Deal Detail    TMA Deal Page     │
│  ┌──────────────┐    ┌───────────┐   ┌──────────────┐  │
│  │ "Send Booking │    │ Booking   │   │ Quick Action: │  │
│  │  Link" button │    │ Timeline  │   │ Send Link    │  │
│  └──────┬───────┘    │ Transcript│   └──────┬───────┘  │
│         │            │ Summary   │          │           │
│         │            └───────────┘          │           │
└─────────┼──────────────────────────────────┼───────────┘
          │                                  │
          ▼                                  ▼
┌─────────────────────────────────────────────────────────┐
│                   SupraCRM API Layer                     │
│                                                         │
│  POST /api/calendly/connect          (OAuth flow)       │
│  POST /api/calendly/booking-link     (generate link)    │
│  POST /api/webhooks/calendly         (incoming events)  │
│  POST /api/fireflies/connect         (API key flow)     │
│  POST /api/webhooks/fireflies        (incoming events)  │
│  GET  /api/deals/[id]/meetings       (meeting data)     │
│  CRON /api/cron/booking-no-shows     (no-show detect)   │
│  CRON /api/cron/fireflies-reconcile  (missed webhooks)  │
│                                                         │
└────────┬───────────────────────────────────┬────────────┘
         │                                   │
         ▼                                   ▼
┌─────────────────────┐         ┌─────────────────────────┐
│   Calendly API v2   │         │  Fireflies GraphQL API  │
│                     │         │                         │
│ • OAuth 2.0         │         │ • API key auth          │
│ • Scheduling Links  │         │ • transcript query      │
│ • invitee.created   │         │ • Transcription complete│
│ • invitee.canceled  │         │   webhook               │
│ • UTM tracking      │         │ • sentiment, speakers,  │
│                     │         │   action items, summary │
└─────────────────────┘         └─────────────────────────┘
```

---

## Database Schema

### New Tables

```sql
-- Calendly connections (follows crm_calendar_connections pattern)
CREATE TABLE crm_calendly_connections (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  calendly_user_uri TEXT NOT NULL,          -- Calendly user resource URI
  calendly_email TEXT NOT NULL,
  calendly_name TEXT,
  access_token_encrypted TEXT NOT NULL,     -- AES-256-GCM via lib/crypto.ts
  refresh_token_encrypted TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ NOT NULL,
  organization_uri TEXT,                    -- For team scheduling
  webhook_subscription_uri TEXT,            -- Active webhook reference
  scheduling_url TEXT,                      -- User's base scheduling URL
  event_types_cache JSONB,                  -- Cached event types (refreshed every 5 min)
  event_types_cached_at TIMESTAMPTZ,        -- When cache was last refreshed
  is_active BOOLEAN DEFAULT true,
  connected_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Fireflies connections
CREATE TABLE crm_fireflies_connections (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  api_key_encrypted TEXT NOT NULL,          -- AES-256-GCM
  fireflies_email TEXT NOT NULL,
  webhook_secret TEXT,                      -- For verifying incoming webhooks
  last_sync_cursor TIMESTAMPTZ,             -- For reconciliation polling
  is_active BOOLEAN DEFAULT true,
  connected_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Tracked booking links (the core mapping table)
CREATE TABLE crm_booking_links (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  deal_id UUID REFERENCES crm_deals(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES crm_contacts(id) ON DELETE SET NULL,
  calendly_event_type_uri TEXT NOT NULL,    -- Which event type was used
  calendly_event_type_name TEXT,            -- Human-readable: "30 Min Meeting"
  calendly_event_type_duration INTEGER,     -- Duration in minutes (for no-show detection)
  calendly_scheduling_link TEXT NOT NULL,   -- The actual calendly.com URL
  utm_params JSONB DEFAULT '{}',           -- { deal_id, contact_id, group_id, rep_id }
  status TEXT DEFAULT 'pending'
    CHECK (status IN ('pending', 'booked', 'canceled', 'rescheduled', 'completed', 'no_show')),
  invitee_email TEXT,                       -- Populated on booking
  invitee_name TEXT,
  scheduled_at TIMESTAMPTZ,                -- When the meeting is scheduled
  calendly_event_uri TEXT,                  -- Populated on booking (Calendly event reference)
  booked_at TIMESTAMPTZ,
  canceled_at TIMESTAMPTZ,
  no_show_detected_at TIMESTAMPTZ,          -- When no-show was auto-detected
  tg_chat_id BIGINT,                        -- TG chat where link was sent (for attribution)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Meeting transcripts (from Fireflies)
CREATE TABLE crm_meeting_transcripts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  deal_id UUID REFERENCES crm_deals(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES crm_contacts(id) ON DELETE SET NULL,
  booking_link_id UUID REFERENCES crm_booking_links(id) ON DELETE SET NULL,
  fireflies_meeting_id TEXT NOT NULL,
  title TEXT,
  duration_minutes INTEGER,
  scheduled_at TIMESTAMPTZ,
  attendees JSONB DEFAULT '[]',             -- [{ email, name, duration_seconds }]
  summary TEXT,                             -- AI-generated summary
  action_items JSONB DEFAULT '[]',          -- [{ text, assignee, completed }]
  key_topics JSONB DEFAULT '[]',            -- ["topic1", "topic2"]
  sentiment JSONB DEFAULT '{}',             -- { overall, by_speaker: { email: score } }
  transcript_url TEXT NOT NULL,             -- Link to full transcript in Fireflies (fetch on demand)
  speakers JSONB DEFAULT '[]',             -- [{ name, email, talk_time_pct, word_count }]
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(fireflies_meeting_id)
);
-- NOTE: No raw_transcript column. Full transcripts can be 50K+ chars.
-- Store transcript_url and fetch on demand from Fireflies API.

-- Deal activity timeline entries (replaces fragmented activity queries)
CREATE TABLE crm_deal_activities (
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
  title TEXT NOT NULL,                      -- Human-readable: "Meeting scheduled with John"
  metadata JSONB DEFAULT '{}',              -- Type-specific data
  reference_id UUID,                        -- FK to booking_link, transcript, etc.
  reference_type TEXT,                      -- 'booking_link', 'transcript', 'note', etc.
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_booking_links_deal ON crm_booking_links(deal_id);
CREATE INDEX idx_booking_links_contact ON crm_booking_links(contact_id);
CREATE INDEX idx_booking_links_status ON crm_booking_links(status);
CREATE INDEX idx_booking_links_invitee_email ON crm_booking_links(invitee_email);
CREATE INDEX idx_booking_links_scheduled ON crm_booking_links(scheduled_at)
  WHERE status = 'booked';  -- For no-show detection queries
CREATE INDEX idx_transcripts_deal ON crm_meeting_transcripts(deal_id);
CREATE INDEX idx_transcripts_booking ON crm_meeting_transcripts(booking_link_id);
CREATE INDEX idx_deal_activities_deal ON crm_deal_activities(deal_id);
CREATE INDEX idx_deal_activities_type ON crm_deal_activities(activity_type);
CREATE INDEX idx_deal_activities_created ON crm_deal_activities(created_at DESC);

-- RLS policies
-- Decision: team-visible reads across all tables (CRM is collaborative),
-- write-restricted to own data. Consistent across all five tables.
ALTER TABLE crm_booking_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_meeting_transcripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_deal_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_calendly_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_fireflies_connections ENABLE ROW LEVEL SECURITY;

-- Connections: private (only you manage your own integrations)
CREATE POLICY "Users manage own calendly connections"
  ON crm_calendly_connections FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users manage own fireflies connections"
  ON crm_fireflies_connections FOR ALL USING (auth.uid() = user_id);

-- Booking links, transcripts, activities: team-readable, owner-writable
CREATE POLICY "Team reads booking links"
  ON crm_booking_links FOR SELECT USING (true);
CREATE POLICY "Users manage own booking links"
  ON crm_booking_links FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own booking links"
  ON crm_booking_links FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Team reads transcripts"
  ON crm_meeting_transcripts FOR SELECT USING (true);
CREATE POLICY "Users manage own transcripts"
  ON crm_meeting_transcripts FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Team reads activities"
  ON crm_deal_activities FOR SELECT USING (true);
CREATE POLICY "Users create activities"
  ON crm_deal_activities FOR INSERT WITH CHECK (auth.uid() = user_id);
```

### Schema for `matchOrCreateContact` Utility

```sql
-- Add unique index on email for deduplication (if not exists)
CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_email_unique
  ON crm_contacts(email, created_by)
  WHERE email IS NOT NULL;
```

---

## API Routes

### Calendly Connection + Booking Links

#### `POST /api/calendly/connect` — Initiate OAuth

```typescript
// Follows existing Google Calendar OAuth pattern from:
// app/api/calendar/google/callback/route.ts

// 1. Generate HMAC-signed state with timestamp + nonce
// 2. Redirect to Calendly OAuth:
//    https://auth.calendly.com/oauth/authorize
//    ?client_id={CALENDLY_CLIENT_ID}
//    &redirect_uri={APP_URL}/api/calendly/callback
//    &response_type=code
//    &state={signed_state}
```

#### `GET /api/calendly/callback` — OAuth Callback

```typescript
// 1. Validate state (HMAC, timestamp, nonce — same pattern as calendar)
// 2. Exchange code for tokens via POST https://auth.calendly.com/oauth/token
// 3. Fetch user info: GET https://api.calendly.com/users/me
// 4. Encrypt tokens via encryptToken() from lib/crypto.ts
// 5. Fetch and cache event types (store in event_types_cache JSONB)
// 6. Upsert into crm_calendly_connections
// 7. Create webhook subscription:
//    POST https://api.calendly.com/webhook_subscriptions
//    { url: "{APP_URL}/api/webhooks/calendly", events: ["invitee.created", "invitee.canceled"], organization: org_uri, scope: "user" }
// 8. Store webhook_subscription_uri for cleanup on disconnect
// 9. Redirect to /settings/integrations?calendly=connected
```

#### `DELETE /api/calendly/disconnect` — Remove Connection

```typescript
// 1. Delete webhook subscription via Calendly API
// 2. Delete crm_calendly_connections row
// 3. Return success
```

#### `POST /api/calendly/booking-link` — Generate Tracked Link

```typescript
// Request: { deal_id, contact_id, event_type_uri?, tg_chat_id? }
//
// 1. Fetch user's Calendly connection, decrypt tokens (refresh if expired)
// 2. If event_type_uri not provided, auto-select:
//    - If user has exactly 1 event type → use it (skip picker)
//    - If multiple → return 400 asking client to specify
// 3. Call Calendly API: POST https://api.calendly.com/scheduling_links
//    { max_event_count: 1, owner: event_type_uri, owner_type: "EventType" }
// 4. Append UTM params to the returned booking_url:
//    ?utm_source=supracrm&utm_campaign={deal_id}&utm_content={contact_id}
// 5. Insert into crm_booking_links:
//    { user_id, deal_id, contact_id, calendly_event_type_uri,
//      calendly_event_type_name, calendly_event_type_duration,
//      calendly_scheduling_link, utm_params, tg_chat_id }
// 6. Log activity: { deal_id, type: "booking_link_sent", title: "Booking link sent to {contact_name}" }
// 7. Return { booking_url, booking_link_id }
```

#### `GET /api/calendly/event-types` — List Available Event Types (Cached)

```typescript
// 1. Check crm_calendly_connections.event_types_cache
// 2. If cached and event_types_cached_at < 5 minutes ago → return cache
// 3. Otherwise fetch from Calendly API: GET https://api.calendly.com/event_types?user={user_uri}
// 4. Update cache in DB
// 5. Return formatted list: [{ uri, name, duration, slug }]
```

### Calendly Webhook Handler

#### `POST /api/webhooks/calendly` — Incoming Events

```typescript
// CRITICAL: Always return 200 immediately (same pattern as Google Calendar webhook)
//
// 1. Verify webhook signature:
//    - Calendly sends X-Calendly-Webhook-Signature header
//    - HMAC-SHA256 of request body with webhook signing key
//
// 2. Idempotency check: if calendly_event_uri already processed, skip
//
// 3. Parse event type from payload:
//
// ON invitee.created:
//    a. Extract: invitee_email, invitee_name, event_uri, scheduled_time, utm_params
//    b. Match to booking link via utm_campaign (deal_id) OR invitee_email → crm_contacts
//    c. Update crm_booking_links: status='booked', invitee_email, scheduled_at, calendly_event_uri
//    d. Match or create contact: matchOrCreateContact(invitee_email, invitee_name)
//    e. Auto-advance deal stage: find "Video Call" stage, update deal.stage_id
//       - Only auto-advance if current stage is "Calendly Sent" (don't regress deals)
//    f. Log activities:
//       - { type: "meeting_scheduled", title: "Meeting scheduled: {event_name} with {invitee_name}" }
//       - { type: "stage_change", title: "Auto-advanced to Video Call" }
//    g. Fire workflow trigger: "booking.scheduled" event for workflow builder
//    h. Create in-app notification for the rep (see Notification System below)
//
// ON invitee.canceled:
//    a. Match booking link via event_uri
//    b. Check if rescheduled (payload includes rescheduled: true/false)
//    c. If rescheduled: update status='rescheduled', log activity
//    d. If canceled: update status='canceled', log activity
//       - Do NOT regress deal stage (rep should decide next action)
//    e. Fire workflow trigger: "booking.canceled" or "booking.rescheduled"
//
// 4. Handle unmatched bookings (see Unmatched Booking Resolution below)
```

### Fireflies Connection + Transcripts

#### `POST /api/fireflies/connect` — Save API Key

```typescript
// Fireflies uses API key auth, not OAuth
// 1. Receive { api_key, email }
// 2. Validate key by calling Fireflies GraphQL: query { user { email name } }
// 3. Encrypt api_key via encryptToken()
// 4. Upsert into crm_fireflies_connections
// 5. Webhook setup: Fireflies does NOT support programmatic webhook registration.
//    Show user inline instructions:
//    "Go to Fireflies Settings > Integrations > Webhooks
//     Add URL: {APP_URL}/api/webhooks/fireflies?user_id={user_id}
//     Secret: {generated_webhook_secret}"
//    Store the generated secret in crm_fireflies_connections.webhook_secret
// 6. Return success with setup instructions
```

#### `POST /api/webhooks/fireflies` — Incoming Transcripts

```typescript
// 1. Extract user_id from query param, verify webhook secret
// 2. Extract meetingId from payload
// 3. Decrypt user's Fireflies API key
// 4. Query Fireflies GraphQL for full transcript data:
//
//    query Transcript($id: String!) {
//      transcript(id: $id) {
//        id title date duration
//        meeting_attendees { displayName email }
//        sentences { speaker_name text }
//        summary { action_items overview bullet_gist keywords }
//        sentiment
//      }
//    }
//
// 5. Match to deal (see Fireflies Matching below)
//
// 6. Insert into crm_meeting_transcripts:
//    { fireflies_meeting_id, deal_id, contact_id, summary, action_items,
//      sentiment, transcript_url, speakers, attendees }
//
// 7. Update booking link: status='completed'
//
// 8. Log activity: { type: "transcript_received", title: "Call transcript: {meeting_title}" }
//
// 9. Fire workflow trigger: "meeting.transcribed"
//
// 10. Auto-create tasks from action items:
//     - Parse Fireflies action_items
//     - Create CRM tasks linked to deal
//     - Log activity for each: { type: "task_created" }
```

### Cron Jobs

#### `GET /api/cron/booking-no-shows` — No-Show Detection (runs every 15 min)

```typescript
// Query: SELECT * FROM crm_booking_links
//   WHERE status = 'booked'
//   AND scheduled_at + (calendly_event_type_duration || 30) * interval '1 minute' < NOW()
//
// For each stale booking:
// 1. Check if a transcript exists for this booking (meeting happened but webhook was slow)
// 2. If no transcript and time window exceeded:
//    a. Update status = 'no_show', no_show_detected_at = NOW()
//    b. Log activity: { type: "meeting_no_show", title: "No-show: {invitee_name} missed {event_name}" }
//    c. Fire workflow trigger: "booking.no_show"
//    d. Create notification for rep with inline action: [Reschedule] [Mark as Canceled]
```

#### `GET /api/cron/fireflies-reconcile` — Fireflies Reconciliation (runs every 30 min)

```typescript
// For each active Fireflies connection:
// 1. Query Fireflies GraphQL for recent transcripts since last_sync_cursor
//    query RecentTranscripts($fromDate: DateTime) {
//      transcripts(fromDate: $fromDate) { id title date }
//    }
// 2. For each transcript not already in crm_meeting_transcripts:
//    a. Fetch full transcript data
//    b. Match to deal (same logic as webhook handler)
//    c. Insert into crm_meeting_transcripts
// 3. Update last_sync_cursor on the connection
//
// This catches any transcripts missed due to webhook failures,
// network blips, or Fireflies outages.
```

#### `GET /api/deals/[id]/meetings` — Deal Meeting Data

```typescript
// Returns all meeting data for a deal:
// - Upcoming bookings (from crm_booking_links where status='booked')
// - Past meetings with transcripts (from crm_meeting_transcripts)
// - Activity timeline entries
// Joined and sorted chronologically
```

---

## Core Utilities

### `matchOrCreateContact(email, name, userId)`

```typescript
// lib/contacts/match-or-create.ts
//
// 1. Search crm_contacts WHERE email = input_email AND created_by = userId
// 2. If found: return existing contact (update name if was null)
// 3. If not found: INSERT new contact with email, name, lifecycle_stage='prospect'
// 4. Return { contact, isNew: boolean }
//
// Used by: Calendly webhook, Fireflies webhook, future email integrations
```

### Token Refresh for Calendly

```typescript
// lib/calendly/refresh-token.ts
//
// Calendly OAuth tokens expire after 2 hours
// 1. Check token_expires_at before each API call
// 2. If expired: POST https://auth.calendly.com/oauth/token
//    { grant_type: "refresh_token", refresh_token: decrypted_refresh }
// 3. Encrypt new tokens, update crm_calendly_connections
// 4. Return fresh access token
//
// Follow same pattern as Google Calendar token refresh
```

### Calendly API Rate Limiting

```typescript
// lib/calendly/client.ts
//
// Calendly rate limits: ~100 requests/minute per OAuth token
// 1. Track request count per user per minute
// 2. If approaching limit, queue requests with exponential backoff
// 3. Event types are cached (5 min TTL) to reduce API calls
// 4. User info cached (1 hour TTL)
// 5. Log rate limit warnings for monitoring
```

---

## Notification System

### In-App Notifications for Booking Events

Booking events generate actionable in-app notifications. These appear in the existing notification bell and as toast notifications when the user is active.

#### Notification Types

| Event | Notification | Inline Actions |
|-------|-------------|----------------|
| Booking confirmed (matched) | "John booked 30 Min Meeting for Apr 8. Deal auto-advanced to Video Call." | [View Deal] |
| Booking confirmed (unmatched) | "john@acme.com booked 30 Min Meeting. Likely matches Deal #142 (Acme Corp)." | [Link to This Deal] [Link to Other...] [Create New Deal] |
| Booking confirmed (unknown) | "Unknown contact john@acme.com booked 30 Min Meeting." | [Create Contact + Deal] [Dismiss] |
| Booking canceled | "John canceled 30 Min Meeting (Apr 8)." | [View Deal] [Reschedule] |
| No-show detected | "John did not attend 30 Min Meeting (Apr 8)." | [Reschedule] [Mark Canceled] [Dismiss] |
| Transcript received | "Call transcript ready: Intro Call with John (32 min). 3 action items." | [View Transcript] [View Deal] |

#### Notification Resolution

All booking notifications with inline actions are **one-click resolvable**. The rep should never need to navigate away to complete the action. When "Link to This Deal" is clicked:
1. Update `crm_booking_links.deal_id` to the selected deal
2. Run the standard post-booking logic (auto-advance, log activity)
3. Dismiss the notification
4. Show confirmation toast

---

## UI Components

### Settings > Integrations Page

```
┌─────────────────────────────────────────────┐
│ Integrations                                │
│                                             │
│ ┌─────────────────────────────────────────┐ │
│ │ Google Calendar              Connected  │ │
│ │ john@company.com                        │ │
│ └─────────────────────────────────────────┘ │
│                                             │
│ ┌─────────────────────────────────────────┐ │
│ │ Calendly                      Connect   │ │
│ │ Schedule meetings from TG conversations │ │
│ │ Auto-advance deals on booking           │ │
│ └─────────────────────────────────────────┘ │
│                                             │
│ ┌─────────────────────────────────────────┐ │
│ │ Fireflies.ai                  Connect   │ │
│ │ Auto-capture meeting transcripts        │ │
│ │ AI summaries + action items in deals    │ │
│ │                                         │ │
│ │ [After connect, shows webhook setup     │ │
│ │  instructions with copy-paste URL]      │ │
│ └─────────────────────────────────────────┘ │
│                                             │
│ ┌─────────────────────────────────────────┐ │
│ │ Telegram                    Connected   │ │
│ │ Client session active                   │ │
│ └─────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
```

### "Send Booking Link" — Smart Defaults (2-Click Target)

The booking link UX adapts based on context to minimize clicks:

**Common case: 1 event type + deal context present (2 clicks)**
```
┌─────────────────────────────────────────┐
│ Conversation with @prospect             │
│ Deal: Acme Corp (#142)                  │
│                                         │
│ [You] Hey, let's schedule a call...     │
│ [Them] Sure, send me a link             │
│                                         │
│ [Send 30 Min Meeting Link]              │
│  ↑ One button, pre-filled.              │
│  Click = generate + copy to clipboard   │
│  Long-press = open full dialog          │
└─────────────────────────────────────────┘
```

**Multiple event types or no deal context (3-4 clicks)**
```
┌─────────────────────────────────────────┐
│ ┌─────────────────────────────────────┐ │
│ │ Send Booking Link                   │ │
│ │                                     │ │
│ │ Event Type: [30 Min Meeting    v]   │ │
│ │             [60 Min Deep Dive  v]   │ │
│ │ Link to Deal: [Deal #142       v]   │ │
│ │                                     │ │
│ │ [Generate & Copy]  [Send in Chat]   │ │
│ └─────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

**Empty state: Calendly not connected**
```
┌─────────────────────────────────────────┐
│ ┌─────────────────────────────────────┐ │
│ │ Connect Calendly to send booking    │ │
│ │ links from conversations.           │ │
│ │                                     │ │
│ │ [Connect Calendly]                  │ │
│ └─────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

**Empty state: No event types in Calendly**
```
┌─────────────────────────────────────────┐
│ ┌─────────────────────────────────────┐ │
│ │ No event types found in Calendly.   │ │
│ │ Create one in your Calendly         │ │
│ │ dashboard first.                    │ │
│ │                                     │ │
│ │ [Open Calendly]                     │ │
│ └─────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

### Deal Detail — Meetings Tab

```
┌──────────────────────────────────────────────┐
│ Deal: Acme Corp Partnership                  │
│ Stage: Video Call                             │
│                                              │
│ [Overview] [Activity] [Meetings] [Notes]     │
│                                              │
│ Upcoming                                     │
│ ┌──────────────────────────────────────────┐ │
│ │ 30 Min Meeting with john@acme.com       │ │
│ │ Apr 8, 2026 at 3:00 PM UTC             │ │
│ │ Status: Scheduled                       │ │
│ │ Booked via: TG Group "Acme Partners"    │ │
│ └──────────────────────────────────────────┘ │
│                                              │
│ Past Meetings                                │
│ ┌──────────────────────────────────────────┐ │
│ │ Intro Call — Apr 2, 2026 (32 min)       │ │
│ │                                         │ │
│ │ Summary: Discussed partnership terms,    │ │
│ │ pricing model, and integration timeline. │ │
│ │ Prospect is interested but needs board   │ │
│ │ approval.                               │ │
│ │                                         │ │
│ │ Action Items:                           │ │
│ │ [ ] Send pricing deck (assigned: you)   │ │
│ │ [ ] Schedule follow-up after board mtg  │ │
│ │                                         │ │
│ │ Sentiment: 72% positive                 │ │
│ │ [View Full Transcript]                  │ │
│ └──────────────────────────────────────────┘ │
│                                              │
│ No-Shows                                     │
│ ┌──────────────────────────────────────────┐ │
│ │ 30 Min Meeting — Apr 1 (no-show)        │ │
│ │ john@acme.com did not attend             │ │
│ │ [Reschedule] [Dismiss]                  │ │
│ └──────────────────────────────────────────┘ │
└──────────────────────────────────────────────┘
```

### Deal Activity Timeline (Unified, with Filtering)

```
┌──────────────────────────────────────────────┐
│ Activity           [Filter: All v] [Collapse]│
│                                              │
│ Apr 4 — Transcript received: Intro Call      │
│         Summary: Discussed partnership...    │
│         3 action items extracted             │
│                                              │
│ Apr 4 — Auto-advanced to "Video Call"        │
│         Triggered by: Calendly booking       │
│                                              │
│ Apr 3 — Meeting scheduled with john@acme.com │
│         30 Min Meeting — Apr 8 at 3:00 PM    │
│                                              │
│ Apr 3 — Booking link sent                    │
│         Via: TG Group "Acme Partners"        │
│                                              │
│ Apr 2 — Stage changed: Outreach → Calendly   │
│         Sent                                 │
│                                              │
│ Filter options: All | Meetings | Stage       │
│ Changes | Messages | Notes                   │
└──────────────────────────────────────────────┘
```

---

## Workflow Builder Integration

### New Trigger Nodes

| Trigger | Fires When | Payload |
|---------|-----------|---------|
| `booking.scheduled` | Calendly `invitee.created` webhook | `{ deal_id, contact_id, invitee_email, event_type, scheduled_at }` |
| `booking.canceled` | Calendly `invitee.canceled` webhook | `{ deal_id, contact_id, reason, rescheduled: boolean }` |
| `booking.rescheduled` | Calendly cancel + rebook | `{ deal_id, old_time, new_time }` |
| `booking.no_show` | No-show detection cron | `{ deal_id, contact_id, scheduled_at, event_type }` |
| `meeting.transcribed` | Fireflies transcript ready | `{ deal_id, contact_id, summary, action_items, sentiment }` |

### New Action Nodes

| Action | Does What | Config |
|--------|----------|--------|
| `generate_booking_link` | Creates a tracked Calendly link for a deal | `{ event_type_uri }` → outputs `{{ booking_url }}` |
| `send_booking_link_tg` | Generates link + sends it in a TG conversation | `{ event_type_uri, tg_chat_id }` |
| `advance_deal_stage` | Moves deal to specified stage | `{ target_stage: "Video Call" }` |
| `create_task_from_transcript` | Creates CRM tasks from Fireflies action items | `{ auto_assign: boolean }` |

### New Condition Nodes

| Condition | Branches On | Example |
|-----------|------------|---------|
| `sentiment_check` | Fireflies sentiment score | `if sentiment > 0.7 → "Positive" else → "Needs Attention"` |
| `booking_status` | Current booking status | `if status == "canceled" → "Follow Up" else → continue` |
| `contact_exists` | Whether invitee email matches a contact | `if matched → "Existing" else → "New Lead"` |
| `time_elapsed_since` | Time since a timestamp field | `if time_since(booking.scheduled_at) > 30min → "Overdue"` |

### Example Workflow: Auto-Advance + Notify

```
[Trigger: booking.scheduled]
    │
    ▼
[Condition: contact_exists]
    │           │
    ▼           ▼
  [Yes]       [No]
    │           │
    ▼           ▼
[Action:    [Action:
 advance     create_contact]
 deal to        │
 "Video         ▼
  Call"]    [Action:
    │        advance deal]
    ▼           │
[Action:        ▼
 send TG    [Action:
 message:    send TG message]
 "Meeting
  booked!"]
```

### Example Workflow: No-Show Follow-Up

```
[Trigger: booking.no_show]
    │
    ▼
[Condition: time_elapsed_since(booking.scheduled_at)]
    │                    │
    ▼                    ▼
  [< 2 hours]        [> 2 hours]
    │                    │
    ▼                    ▼
[Action:             [Action:
 send TG msg:         send email:
 "Hey, looks like     "Sorry we missed
  we missed each       you. Here's a
  other. Want to       new link to
  reschedule?"]        reschedule."
    │                    │
    ▼                    ▼
[Action:             [Action:
 generate new         generate new
 booking link]        booking link]
```

---

## Environment Variables (New)

```env
# Calendly
CALENDLY_CLIENT_ID=
CALENDLY_CLIENT_SECRET=
CALENDLY_WEBHOOK_SIGNING_KEY=

# Fireflies
# (No app-level keys — each user connects their own API key)
# Webhook verification uses per-connection secrets stored in DB
```

---

## Phased Rollout

### Phase 1: Calendly Integration + Foundation

**Calendly OAuth + tracked booking links + webhook auto-stage-advance + activity timeline**

Ship the first user-visible value together with the foundation it needs. No standalone infrastructure phases — the activity timeline ships with the Calendly integration that writes to it.

- Build `matchOrCreateContact(email, name, userId)` utility
- Create `crm_deal_activities` table + migrate existing activity endpoint to read/write from it
- Backfill existing stage changes into activity timeline
- Add activity timeline UI to deal detail page (with filter + collapse)
- Settings page: Connect/disconnect Calendly (OAuth flow)
- Generate tracked single-use booking links with deal/contact metadata
- Webhook handler: auto-advance deal on booking, log activity
- "Send Booking Link" button in conversation UI **AND TMA deal page** (smart defaults — 2 clicks)
- Event type picker with caching (5 min TTL)
- Handle edge cases: unmatched bookings, multi-deal contacts, cancellations, rescheduling
- In-app notifications with inline resolution for unmatched bookings
- No-show detection cron job (every 15 min)
- Calendly API rate limiting + token refresh

**Files:**
- `lib/contacts/match-or-create.ts`
- `supabase/migrations/XXX_deal_activities_and_calendly.sql`
- `app/api/deals/[id]/activities/route.ts`
- `components/deals/activity-timeline.tsx`
- `app/api/calendly/connect/route.ts`
- `app/api/calendly/callback/route.ts`
- `app/api/calendly/disconnect/route.ts`
- `app/api/calendly/booking-link/route.ts`
- `app/api/calendly/event-types/route.ts`
- `app/api/webhooks/calendly/route.ts`
- `app/api/cron/booking-no-shows/route.ts`
- `lib/calendly/client.ts` (API client with token refresh + rate limiting)
- `components/calendly/connect-button.tsx`
- `components/calendly/booking-link-button.tsx` (smart defaults component)
- `components/calendly/booking-link-dialog.tsx` (full dialog for multi-event-type)
- `components/calendly/event-type-picker.tsx`
- `app/settings/integrations/calendly-section.tsx`
- `app/tma/deals/[id]/components/booking-link-action.tsx`

### Phase 2: Fireflies Integration

**API key connection + webhook transcript ingestion + reconciliation + deal timeline**

- Settings page: Connect/disconnect Fireflies (with webhook setup instructions)
- Webhook handler: pull transcript on completion, match to deal
- Reconciliation cron job (every 30 min) to catch missed webhooks
- Meeting transcript card in deal detail (Meetings tab)
- Action item extraction into CRM tasks
- Sentiment display
- Transcript activity entries in timeline

**Files:**
- `supabase/migrations/XXX_fireflies_integration.sql`
- `app/api/fireflies/connect/route.ts`
- `app/api/fireflies/disconnect/route.ts`
- `app/api/webhooks/fireflies/route.ts`
- `app/api/cron/fireflies-reconcile/route.ts`
- `lib/fireflies/client.ts` (GraphQL client)
- `components/fireflies/connect-button.tsx`
- `components/fireflies/webhook-setup-instructions.tsx`
- `components/deals/meeting-transcript-card.tsx`
- `app/settings/integrations/fireflies-section.tsx`

### Phase 3: TG-Native Booking (Moat Feature)

**Inline keyboard booking inside Telegram — no browser redirect**

This is the competitive differentiator. A prospect can book a call without leaving Telegram. No other Telegram CRM does this.

- Bot sends time slot buttons via inline keyboard
- Contact picks a slot, bot calls Calendly Scheduling API server-side (`POST /invitees`)
- Booking confirmed entirely within Telegram — no redirect, no browser
- AI-powered scheduling: "book a call with @prospect for Thursday"
- Deal-context-aware pre-meeting reminder via TG bot DM:
  "Deal #142 call in 15 min — last TG message was 3 days ago, they asked about pricing"

**Files:**
- `bot/handlers/booking.ts`
- `bot/handlers/ai-scheduling.ts`
- `app/tma/deals/[id]/booking/page.tsx`

### Phase 4: Workflow Builder Nodes

**New triggers, actions, and conditions for automation**

- Register new node types in the workflow builder palette
- Implement execution handlers in workflow engine
- Add `booking.no_show` trigger and `time_elapsed_since` condition
- Add workflow templates for common patterns:
  - Auto-advance on booking
  - No-show follow-up with reschedule link
  - Post-call summary + task creation
  - Negative sentiment alert
- Wire Calendly/Fireflies events into the existing webhook trigger infrastructure

**Files:**
- `packages/supra-loop-builder/src/components/nodes/calendly-trigger-node.tsx`
- `packages/supra-loop-builder/src/components/nodes/fireflies-trigger-node.tsx`
- `packages/supra-loop-builder/src/components/nodes/booking-action-node.tsx`
- `packages/supra-loop-builder/src/components/nodes/time-elapsed-condition-node.tsx`
- `lib/workflow-actions.ts` (extend with new action types)
- `packages/supra-loop-builder/src/lib/flow-templates.ts` (add templates)

---

## Edge Cases + Error Handling

### Unmatched Bookings
When a Calendly booking comes in but can't be matched to a deal:
1. Search `crm_contacts` by invitee email
2. If contact found with open deals → notification with **inline "Link to Deal" action** (one-click, best guess pre-selected)
3. If contact found with no deals → notification: "New booking from existing contact" + **[Create Deal]** action
4. If no contact → notification: "New booking from unknown contact" + **[Create Contact + Deal]** action
5. Always store the booking in `crm_booking_links` (deal_id=NULL) for manual linking
6. Surface unlinked bookings in a dedicated "Unlinked Bookings" section in the inbox

### Multi-Deal Ambiguity
When a contact has multiple open deals:
1. Prefer the deal in "Calendly Sent" or "Outreach" stage (most likely candidate)
2. If multiple candidates → notification asking rep to link manually with all options listed
3. Never auto-advance the wrong deal — accuracy > automation
4. Default to asking, not guessing

### No-Show Detection
- Cron runs every 15 minutes
- A booking is "no-show" when: `scheduled_at + duration + 30min < NOW()` and no transcript exists
- Before marking: check if transcript arrived (meeting happened, Fireflies was slow)
- On no-show: update status, log activity, fire `booking.no_show` trigger, notify rep
- Rep actions: [Reschedule] generates new booking link, [Mark Canceled] updates status

### Token Expiry
- Calendly tokens expire after 2 hours
- Implement refresh-before-use pattern (same as Google Calendar)
- If refresh fails → mark connection as inactive, notify user to reconnect
- Stale connections surface a banner on the Settings > Integrations page

### Webhook Reliability
- Always return 200 to Calendly/Fireflies (never reject webhooks)
- Log all incoming webhooks for debugging (webhook_logs table or structured logs)
- Implement idempotency: check `calendly_event_uri` uniqueness before processing
- If downstream processing fails, log error and create admin notification
- Fireflies reconciliation cron catches missed webhooks every 30 minutes

### Canceled/Rescheduled Meetings
- Cancellation: update booking status, log activity, fire workflow trigger
- Do NOT regress deal stage automatically (rep decides)
- Rescheduling: Calendly fires cancel + new create — handle as linked events
- Detect reschedule via `rescheduled: true` flag in cancel payload

### Fireflies Matching
- Primary: `booking_link.scheduled_at` ±15min window + attendee email overlap
- Secondary: attendee email → `crm_contacts` → most recently active deal
- Fallback: store transcript with `deal_id=NULL`, surface in "Unlinked Meetings" view
- Never discard transcript data even if matching fails

---

## Security Considerations

- All Calendly/Fireflies tokens encrypted with AES-256-GCM (existing `lib/crypto.ts` pattern)
- Webhook signatures verified before processing any payload (HMAC-SHA256)
- OAuth state uses HMAC-signed JWT with nonce (existing calendar pattern)
- No Calendly/Fireflies credentials exposed to browser — all API calls server-side
- RLS policies: connections private, booking/transcript/activity data team-readable
- Booking links contain UTM params with deal/contact IDs — UUIDs (non-guessable) but treated as internal metadata
- Fireflies API keys are user-specific — each user connects their own account
- Fireflies webhook URL includes user_id in query param — validated against webhook secret to prevent spoofing

---

## CPO Review Notes

### Sarah Chen — Strategic CPO (8.2/10)

**Strengths identified:**
- Plan follows existing architecture faithfully (OAuth, encryption, webhook patterns)
- Activity timeline table as foundation is the most important piece
- "Never regress deal stage" policy is correct
- Phase 5 TG-native booking correctly identified as moat

**Feedback incorporated:**
- [x] TMA booking link moved from Phase 5 to Phase 1 (same component, different render context)
- [x] Fireflies reconciliation cron job added (30 min polling fallback)
- [x] `raw_transcript` column removed — fetch on demand via `transcript_url`
- [x] Calendly API caching added (event types 5min TTL, user info 1hr)
- [x] Fireflies webhook registration clarified (manual setup required — inline instructions in UI)
- [x] RLS policies made consistent (team-readable, owner-writable across all tables)
- [x] Activity endpoint migration explicitly included in Phase 1

### Elena Voronova — BD Workflow CPO (69/100 → targeting 78-80)

**Strengths identified:**
- Auto-advance from "Calendly Sent" to "Video Call" eliminates manual drag-card workflow
- UTM-based tracking is clean
- "Do NOT regress deal stage" is correct policy
- Security model follows existing patterns

**Feedback incorporated:**
- [x] "Send Booking Link" compressed to 2 clicks (auto-select sole event type, pre-fill deal from context)
- [x] No-show detection added with `booking.no_show` workflow trigger
- [x] Notification system defined with inline one-click resolution actions
- [x] `time_elapsed_since` condition node added to workflow builder
- [x] TG-native booking moved from Phase 5 to Phase 3 (before workflow nodes)
- [x] Activity timeline gets filter + collapse controls
- [x] Empty states specified for all UI components
- [x] Pre-meeting context reminder added to Phase 3 (deal-aware TG bot DM)

### Open Items to Resolve Before Implementation

1. **Calendly rate limits** — Verify exact limits per OAuth token. Plan assumes ~100/min but needs confirmation.
2. **Calendly paid plan requirement** — Document which Calendly plans support the Scheduling API and webhook subscriptions.
3. **Fireflies plan requirement** — Verify which Fireflies plans support API access and webhooks.
4. **Bulk booking link generation** — Not addressed in this plan. A rep doing outreach to 10 prospects in a TG group cannot efficiently generate 10 tracked links. Consider for Phase 2 or later.
5. **Pre-meeting context reminders** — Phase 3 mentions deal-aware reminders. Needs design spec for how far in advance, what context to include, and how to avoid notification fatigue.
