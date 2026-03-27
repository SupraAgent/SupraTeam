# CPO Review: SupraCRM — Telegram-Native CRM for Web3 BD

**Reviewer persona:** CPO with 12+ years shipping CRMs at scale (HubSpot, Pipedrive, CRMChat). Deep expertise in Telegram-first GTM, automation, and Web3 BD workflows.

---

## Executive Assessment

**Score: 64/100** — Solid mid-tier. 48 pages, 47 migrations, a visual workflow builder, multi-bot support, a TMA, email integration, AI chat, broadcasts, outreach sequences, and GDPR tooling. That's a lot of surface area for a v2.

**The thesis is correct.** "CRM that lives inside Telegram" is a defensible wedge. No competitor fully owns this. CRMChat leads at 80.5 but still treats Telegram as a channel, not the operating system. There is a window.

**The risk is breadth over depth.** Features ship fast but land at 70% polish. The bot scores 59/100 in internal audits. Broadcasts got a 3.5 from user testing. The workflow builder exists but the execution engine is undertested. This is the classic internal-tool trap: works for the builder, breaks for the next user.

---

## Feature-by-Feature Assessment

### What's Strong

| Feature | Score | Notes |
|---------|-------|-------|
| **Kanban Pipeline** | 84/100 | 625-line page, drag-drop via @hello-pangea/dnd, 3 board types (BD/Marketing/Admin), WIP limits, collapsible columns, summary bar. Mature. |
| **TG Group Management** | 80/100 | Slug-based tagging, bot-as-admin detection, member tracking, invite link management. The slug concept is genuinely innovative. |
| **Visual Workflow Builder** | 78/100 | ReactFlow-based, 12 API routes, templates (built-in + user-saved), execution history, webhook triggers. Deep implementation. |
| **Broadcasting** | 77/100 | 1,242-line page, slug-filtered targeting, scheduling, merge variables, delivery tracking. Feature-rich. |
| **Multi-Bot Registry** | 75/100 | Encrypted token storage, per-group bot assignment, up to 10+ bots. No competitor does this well. |
| **Contact Management** | 74/100 | Telegram identity linking, duplicate detection (multi-signal scoring + merge UI), custom fields. Solid. |
| **Outreach Sequences** | 70/100 | Linear step automation, delay-based, separate bot workers (sequence-worker.ts, outreach-worker.ts). Functional but no branching yet. |
| **AI Chat/Agent** | 65/100 | Claude-powered, role prompts, qualification data extraction, escalation keywords, TMA AI chat. Present but shallow. |
| **TMA (Mini App)** | 65/100 | 8 pages (deals, contacts, tasks, AI chat, broadcasts, apply flow). Real mobile CRM in Telegram. But UX needs polish. |

### What's Weak

| Feature | Score | Notes |
|---------|-------|-------|
| **Telegram Bot Core** | 59/100 | Entry point is 38 lines. Handlers exist but the bot feels like plumbing, not a product. No conversation timeline. |
| **AI Lead Qualification** | 49/100 | Schema exists (qualification_data JSONB) but the actual scoring logic is thin. No auto-routing based on qualification. |
| **Campaign Analytics** | 64/100 | Broadcast history tracked but no proper analytics dashboard. No open/click rates for TG (email has tracking). |
| **Deal Health/AI Summaries** | 22/100 | Tables exist (crm_deal_sentiment, crm_deal_highlights) but barely wired up. Biggest gap between schema and UI. |

---

## Top 3 Existing Features — Your Competitive Moat

These are what to double down on. They're the best and most differentiated.

### 1. Slug-Based TG Group Access Control (Importance: 10/10)

**Why it's the best feature:** No competitor has this. CRMChat has group management. Respond.io has routing. Nobody has "tag groups with slugs, then 1-click add/remove users across all matching groups." For a Web3 BD team managing 50+ TG communities, this is a killer workflow.

- Matrix UI for slug-to-user mapping
- Bulk operations with audit logging
- Links directly into the broadcasting system (slug-filtered targeting)

**Focus action:** Make this the hero of marketing. It's the feature that makes someone say "I need SupraCRM specifically."

### 2. Visual Workflow Builder (Importance: 9/10)

