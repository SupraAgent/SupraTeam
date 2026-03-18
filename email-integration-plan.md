# SupraCRM Email Integration — Implementation Plan
**Date:** 2026-03-18 | **Status:** Draft for review

---

## Executive Summary

Embed a Superhuman-style email client directly into SupraCRM so BD/Marketing/Admin team members can manage email without leaving the CRM. Email threads link to deals and contacts. AI assists with drafting. Keyboard-driven workflow throughout.

**Recommended approach:** Build a custom email module inside SupraCRM using patterns extracted from Mail-0/Zero (MIT). Use Gmail API and Microsoft Graph API directly. Store connection tokens in the existing `user_tokens` table. No external email service dependency.

**Why not fork Mail-0/Zero wholesale:**
- It runs on Cloudflare Workers + Hono + React Router — we run Next.js + Supabase
- Its auth is Better Auth — we use Supabase Auth
- Its storage layer is Cloudflare KV/R2/Vectorize — we use Supabase/PostgreSQL
- What IS portable: the driver abstraction pattern, AI composition approach, and UI patterns

---

## What We Have Today

| Asset | Status |
|-------|--------|
| Research: 7 open source clients compared | Done |
| Research: Mail-0 technical deep-dive (API, drivers, AI, DB) | Done |
| Research: Calendar/scheduling tools | Done |
| Token encryption (AES-256-GCM) | Built |
| `user_tokens` table for provider credentials | Built |
| OAuth infrastructure (Supabase Auth + GitHub) | Built |
| Settings > Integrations page (currently Telegram only) | Built |
| Contact records with email field | Built |
| Deal records linkable to contacts | Built |
| Notification system | Built |
| Command palette (⌘K) | Built |

---

## Architecture Decision: API-Based, Not IMAP

Following Mail-0/Zero's approach: use Gmail API and Microsoft Graph API directly. No IMAP/SMTP.

**Why:**
- Push notifications (real-time inbox updates) vs IMAP polling
- Rich metadata (labels, threads, read status) native to the API
- OAuth2 tokens — no stored passwords
- Better rate limiting and quota management
- Same approach Superhuman uses

---

## Phase Breakdown

### Phase E0: OAuth + Email Connection (Foundation)
**Goal:** Users can connect their Gmail/Outlook accounts in Settings.

**Database migrations:**

```sql
-- 008_email_connections.sql
CREATE TABLE crm_email_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('gmail', 'outlook')),
  email TEXT NOT NULL,
  access_token_encrypted TEXT NOT NULL,
  refresh_token_encrypted TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ,
  scopes TEXT[],
  is_default BOOLEAN DEFAULT false,
  connected_at TIMESTAMPTZ DEFAULT now(),
  last_sync_at TIMESTAMPTZ,
  UNIQUE(user_id, email)
);

ALTER TABLE crm_email_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own connections"
  ON crm_email_connections FOR ALL
  USING (auth.uid() = user_id);
```

**API routes:**

| Route | Purpose |
|-------|---------|
| `GET /api/email/connections` | List user's connected accounts |
| `POST /api/email/connections/gmail` | Initiate Gmail OAuth flow |
| `POST /api/email/connections/outlook` | Initiate Outlook OAuth flow |
| `GET /api/email/callback/gmail` | Gmail OAuth callback — exchange code for tokens |
| `GET /api/email/callback/outlook` | Outlook OAuth callback |
| `DELETE /api/email/connections/[id]` | Disconnect an account |
| `POST /api/email/connections/[id]/refresh` | Force token refresh |

**OAuth setup required:**
- Google Cloud Console: Create OAuth 2.0 credentials, enable Gmail API
- Azure Portal: Register app, enable Microsoft Graph `Mail.ReadWrite`, `Mail.Send`
- Scopes for Gmail: `gmail.readonly`, `gmail.send`, `gmail.modify`, `gmail.labels`
- Scopes for Outlook: `Mail.ReadWrite`, `Mail.Send`, `User.Read`

**Environment variables (new):**

```env
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
MICROSOFT_CLIENT_ID=
MICROSOFT_CLIENT_SECRET=
EMAIL_OAUTH_REDIRECT_URI=http://localhost:3002/api/email/callback
```

