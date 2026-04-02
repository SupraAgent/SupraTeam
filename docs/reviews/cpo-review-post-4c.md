# CPO Directive: The 3 Things That Matter

**Date:** 2026-03-28
**Persona:** Sarah Chen — CPO, 12 years shipping messaging CRMs (CRMChat, Intercom, Kommo). Deep Telegram-first expertise.
**Codebase:** Full audit of SupraCRM post-4c (PR #35 merged). Read every handler, every route, every component.

---

## My Assessment

I've seen dozens of CRMs try to bolt Telegram on as a channel. You're doing the opposite — building a CRM that lives inside Telegram. That's the right thesis.

But you're spreading thin. 48 pages, 52 migrations, visual workflow builder, multi-bot registry, A/B broadcast testing, AI sentiment, GDPR tooling. That's impressive engineering. It's also a product that does 20 things at 70% instead of 3 things at 95%.

I'm not going to rate 15 features. I'm going to tell you the 3 that decide whether this product wins or dies, what "done" looks like for each, and exactly what to build.

---

## The Thesis: Conversation IS the CRM

Every successful messaging CRM has one thing in common: **the conversation is the primary object, not the deal.** Deals are metadata on conversations. The rep's workflow is: see message → understand context → respond → update deal status. Not: open deal → find conversation → context-switch to Telegram → come back.

You have all the pieces. `tg_group_messages` stores every message. `ConversationTimeline` renders them in the deal detail Chat tab with reply capability. The inbox shows threads across all groups with realtime updates. The bot captures, stores, and can send.

But the pieces aren't connected into a workflow. The inbox is read-only. The conversation tab is the 2nd tab in deal detail, not the first. There's no concept of "this conversation needs a response." The CRM knows everything but can't act on anything.

Fix that and you win. Here are the 3 features, in order.

---

## Feature 1: The Actionable Inbox

**Why this is #1:** This is where reps live. Not the pipeline. Not the dashboard. The inbox. Every morning, a BD rep opens the CRM and asks: "What needs my attention?" Right now the answer is "go look at the read-only message viewer and figure it out yourself."

**What exists today:**
- `app/inbox/page.tsx` — split-pane UI, conversation list + message detail
- `app/api/inbox/route.ts` — fetches 500 messages across all CRM-linked groups, groups into threads
- Supabase realtime on `tg_group_messages` INSERT (with 1s debounce — good fix)
- Thread detection via `reply_to_message_id`
- Linked deals shown in conversation header
- Search across group names, messages, senders
- Deep links to Telegram for every message

**What's missing — and what "done" looks like:**

### 1a. Reply from Inbox

The plumbing exists. `/api/telegram-client/messages` can send via the user's MTProto session. `/api/bot/templates/test-send` can send via bot. But the inbox has no input field.

**Build:**
- Reply input at bottom of message detail pane (same pattern as `ConversationTimeline` in deal detail, which already has this)
- Two send modes: "Send as Bot" (uses bot token, appears as bot in group) and "Send as Me" (uses user's TG client session via `/api/telegram-client/messages`)
- "Send as Bot" is default if user has no MTProto session connected
- Sent message appears immediately in the thread (optimistic insert into local state, confirmed when it arrives back via realtime)
- Reply-to-message: clicking "Reply" on a specific message sets `reply_to_message_id` on the outbound message so it threads correctly in Telegram

**Files to change:**
- `app/inbox/page.tsx` — add `ReplyComposer` component below message detail
- `app/api/inbox/reply/route.ts` — new route: accepts `chat_id`, `message_text`, `reply_to_message_id?`, `send_as: 'bot' | 'user'`
- Route checks: user has access to this group (via `groupMap` validation, same pattern as the auth fix in PR #35)

### 1b. Conversation Status

Right now every conversation is the same — a flat list sorted by recency. Reps need to know: which ones need attention?

**Build:**
- New `status` concept per conversation (not per message). Stored in a new `crm_inbox_status` table: `chat_id`, `status` (open/snoozed/closed), `assigned_to`, `snoozed_until`, `updated_at`
- Default: every conversation with a message from a non-bot sender in the last 24h is "open"
- Rep can: **Assign** (to self or team member), **Snooze** (reappears after X hours), **Close** (moves to closed tab, reopens on new message)
- Inbox sidebar gets 3 tabs: **Mine** (assigned to me), **Unassigned** (no owner), **All**
- Unassigned count shown as badge in sidebar nav

**Files to create:**
- `supabase/migrations/053_inbox_status.sql` — `crm_inbox_status` table with RLS
- `app/api/inbox/status/route.ts` — GET/PATCH for conversation status
- Update `app/inbox/page.tsx` — tab filtering, assignment dropdown, snooze picker, close button

### 1c. Canned Responses

Reps answer the same 10 questions 50 times a day. "What's the token address?" "When does vesting start?" "Who's our contact at X?"

**Build:**
- `crm_canned_responses` table: `id`, `title`, `body` (with `{{deal_name}}`, `{{contact_name}}` merge vars), `category`, `created_by`, `usage_count`
- Slash-command trigger in reply composer: type `/` to search canned responses
- Insert selected response into reply input, render merge vars from linked deal context
- Settings page for managing canned responses (CRUD)

**Files to create:**
- `supabase/migrations/054_canned_responses.sql`
- `app/api/inbox/canned/route.ts` — CRUD
- `components/inbox/canned-response-picker.tsx` — slash-command dropdown
- `app/settings/inbox/page.tsx` — manage canned responses

### What "Done" Looks Like

Rep opens inbox → sees 3 unassigned conversations with orange badges → clicks one → reads thread → types `/vesting` → canned response fills in with deal-specific merge vars → sends as bot → clicks "Assign to me" → conversation moves to "Mine" tab → clicks "Snooze 4h" on another conversation that needs follow-up → it disappears and comes back at 2pm.

**That's a CRM inbox. What you have today is a Telegram message viewer.**

---

## Feature 2: Smart Assignment & Routing

**Why this is #2:** Without routing, every deal and every conversation starts unassigned. That works for a team of 3. It breaks at 8. It's unusable at 20. And it means your automation system — which is actually good — has no one to automate TO.

**What exists today:**
- `assigned_to` field on `crm_deals` — stores a profile UUID
- Manual assignment in deal detail panel
- Workflow action `assign_deal` can reassign via automation
- AI auto-created deals land unassigned
- `/contact` bot command shows assigned rep for a deal's linked group
- No round-robin. No rules engine. No load balancing.

**What "done" looks like:**

### 2a. Assignment Rules Engine

Not a workflow. Not "configure a React Flow canvas to assign a deal." A simple, dedicated rules system that runs on every deal creation and every conversation start.

**Build:**
- `crm_assignment_rules` table: `id`, `name`, `priority` (lower = first), `conditions` (JSONB), `action` (JSONB), `is_active`, `created_by`
- Conditions: `board_type`, `deal_value_gte`, `deal_value_lte`, `source`, `group_slug`, `contact_engagement_gte`
- Actions: `assign_to_user` (specific user), `round_robin` (among user list), `round_robin_by_role` (all users with crm_role)
- Evaluation: on deal creation (POST `/api/deals`), run rules in priority order, first match wins
- Round-robin state: `crm_assignment_round_robin` table with `rule_id`, `last_assigned_to`, `assigned_count`

**Files to create:**
- `supabase/migrations/055_assignment_rules.sql`
- `app/api/assignment-rules/route.ts` — CRUD
- `lib/assignment-engine.ts` — `evaluateAssignment(deal): string | null` — returns user ID
- Modify `app/api/deals/route.ts` POST — after deal creation, call `evaluateAssignment()`, update `assigned_to`

### 2b. Inbox Auto-Assignment

When a new unhandled conversation appears (message from non-bot sender, no existing `crm_inbox_status` row), run the same rules engine but with conversation context.

**Build:**
- Extend `evaluateAssignment()` to accept either a deal or a conversation
- For conversations: match on `group_slug`, `group_type`
- Auto-create `crm_inbox_status` row with `assigned_to` from rule match
- If no rule matches, stays unassigned (shows in "Unassigned" tab)

### 2c. Assignment UI

Simple settings page. Not a visual builder — a table.

**Build:**
- `app/settings/assignment/page.tsx` — list rules, drag to reorder priority, toggle active/inactive
- Create rule form: select conditions (dropdowns), select action type, pick users
- Show "Last 30 days" stats per rule: how many deals assigned, avg response time

**What "Done" Looks Like

Deal auto-created by AI agent → assignment engine runs → matches rule "BD board + value > $50k → round-robin between Jon and Alex" → deal assigned to Alex → Alex gets TMA push notification → opens inbox → conversation is pre-assigned to him in "Mine" tab.

That's the loop. AI qualifies → routing assigns → inbox surfaces → rep responds. Every piece exists except the routing.

---

## Feature 3: Conversation-First Deal Detail

**Why this is #3:** The deal detail panel has 4 tabs: Details, Chat, Activity, Docs. The default tab is Details. That's wrong. For a Telegram CRM, the default should be Chat. The conversation is the deal.

**What exists today:**
- `ConversationTimeline` component — renders messages from `/api/deals/[id]/conversation`
- Reply input at bottom with Send button (sends via MTProto or bot fallback)
- Message search within the conversation
- Pagination ("Load older messages")
- Date separators, sender grouping, bot vs human styling
- Telegram deep links per message
- AI sentiment analysis panel (with refresh)
- AI deal summary (with refresh)
- Deal health score indicator

This is actually further along than the inbox. The problem is layout and prominence.

### 3a. Conversation as Default View

**Build:**
- Default tab: `conversation` instead of `details`
- Widen the deal detail panel (currently a slide-over — make it full-width on desktop when conversation tab is active, or convert to a page: `/pipeline/deals/[id]`)
- Layout: conversation thread on the left (70%), deal metadata + AI insights on the right (30%)
- Deal metadata sidebar shows: stage (with dropdown to change), value, probability, assigned_to, health score, sentiment badge, contact card — all inline-editable without leaving the conversation view

**Files to change:**
- `components/pipeline/deal-detail-panel.tsx` — restructure layout, change default tab
- Consider: new route `app/pipeline/deals/[id]/page.tsx` for full-page deal detail (slide-over is too narrow for conversation-first UX)

### 3b. Conversation Context Cards

When a rep is reading a conversation, they need context without scrolling. Add inline context cards that appear at relevant points in the timeline.

**Build:**
- **Stage change cards**: when the deal stage changed, show a card in the timeline at that timestamp: "Deal moved to Follow Up by Jon"
- **Note cards**: when a note was added to the deal, show it inline: "Note by Alex: Called back, they need approval from legal"
- **AI insight cards**: when sentiment was last analyzed, show a card: "AI: Sentiment shifted negative — risk signals: delayed response, budget concerns"
- Data source: merge `/api/deals/[id]/activity` timeline with `/api/deals/[id]/conversation` messages, sort by timestamp

**Files to change:**
- `components/pipeline/conversation-timeline.tsx` — accept `activities` prop, merge with messages, render context cards with distinct styling (muted background, smaller font, icon)
- `app/api/deals/[id]/conversation/route.ts` — add `?include_activity=true` param that also returns stage changes + notes

### 3c. Quick Actions from Conversation

While reading a conversation, a rep should be able to act without switching tabs.

**Build:**
- Floating action bar above the reply input: **Move Stage** (dropdown), **Add Note** (inline expand), **Assign** (dropdown), **Mark Won/Lost** (with reason)
- These are the same APIs that already exist (`/api/deals/[id]/move`, `/api/deals/[id]/notes`, etc.) — just new UI surfaces
- After action, show a context card in the conversation timeline: "You moved this deal to Video Call"

**What "Done" Looks Like

Rep opens deal → immediately sees the Telegram conversation with context cards interspersed (stage changes, notes, AI insights) → reads the latest messages → sees the prospect asked about vesting → types `/vesting` for canned response → sends → clicks "Move to Follow Up" in the floating action bar → a context card appears: "Deal moved to Follow Up" → the sidebar shows the updated stage, health score ticks up.

The rep never left the conversation. The deal updated around them.

---

## What I'm NOT Choosing (and Why)

| Feature | Why Not Now |
|---------|------------|
| **TMA polish / SDK integration** | Important but secondary. The web CRM is where complex work happens. TMA is for quick checks. |
| **Testing / observability** | Yes you need it. But it doesn't move the competitive needle. Add it alongside, not instead of. |
| **Onboarding wizard** | Your users are internal. They have you. Fix this when you sell externally. |
| **More workflow triggers** | The builder is good enough. The gap isn't automation — it's that there's nothing to automate because routing doesn't exist. |
| **Drip trigger completion** | `silence_48h` and `engagement_drop` matter but they're polish on a system that works. |
| **Forecast / deal lifecycle** | Pipedrive territory. You're not competing with Pipedrive. You're competing with CRMChat. Stay in your lane. |

---

## Build Order

```
Week 1-2:  Feature 1 — Actionable Inbox
           1a. Reply from inbox (wire existing send APIs to inbox UI)
           1b. Conversation status (open/assigned/snoozed/closed)
           1c. Canned responses with merge vars

Week 2-3:  Feature 2 — Smart Assignment
           2a. Assignment rules engine (conditions + round-robin)
           2b. Inbox auto-assignment on new conversation
           2c. Settings UI for managing rules

Week 3-4:  Feature 3 — Conversation-First Deal Detail
           3a. Conversation as default view (layout restructure)
           3b. Context cards (stage changes, notes, AI insights inline)
           3c. Quick actions from conversation view
```

### The Metric That Matters

**Time from "new TG message" to "rep responds from CRM".**

Today: rep sees message in Telegram (not CRM) → opens CRM → finds deal → opens Chat tab → reads → switches to Telegram to reply. Call it 5+ minutes if they're in the CRM at all.

After these 3 features: message arrives → inbox shows it in "Mine" tab (auto-assigned) → rep reads in context with deal metadata alongside → types response → sends from CRM → deal updates. Under 30 seconds.

That's the product. Everything else is optimization.

---

## One More Thing

Stop building new features after this. Seriously. You have broadcasts, drip sequences, outreach, workflows, AI agent, GDPR, multi-bot, A/B testing, engagement scoring, health scores, sentiment analysis. It's enough. The next 4 weeks should be: **these 3 features + hardening everything that exists.**

A CRM that does 3 things brilliantly beats one that does 20 things adequately. Ask HubSpot — they spent 5 years on email + pipeline + contacts before they added anything else. Your 3 things are: inbox, routing, conversation-first deals. Nail them.