**Why it matters:** 1,125-line workflow editor, ReactFlow canvas, 12 API routes, templates, execution history, webhook triggers. This isn't a toy — it's approaching n8n-lite territory but purpose-built for Telegram CRM automation.

- Trigger types: stage_change, deal_created, deal_value_change, tag_added, webhook, scheduled
- Execution engine with node-by-node state tracking
- Template marketplace (built-in + user-saved)

**Focus action:** The builder is good. The execution reliability needs hardening. Add retry logic, better error visibility, and real-time execution monitoring.

### 3. Multi-Bot Broadcasting with Merge Variables (Importance: 8/10)

**Why it matters:** 1,242-line broadcast page. Slug-filtered targeting, scheduling, per-group bot assignment, merge variable personalization, delivery tracking. This is a complete broadcast stack. Combined with multi-bot support (10+ bots per workspace), segmented campaigns can run at scale.

**Focus action:** Add broadcast analytics (delivery rates, response tracking) and A/B testing. The infrastructure is there; the intelligence layer is missing.

---

## Top 3 Features to Implement — Highest ROI Path to #1

### 1. TG Conversation Timeline in Deal Detail (Importance: 10/10)

**What:** Show Telegram message history inline within the deal detail view. When a BD rep opens a deal, they see the full conversation history from the linked TG group/chat — not just CRM metadata.

**Why it's #1 priority:**
- Touches the highest-weighted competitive category (TG Integration Depth, weight=5)
- **No competitor does this.** CRMChat shows message counts. Respond.io shows a separate inbox. Nobody embeds the conversation *inside the deal view*.
- Estimated impact: +5-7 weighted score (could jump past Entergram to rank 3)
- Schema already has `crm_deals.telegram_chat_id` — the linking is ready
- The MTProto client (`telegram` package) is already in dependencies

**Implementation:** Fetch message history via bot API or MTProto, cache in a `crm_tg_messages` table, render as a timeline component in the deal detail drawer. Add search, @-mention highlighting, and "jump to message in Telegram" deep links.

### 2. AI-Powered Lead Qualification & Auto-Routing (Importance: 9/10)

**What:** Use Claude to analyze incoming Telegram conversations and automatically: (a) score leads based on qualification criteria, (b) extract structured data (budget, timeline, decision-maker), (c) auto-create deals at the right pipeline stage, (d) route to the right team member.

**Why it's critical:**
- Current score: 49/100 (biggest gap in AI category, -36 vs best competitor)
- The schema exists (`crm_ai_conversations.qualification_data`) but the logic is a stub
- This turns the AI agent from "helpful chatbot" into "revenue-generating automation"
- Combined with the workflow builder, qualification triggers can cascade into full automation flows

**Implementation:** Enhance the `/api/ai-agent/respond` route to run qualification scoring after each conversation turn. Define qualification fields in `crm_ai_agent_config`. When a lead scores above threshold, auto-create a deal and trigger the workflow engine.

### 3. Full TMA as Primary Mobile CRM (Importance: 8/10)

**What:** Make the Telegram Mini App the *primary* mobile interface — not a companion. Deal management, task completion, AI chat, quick broadcasts, push notifications for stage changes, and offline-capable interactions.

**Why it matters:**
- Combined competitive weight of Mini-App (wt=4) + Mobile (wt=3) = 7 — second highest category cluster
- 8 TMA pages already exist — the skeleton is there
- Users (BD reps) live in Telegram all day. If they can manage deals *without ever opening a browser*, the CRM wins
- Current gap: -27 vs best competitor on Mini-App score

**Implementation:** Polish the existing 8 pages. Add swipe gestures for stage changes, pull-to-refresh, haptic feedback. Add TMA push notifications for stage changes and new messages. Add quick-reply to broadcasts from within the TMA.

---

## Feature Importance Ranking (All Key Features)