**UI:**
- Settings > Integrations page: Add "Email" card alongside existing Telegram card
- "Connect Gmail" and "Connect Outlook" buttons
- Show connected accounts with email, provider icon, connection date
- Disconnect button per account
- Default account selector (if multiple connected)

**Files to create/modify:**
- `supabase/migrations/008_email_connections.sql` — new
- `lib/email/types.ts` — MailProvider interface, thread/message types
- `lib/email/gmail.ts` — Gmail driver (googleapis package)
- `lib/email/outlook.ts` — Outlook driver (@microsoft/microsoft-graph-client)
- `lib/email/driver.ts` — Driver factory (provider → concrete driver)
- `app/api/email/connections/route.ts` — connections CRUD
- `app/api/email/connections/gmail/route.ts` — Gmail OAuth initiation
- `app/api/email/connections/outlook/route.ts` — Outlook OAuth initiation
- `app/api/email/callback/gmail/route.ts` — Gmail callback
- `app/api/email/callback/outlook/route.ts` — Outlook callback
- `app/settings/integrations/page.tsx` — add email connection UI

**New dependencies:**
- `googleapis` — Gmail API client
- `@microsoft/microsoft-graph-client` — Outlook API client
- `@azure/msal-node` — Microsoft auth library

---

### Phase E1: Inbox View (Core Email UI)
**Goal:** Threaded inbox view at `/email` with keyboard navigation.

**Sidebar update:**
- Add "Email" nav item between Pipeline and Contacts (with unread badge)

**Page: `/email`**

Layout: Split-pane (list left, thread right) — Superhuman pattern.

```
┌──────────────────────────────────────────────────────┐
│ ☰ Inbox ▾  │  Search...                    ⌘K      │
├─────────────┼────────────────────────────────────────┤
│ ★ John D.   │  Subject: Partnership Proposal         │
│   Re: Part… │                                        │
│             │  From: john@example.com                │
│   Jane S.   │  To: me@supra.com                     │
│   Meeting…  │  Mar 17, 2026 2:34 PM                 │
│             │                                        │
│   Bob K.    │  Hi team,                              │
│   Invoice…  │                                        │
│             │  I wanted to follow up on our          │
│             │  conversation about...                 │
│             │                                        │
│             │  ─────────────────────────────          │
│             │  [Reply] [Forward] [Archive]           │
└─────────────┴────────────────────────────────────────┘
```

**API routes:**

| Route | Purpose |
|-------|---------|
| `GET /api/email/threads` | List threads (paginated, label filter) |
| `GET /api/email/threads/[id]` | Get full thread with messages |
| `POST /api/email/threads/[id]/read` | Mark read |
| `POST /api/email/threads/[id]/unread` | Mark unread |
| `POST /api/email/threads/[id]/archive` | Archive |
| `POST /api/email/threads/[id]/star` | Toggle star |
| `POST /api/email/threads/[id]/trash` | Move to trash |
| `POST /api/email/threads/[id]/snooze` | Snooze until datetime |
| `POST /api/email/threads/[id]/labels` | Modify labels |
| `GET /api/email/labels` | List labels/folders |
| `GET /api/email/search` | Search emails |

**Driver interface (lib/email/types.ts):**

```typescript
interface MailDriver {
  // Threads
  listThreads(params: ListThreadsParams): Promise<ThreadList>
  getThread(threadId: string): Promise<Thread>

  // Actions
  markAsRead(threadId: string): Promise<void>
  markAsUnread(threadId: string): Promise<void>
  archive(threadId: string): Promise<void>
  trash(threadId: string): Promise<void>
  toggleStar(threadId: string): Promise<void>
  modifyLabels(threadId: string, add: string[], remove: string[]): Promise<void>

  // Send
  send(params: SendParams): Promise<Message>
  reply(threadId: string, params: ReplyParams): Promise<Message>
  forward(messageId: string, params: ForwardParams): Promise<Message>
  createDraft(params: DraftParams): Promise<Draft>

  // Search
  search(query: string, maxResults?: number): Promise<ThreadList>

  // Labels
  listLabels(): Promise<Label[]>

  // Attachments
  getAttachment(messageId: string, attachmentId: string): Promise<Attachment>

  // Metadata
  getProfile(): Promise<EmailProfile>
}

interface Thread {
  id: string
  subject: string
  snippet: string
  from: EmailAddress[]
  to: EmailAddress[]
  messages: Message[]
  labelIds: string[]
  isUnread: boolean
  isStarred: boolean
  lastMessageAt: string  // ISO timestamp
  messageCount: number
}

interface Message {
  id: string
  threadId: string
  from: EmailAddress
  to: EmailAddress[]
  cc: EmailAddress[]
  bcc: EmailAddress[]
  subject: string
  body: string          // sanitized HTML
  bodyText: string      // plain text
  date: string
  attachments: AttachmentMeta[]
  isUnread: boolean
}
```