| Rank | Feature | Type | Importance | Competitive Impact | Effort |
|------|---------|------|------------|-------------------|--------|
| 1 | **TG Conversation Timeline** | Build | 10/10 | +5-7 score | Medium |
| 2 | **Slug-Based Access Control** | Existing | 10/10 | Unique moat | — |
| 3 | **AI Lead Qualification** | Build | 9/10 | +4-5 score | Medium |
| 4 | **Visual Workflow Builder** | Existing | 9/10 | Near-parity | — |
| 5 | **Full TMA Mobile CRM** | Build | 8/10 | +4-6 score | High |
| 6 | **Multi-Bot Broadcasting** | Existing | 8/10 | Near-parity | — |
| 7 | Kanban Pipeline | Existing | 8/10 | At parity | — |
| 8 | Outreach Sequence Branching | Build | 7/10 | +2-3 score | Medium |
| 9 | Bot Drip Sequences | Build | 7/10 | +3-4 score | Medium |
| 10 | Contact Engagement Scoring | Build | 6/10 | +3-5 score | Low |
| 11 | Unified Inbox | Build | 6/10 | +4-5 score | High |
| 12 | AI Conversation Summaries | Build | 5/10 | +2-3 score | Low |

---

## Bottom Line

Rank 4 at 64. The path to rank 1 (81+) isn't about building more features — it's about making three things exceptional:

1. **Own the conversation** — TG timeline in deal detail makes this the only CRM where reps never context-switch
2. **Automate the intake** — AI qualification turns passive conversations into active pipeline
3. **Live in Telegram** — TMA as primary mobile CRM means users never leave their native environment

The slug access control, workflow builder, and broadcast system are already strong enough to be competitive. Stop widening. Start deepening. Ship the conversation timeline first — it's the single highest-impact feature to build.

---

## 5-Stage Implementation Plan (v2 — Hardened)

> **Post-audit correction:** Deep codebase exploration revealed the conversation timeline, message sync, sentiment analysis, and deal summaries are **already fully implemented**. Stage 1 shifts from "build" to "harden + wire up the intelligence layer." This accelerates the timeline significantly.

### Guiding Principle

Each stage has a **competitive milestone** — a score target that unlocks a new rank. Don't start Stage N+1 until Stage N ships and the existing features from that stage are hardened. Depth beats breadth.

**Current: Rank 4 at ~64 → Target: Rank 1 at 81+**

---

### Stage 1: "Own the Conversation" (Target: 69+ → Pass Entergram)

**Theme:** The conversation timeline exists but the intelligence layer is disconnected. Wire it all together so opening a deal gives instant, actionable context.

**What already works:**
- `tg_group_messages` table with real-time bot capture + manual MTProto sync
- `ConversationTimeline` component (303 lines): pagination, search, reply, deep links
- `deal-detail-panel.tsx` Chat tab: embedded timeline with notes
- Sentiment analysis API: Claude-powered, caches to `crm_deals.ai_sentiment`
- Deal summary API: Claude-powered, caches to `crm_deals.ai_summary`
- Health score calculation: weighted formula with TG activity factor
- Highlights system: `crm_highlights` table with 24h auto-expiry

**What's broken or missing:**

| # | Task | File(s) | What Specifically | Score Impact |
|---|------|---------|-------------------|-------------|
| 1a | **Auto-refresh AI on conversation sync** | `bot/handlers/messages.ts`, new `/api/deals/[id]/conversation/summary` | When bot captures a new batch of messages (e.g., 10+ in a deal-linked group), auto-trigger sentiment + summary refresh. Currently both are manual button-clicks only. Add a new **conversation summarization** route (separate from deal summary) that produces 3-5 bullet points from the TG thread: key topics, action items, blockers. | +3-4 |
| 1b | **Scheduled health + sentiment jobs** | New `app/api/cron/deal-intelligence/route.ts` | Daily cron: recalculate health scores for all open deals, refresh sentiment for deals with stale analysis (>3 days), generate summaries for deals that have none. The `bulk-sentiment` route exists but nothing calls it. | +1-2 |
| 1c | **Fix TypeScript types** | `lib/types.ts` | `Deal` type is missing `ai_summary`, `ai_summary_at`. Causes `any` casts in deal-detail-panel.tsx. Fix the type, remove the casts. | 0 (quality) |
| 1d | **Harden slug access control** | `app/api/access/route.ts`, `app/api/access/bulk/route.ts`, `app/access/page.tsx` | **Security:** Add role-based checks (only `admin_lead` can grant/revoke). **Audit:** Add `logAudit()` calls to individual grant/revoke (currently only bulk operations log). **UX:** Add progress counter for bulk ops ("Adding 3/7..."), per-user success/fail status, retry button for failures. **Reliability:** Validate bot admin status before attempting TG API calls, add exponential backoff for rate limits. | Defend moat |
| 1e | **Surface highlights on dashboard** | `app/page.tsx` | Highlights only show on pipeline cards. Add a "Needs Attention" section to the dashboard showing active TG highlights with deal links — same data, new surface. | +1 |