**Components:**

| Component | File | Purpose |
|-----------|------|---------|
| `EmailLayout` | `app/email/layout.tsx` | Split-pane container |
| `ThreadList` | `components/email/thread-list.tsx` | Scrollable thread list with keyboard nav |
| `ThreadRow` | `components/email/thread-row.tsx` | Single thread in list (sender, subject, snippet, time, star) |
| `ThreadView` | `components/email/thread-view.tsx` | Full thread display (messages stacked) |
| `MessageBubble` | `components/email/message-bubble.tsx` | Single message in thread |
| `EmailToolbar` | `components/email/email-toolbar.tsx` | Actions bar (reply, forward, archive, labels, snooze) |
| `LabelSidebar` | `components/email/label-sidebar.tsx` | Label/folder filter (Inbox, Sent, Drafts, labels) |
| `EmailSearch` | `components/email/email-search.tsx` | Search bar with autocomplete |

**Keyboard shortcuts (Superhuman-inspired):**

| Key | Action |
|-----|--------|
| `j` / `k` | Next / previous thread |
| `Enter` | Open thread |
| `Escape` | Back to list |
| `e` | Archive |
| `#` | Delete/trash |
| `r` | Reply |
| `a` | Reply all |
| `f` | Forward |
| `s` | Toggle star |
| `u` | Mark unread |
| `l` | Add label |
| `z` | Undo last action |
| `/` | Focus search |
| `c` | Compose new |
| `[` / `]` | Archive & go prev/next |
| `h` | Snooze |

**Files to create:**
- `app/email/page.tsx` — main email page
- `app/email/layout.tsx` — split-pane layout
- `components/email/thread-list.tsx`
- `components/email/thread-row.tsx`
- `components/email/thread-view.tsx`
- `components/email/message-bubble.tsx`
- `components/email/email-toolbar.tsx`
- `components/email/label-sidebar.tsx`
- `components/email/email-search.tsx`
- `lib/email/hooks.ts` — useThreads, useThread, useEmailActions, useKeyboardShortcuts
- All `/api/email/*` routes listed above

**Rendering emails safely:**
- Sanitize HTML with `sanitize-html` (strip scripts, event handlers, external images by default)
- Render in sandboxed div with `srcdoc` iframe fallback for complex HTML emails
- Block remote image tracking pixels by default (user can toggle per-sender)

---

### Phase E2: Compose & Reply (Rich Text Editor)
**Goal:** Compose, reply, reply-all, forward with rich text editor.

**Editor:** TipTap (MIT, same as Mail-0/Zero uses). Rich text email composition with:
- Bold, italic, underline, strikethrough
- Links (auto-detect URLs)
- Bullet/numbered lists
- Blockquotes (for replies)
- Inline images
- Attachments (drag-drop or file picker)
- Signature block (configurable in Settings)

**Components:**

| Component | File | Purpose |
|-----------|------|---------|
| `ComposeModal` | `components/email/compose-modal.tsx` | Full compose window (modal or inline) |
| `ComposeEditor` | `components/email/compose-editor.tsx` | TipTap editor wrapper |
| `RecipientInput` | `components/email/recipient-input.tsx` | To/Cc/Bcc with autocomplete from CRM contacts |
| `AttachmentBar` | `components/email/attachment-bar.tsx` | File upload + attachment list |
| `SignatureEditor` | `components/email/signature-editor.tsx` | Signature setup in Settings |

**API routes:**

| Route | Purpose |
|-------|---------|
| `POST /api/email/send` | Send email |
| `POST /api/email/reply` | Reply to thread |
| `POST /api/email/forward` | Forward message |
| `POST /api/email/drafts` | Save draft |
| `GET /api/email/drafts` | List drafts |
| `DELETE /api/email/drafts/[id]` | Delete draft |

**CRM-specific compose features:**
- **Contact autocomplete**: To/Cc/Bcc fields search `crm_contacts` table by name and email
- **Deal context**: When composing from a deal page, auto-link the thread to the deal
- **Templates**: Reusable email templates for common BD outreach messages

**New dependencies:**
- `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-link`, `@tiptap/extension-image`, `@tiptap/extension-placeholder`
- `sanitize-html`

---

### Phase E3: CRM ↔ Email Linking
**Goal:** Emails automatically associate with deals and contacts. Users can manually link too.

**Database migration:**

```sql
-- 009_email_deal_links.sql
CREATE TABLE crm_email_thread_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id TEXT NOT NULL,          -- Gmail/Outlook thread ID
  provider TEXT NOT NULL,
  email_account TEXT NOT NULL,      -- which connected account
  deal_id UUID REFERENCES crm_deals(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES crm_contacts(id) ON DELETE SET NULL,
  linked_at TIMESTAMPTZ DEFAULT now(),
  linked_by UUID REFERENCES auth.users(id),
  auto_linked BOOLEAN DEFAULT false -- true if system matched by email address
);

CREATE INDEX idx_thread_links_deal ON crm_email_thread_links(deal_id);
CREATE INDEX idx_thread_links_contact ON crm_email_thread_links(contact_id);
CREATE INDEX idx_thread_links_thread ON crm_email_thread_links(thread_id);
```

**Auto-linking logic:**
1. When a thread is loaded, extract all participant email addresses
2. Match against `crm_contacts.email`
3. If a contact is found and has deals, suggest linking (or auto-link if unambiguous)
4. Show linked deals/contacts in thread sidebar

**UI additions:**
- **Thread sidebar panel**: Shows linked deal(s) and contact(s) for current thread
- **Deal detail page**: New "Email" tab showing all threads linked to this deal
- **Contact detail page**: New "Email" tab showing all threads with this contact
- **Manual link button**: "Link to deal" picker in thread view
- **Email activity in deal timeline**: Stage changes + email touchpoints in one view

**API routes:**

| Route | Purpose |
|-------|---------|
| `GET /api/email/threads/[id]/links` | Get deal/contact links for a thread |
| `POST /api/email/threads/[id]/links` | Create manual link |
| `DELETE /api/email/threads/[id]/links/[linkId]` | Remove link |
| `GET /api/deals/[id]/emails` | Get all email threads for a deal |
| `GET /api/contacts/[id]/emails` | Get all email threads for a contact |

---

### Phase E4: AI Features
**Goal:** AI-assisted email drafting, thread summaries, smart search.

**Using Vercel AI SDK (`ai` package)** — framework-agnostic, works in Next.js API routes. Same approach as Mail-0/Zero.

**Features:**

| Feature | Description | API Route |
|---------|-------------|-----------|
| AI Draft Reply | Generate reply based on thread context + user writing style | `POST /api/email/ai/draft` |
| AI Compose | Generate email from a prompt ("write an intro email to X about Y") | `POST /api/email/ai/compose` |
| Thread Summary | Summarize long thread into 2-3 bullet points | `POST /api/email/ai/summarize` |
| Smart Search | Natural language → email search query conversion | `POST /api/email/ai/search` |
| Tone Adjustment | Rewrite draft in different tone (formal, casual, shorter, etc.) | `POST /api/email/ai/adjust-tone` |

**Writing style personalization:**
- Analyze user's sent emails (last 50) to build a style profile
- Store in `crm_email_connections.writing_style_json`
- Pass to AI as context when generating drafts
- Same pattern Mail-0/Zero uses (`writingStyleMatrix` table)

**AI integration in compose:**
- "Draft with AI" button in compose modal
- Inline suggestions (Tab to accept, like Copilot)
- Tone selector dropdown (Professional / Friendly / Concise / Custom)