**Deliverables:**
- New route: `POST /api/deals/[id]/conversation/summary` — Claude summarizes the TG thread into bullets
- Auto-trigger: bot message handler fires summary refresh after 10+ messages in a deal-linked chat
- Cron route: daily deal intelligence sweep (health + sentiment + summary)
- Fixed `Deal` TypeScript type with `ai_summary` fields
- Slug access: role-based RLS, audit logging on all operations, progress UI, bot-admin pre-check
- Dashboard "Needs Attention" widget showing TG highlights

**Exit criteria:** BD rep opens deal → sees last 50 messages → reads auto-generated conversation summary → sees sentiment/health without clicking anything. Slugs are hardened with role checks and audit trail. Score: ~69-71.

**Estimated effort:** 1-2 weeks (accelerated — most infrastructure exists)

---

### Stage 2: "Automate the Intake" (Target: 73+ → Pass Respond.io)

**Theme:** Turn passive Telegram conversations into active pipeline automatically.

**What already exists:**
- AI agent with role prompts, qualification fields config, escalation keywords
- `crm_ai_conversations` table with `qualification_data` JSONB column
- Workflow engine with triggers: `stage_change`, `deal_created`, `webhook`, `scheduled`
- Contact quality score (data completeness based)

**What to build:**

| # | Task | File(s) | What Specifically | Score Impact |
|---|------|---------|-------------------|-------------|
| 2a | **Qualification scoring engine** | `app/api/ai-agent/respond/route.ts` | After each AI conversation turn, run a second Claude call to score qualification (0-100) based on configurable fields from `crm_ai_agent_config.qualification_fields`. Extract structured data: `{ budget, timeline, decision_maker, project_type, urgency }`. Store in `qualification_data`. When score > threshold (configurable, default 70), fire `lead_qualified` event. | +4-5 |
| 2b | **Auto-deal creation pipeline** | New `app/api/ai-agent/qualify/route.ts` | When `lead_qualified` fires: (1) Create or find contact by TG username, (2) Create deal at Stage 1 with extracted qualification data as custom fields, (3) Link to TG chat, (4) Assign to rep via round-robin or keyword match, (5) Fire `deal_created` workflow trigger, (6) Notify assigned rep via TG message. | +2-3 |
| 2c | **Contact engagement scoring** | New `app/api/contacts/engagement/route.ts`, migration | Add `engagement_score` (0-100) to `crm_contacts`. Calculate from: message frequency in linked groups (40%), response time to outreach (20%), group participation breadth (20%), @-mention density (10%), recency (10%). Run hourly via cron. Surface as heat badge (flame icon, color-coded) on contact cards and pipeline deal cards. | +3-5 |
| 2d | **Workflow builder hardening** | `app/automations/[id]/page.tsx`, `app/api/workflows/[id]/run/route.ts` | Add node-level retry (max 3, exponential backoff). Show real-time execution status on canvas nodes (green check, red X, spinning). Add "Test Run" mode that simulates execution without sending TG messages. Add new trigger type: `lead_qualified`. Better error messages: show which node failed, why, and what data was passed. | Defend moat |
| 2e | **Qualification dashboard** | `app/page.tsx` or new widget | Show qualification pipeline: conversations in progress → qualified → deal created → assigned. Real-time counter of leads being qualified by the AI agent. | +1 |

**Deliverables:**
- Qualification scoring runs after every AI conversation turn
- Structured data extraction (budget, timeline, etc.) into JSONB
- Auto-deal creation with TG linking and rep assignment
- `engagement_score` on contacts with hourly cron recalculation
- Heat badges on contact cards and deal cards
- Workflow test mode, node retry, live status, `lead_qualified` trigger
- Qualification funnel widget on dashboard

**Exit criteria:** Prospect messages bot in TG → AI qualifies over 2-3 turns → deal auto-created at Stage 1 → assigned rep notified → workflow fires follow-up. Engagement scores visible on all contact/deal surfaces. Score: ~73-75.

**Estimated effort:** 3-4 weeks

---