**New dependencies:**
- `ai` (Vercel AI SDK)
- `@ai-sdk/openai` or `@ai-sdk/anthropic` (provider)

**New env vars:**
- `OPENAI_API_KEY` or `ANTHROPIC_API_KEY`

---

### Phase E5: Snooze, Send Later, Reminders
**Goal:** Time-based email features.

**Database migration:**

```sql
-- 010_email_scheduled.sql
CREATE TABLE crm_email_scheduled (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  connection_id UUID REFERENCES crm_email_connections(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('send_later', 'snooze', 'follow_up_reminder')),
  thread_id TEXT,                   -- for snooze/reminder
  draft_data JSONB,                 -- for send_later (serialized draft)
  scheduled_for TIMESTAMPTZ NOT NULL,
  executed_at TIMESTAMPTZ,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'executed', 'cancelled')),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_scheduled_pending
  ON crm_email_scheduled(scheduled_for)
  WHERE status = 'pending';
```

**Execution:** Cron job (or extend the existing bot process) that:
1. Polls `crm_email_scheduled` every 60 seconds for due items
2. `send_later` → sends the draft via Gmail/Outlook API
3. `snooze` → moves thread back to inbox (remove snooze label)
4. `follow_up_reminder` → creates a CRM notification

**UI:**
- Snooze picker: "Later today", "Tomorrow", "Next week", custom datetime
- Send later: clock icon in compose toolbar → datetime picker
- Follow-up reminder: "Remind me if no reply in X days" option in thread view

---

### Phase E6: Email Templates & Sequences (BD Power Feature)
**Goal:** Reusable templates and multi-step email sequences for BD outreach.

**Database migration:**

```sql
-- 011_email_templates.sql
CREATE TABLE crm_email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  subject TEXT,
  body TEXT NOT NULL,                -- HTML with {{variable}} placeholders
  variables TEXT[] DEFAULT '{}',     -- list of placeholder names
  board_type TEXT,                   -- scope to BD/Marketing/Admin or NULL for all
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE crm_email_sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  steps JSONB NOT NULL,              -- [{delay_days: 0, template_id: uuid}, {delay_days: 3, template_id: uuid}, ...]
  board_type TEXT,
  created_by UUID REFERENCES auth.users(id),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE crm_email_sequence_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id UUID REFERENCES crm_email_sequences(id) ON DELETE CASCADE,
  deal_id UUID REFERENCES crm_deals(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES crm_contacts(id) ON DELETE CASCADE,
  current_step INT DEFAULT 0,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'replied', 'bounced')),
  next_send_at TIMESTAMPTZ,
  enrolled_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);
```

**Template variables:** `{{contact_name}}`, `{{company}}`, `{{deal_name}}`, `{{sender_name}}`, `{{sender_title}}`, custom fields from deal field values.

**Sequence logic:**
- Enroll a deal/contact into a sequence
- System sends step 1 immediately (or on schedule)
- If recipient replies → auto-pause sequence, notify user, mark deal for follow-up
- If no reply → send next step after configured delay
- User can pause/resume/skip steps manually

**This is the killer BD feature** — competitors pay $100+/mo for tools like Outreach.io or Apollo for this.

---

## Navigation & UX Integration

### Updated Sidebar

```
Dashboard        /
Pipeline         /pipeline
Email            /email          ← NEW (with unread count badge)
Contacts         /contacts
─────────────
Settings         /settings
```

### Command Palette (⌘K) Additions

| Command | Action |
|---------|--------|
| "Compose email" | Open compose modal |
| "Search email: {query}" | Search emails |
| "Email {contact name}" | Compose to contact |
| "Link email to deal" | Open deal picker for current thread |

### Deal Detail Page — Email Tab

When viewing a deal, new "Emails" tab alongside existing notes/activity:
- Shows all linked email threads chronologically
- Quick compose button (pre-fills contact email)
- "Enroll in sequence" button
- Thread snippets with click-to-expand

### Contact Detail Page — Email Tab

- All email threads with this contact across all connected accounts
- Send history and response rates
- Quick compose

---

## Technical Considerations

### Token Refresh
- Gmail access tokens expire after 1 hour. Implement auto-refresh middleware.
- Use existing `lib/crypto.ts` AES-256-GCM for encrypting stored tokens.
- Refresh on 401 response, retry original request.

### Rate Limits
- Gmail API: 250 quota units/second per user. listThreads = 10 units, getMessage = 5 units.
- Microsoft Graph: 10,000 requests per 10 minutes per user.
- Implement exponential backoff + request queuing.

### Email HTML Rendering
- Use `sanitize-html` to strip dangerous content.
- Render in sandboxed `<iframe srcdoc>` for complex HTML emails.
- Block external images by default (privacy + tracking protection).
- Lazy-load images per-sender allowlist.

### No Email Storage
- Like Mail-0/Zero: emails are NOT stored in our database.
- We query Gmail/Outlook APIs on demand.
- Only metadata stored: thread links, scheduled actions, templates.
- Reduces storage costs, avoids data liability, stays fresh.

### Caching Strategy
- Client-side: React state + optional IndexedDB via Dexie for offline thread list
- Server-side: Optional Redis/Supabase cache for frequently accessed threads (60s TTL)
- Thread list pagination: cursor-based (Gmail `nextPageToken`, Outlook `@odata.nextLink`)

---

## Implementation Priority & Effort

| Phase | Effort | Dependencies | Ship Independently? |
|-------|--------|-------------|---------------------|
| E0: OAuth + Connections | 3-4 days | Google/Azure app setup | Yes (settings page) |
| E1: Inbox View | 5-7 days | E0 | Yes (read-only email) |
| E2: Compose & Reply | 4-5 days | E0, E1 | Yes (full email client) |
| E3: CRM ↔ Email Linking | 3-4 days | E0, E1 | Yes (CRM value-add) |
| E4: AI Features | 3-4 days | E2 | Yes (progressive enhancement) |
| E5: Snooze/Send Later | 2-3 days | E2 | Yes |
| E6: Templates & Sequences | 4-5 days | E2, E3 | Yes (BD power feature) |

**Total: ~24-32 days for a full Superhuman-in-CRM experience.**

**MVP (E0 + E1 + E2): ~12-16 days** — functional email client inside CRM.

**MVP + CRM value (E0-E3): ~15-20 days** — email linked to deals and contacts.

---

## New Dependencies Summary

| Package | Purpose | License |
|---------|---------|---------|
| `googleapis` | Gmail API | Apache-2.0 |
| `@microsoft/microsoft-graph-client` | Outlook/Graph API | MIT |
| `@azure/msal-node` | Microsoft OAuth | MIT |
| `@tiptap/react` + extensions | Rich text editor | MIT |
| `sanitize-html` | HTML email sanitization | MIT |
| `ai` + provider SDK | Vercel AI SDK for AI features | Apache-2.0 |
| `dexie` | Client-side IndexedDB cache (optional) | Apache-2.0 |

All MIT or Apache-2.0. No license conflicts.

---

## What This Replaces

| Current Tool | Replaced By | CRM Advantage |
|-------------|-------------|---------------|
| Gmail/Outlook web app | SupraCRM Email tab | Context alongside deals |
| Superhuman ($30/mo/user) | Built-in, $0 | Keyboard shortcuts, AI drafts |
| Outreach/Apollo ($100+/mo) | Email sequences (E6) | Integrated with deal pipeline |
| Manual email-deal tracking | Auto-linking (E3) | Every thread linked to deals |
| Separate AI writing tools | Built-in AI compose (E4) | Knows your deals and contacts |

---

## Open Questions for Jon

1. **Gmail only or Gmail + Outlook?** Outlook support adds ~40% more work. Does the team use Outlook?
2. **AI provider preference?** OpenAI (GPT-4o) vs Anthropic (Claude) for email AI features. Cost vs quality tradeoff.
3. **Start with E0-E2 (email client) or E0-E3 (email + CRM linking)?** The linking is where the CRM value really kicks in.
4. **Email sequences (E6) priority?** This is the highest-value BD feature but also the most complex. Build it early or after polish?
5. **Shared team inbox?** Should multiple team members see the same inbox, or strictly personal email per user?
6. **Google Workspace app setup** — who has admin access to create OAuth credentials for the Supra Google Workspace?