### Stage 3: "Live in Telegram" (Target: 76+ → Clear buffer over Respond.io)

**Theme:** The TMA becomes the primary mobile CRM. BD reps manage everything without leaving Telegram.

**What already exists:**
- 8 TMA pages: home, deals, deal detail, contacts, tasks, AI chat, broadcasts, apply
- Outreach sequences with linear steps, delay-based, separate workers
- Broadcasting with slug-filtered targeting, scheduling, merge variables, delivery tracking

**What to build:**

| # | Task | What Specifically | Score Impact |
|---|------|-------------------|-------------|
| 3a | **TMA deal gestures** | Swipe-to-change-stage on deal cards (left = prev, right = next). Pull-to-refresh on all list pages. Haptic feedback via `window.Telegram.WebApp.HapticFeedback`. Tap-and-hold for quick actions (assign, note, call). | +2-3 |
| 3b | **TMA push notifications** | When a deal stage changes or a TG highlight fires, send a notification via the bot to the assigned rep with a deep link back into the TMA. Use `Bot.sendMessage` with `web_app_data` button linking to `/tma/deals/[id]`. | +1-2 |
| 3c | **TMA offline mode** | Cache last 50 deals + contacts in localStorage. Show cached data when offline with "Offline" indicator. Sync on reconnect. Queue actions (stage changes, notes) and replay when back online. | +1 |
| 3d | **Outreach sequence branching** | Add `condition` step type to sequence builder. Reply detection: `outreach-worker.ts` checks `last_reply_at` on enrollment — if replied since last step, follow `true` branch. Time branch: if no reply after X hours, follow `false` branch. Engagement branch: if contact `engagement_score > threshold`, follow priority path. Visual branch editor in outreach UI. | +2-3 |
| 3e | **Broadcast analytics** | New analytics tab on broadcasts page: delivery rate per bot/slug/group, response tracking (did recipient send a message in the group within 24h of broadcast?), A/B testing (split recipients 50/50 between two message variants, track response rates). Store variant assignment in `crm_broadcast_recipients`. | +2 |

**Deliverables:**
- TMA gesture system: swipe stages, pull-to-refresh, haptic, long-press menus
- TMA notification pipeline: bot → rep with TMA deep links
- Offline cache layer with action queue and sync
- Outreach branching: reply/time/engagement conditions with visual editor
- Broadcast analytics: delivery funnel, response tracking, A/B variant comparison

**Exit criteria:** BD rep manages full pipeline from phone inside Telegram — swipes deals between stages, gets push notifications, works offline. Outreach auto-pauses on reply. Broadcasts show which messages drive engagement. Score: ~76-78.

**Estimated effort:** 3-4 weeks

---

### Stage 4: "Scale the Machine" (Target: 79+ → Striking distance of CRMChat)

**Theme:** Automation that runs itself. The CRM works while the team sleeps.

**What already exists:**
- Bot message handler with workflow trigger on every message
- Outreach sequences (manual enrollment) and outreach-worker (60s polling)
- Conversations page (MTProto-based, separate from deal conversations)
- Pipeline with saved views table (`crm_saved_views`) but minimal UI

**What to build:**

| # | Task | What Specifically | Score Impact |
|---|------|-------------------|-------------|
| 4a | **Bot drip sequences** | New entity separate from outreach sequences. Triggered by TG events (not manual enrollment). Events: `group_join`, `first_message`, `keyword_match`, `silence_48h`, `engagement_drop`. Builder UI similar to outreach but with event trigger selector. New `crm_drip_sequences` + `crm_drip_enrollments` tables. Worker runs alongside outreach-worker on 60s poll. Key difference: fully automated, bot-initiated, no rep action needed. | +3-4 |
| 4b | **Unified inbox** | Rebuild `/conversations` page as unified inbox across all bots + groups. Show all `tg_group_messages` in a single timeline, grouped by chat. Filter by: bot, group, slug, contact, has-deal, unread. Thread detection: cluster messages by sender + time window. Quick actions from inbox: create deal, assign contact, add note, reply. Real-time updates via Supabase realtime subscription on `tg_group_messages`. | +4-5 |
| 4c | **Pipeline analytics + saved views** | Promote `crm_saved_views` to first-class UI: save button on pipeline, sidebar list of saved views, shareable URLs (`/pipeline?view=abc`). Add analytics tab to pipeline: conversion funnel (stage-to-stage rates), velocity metrics (avg days per stage), win rate by board, forecast chart based on weighted pipeline value × historical conversion. | +2-3 |

**Deliverables:**
- Drip sequence builder with event triggers and bot-initiated messaging
- Drip worker running on 60s poll alongside outreach-worker
- Unified inbox with cross-bot timeline, thread detection, quick actions
- Saved views with sidebar pinning and shareable URLs
- Pipeline analytics: conversion funnel, velocity, forecast

**Exit criteria:** Prospect joins TG group → bot drip qualifies over 72h → auto-creates deal → lands in unified inbox → rep takes over with full context. Pipeline shows conversion forecasting and saved views. Score: ~79-80.

**Estimated effort:** 4-5 weeks

---

### Stage 5: "Take the Crown" (Target: 81+ → #1)

**Theme:** Intelligence layer that no competitor can replicate. The CRM predicts, not just records.

**What to build:**

| # | Task | What Specifically | Score Impact |
|---|------|-------------------|-------------|
| 5a | **AI Deal Prediction** | New route: `POST /api/deals/[id]/predict`. Inputs: conversation timeline (message count, sentiment trend, last activity), engagement score trend (improving/declining), stage velocity (faster/slower than avg), historical data from `crm_deal_stage_history`. Output: dynamic win probability (not the manual field), estimated close date, risk factors, recommended next action. Surface as "Deal Intelligence" card in deal detail replacing static health score. Run prediction on every stage change + daily cron. | +2-3 |
| 5b | **Auto-assignment rules** | New table `crm_assignment_rules` with configurable rules: round-robin by board, assign by slug expertise, assign by capacity (least active deals), assign by engagement match. When AI qualification creates a deal or a deal enters Stage 1, evaluate rules and auto-assign. Settings UI in Settings > Team. Support override (manual assignment always wins). | +3-4 |
| 5c | **Campaign intelligence** | Add `source_campaign_id` to `crm_deals`. When a deal is created from a broadcast interaction, tag it. Track: broadcasts → conversations → qualified leads → deals → won deals → value. New page or dashboard widget: "Campaign ROI" showing which broadcasts drove the most pipeline value. Attribution model: first-touch (first broadcast the contact received) and last-touch (most recent before deal creation). | +2-3 |

**Deliverables:**
- AI deal prediction with dynamic probability, close date estimate, risk factors
- "Deal Intelligence" card replacing static health score in deal detail
- Auto-assignment engine with configurable rules and capacity balancing
- Assignment rules UI in Settings > Team
- Campaign attribution tagging on deals
- Campaign ROI dashboard with first-touch/last-touch attribution

**Exit criteria:** The CRM tells reps what to do next, assigns work automatically, and proves which campaigns drive revenue. Score: 81+. Rank: #1.

**Estimated effort:** 4-5 weeks

---

## Stage Summary

| Stage | Theme | Score Target | Rank | Key Unlock | Effort |
|-------|-------|-------------|------|-----------|--------|
| **1** | Own the Conversation | 69+ | #3 | Wire up intelligence layer + harden slugs | 1-2 wks |
| **2** | Automate the Intake | 73+ | #2 | AI qualification + engagement scoring | 3-4 wks |
| **3** | Live in Telegram | 76+ | #2 (buffer) | TMA as primary mobile + sequence branching | 3-4 wks |
| **4** | Scale the Machine | 79+ | #2 (close) | Bot drips + unified inbox + saved views | 4-5 wks |
| **5** | Take the Crown | 81+ | **#1** | AI prediction + auto-assignment + attribution | 4-5 wks |

**Total timeline: ~15-20 weeks (4-5 months)**

### Rules of Engagement

1. **Don't start the next stage until the current one is hardened.** Half-shipped features are worse than missing features.
2. **Every stage hardens one existing feature.** New builds are worthless if the moat erodes.
3. **Score after each stage.** Re-run the competitive audit. If the numbers don't move, the stage failed — fix before proceeding.
4. **Ship to real users within each stage.** Internal dogfooding after week 1. The BD team should be using Stage 1 features before Stage 2 starts.
5. **Cut scope, not stages.** If a stage is taking too long, ship the 80% version and move on. Polish comes from usage feedback, not upfront design.
