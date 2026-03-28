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

### Stage 2: "Automate the Intake" (Target: 73+ → Pass Respond.io) — IMPLEMENTED

**Theme:** Turn passive Telegram conversations into active pipeline automatically.

**What was built:**

| # | Task | File(s) | What Was Shipped | Status |
|---|------|---------|-----------------|--------|
| 2a | **Bot → AI Agent wiring** | `bot/handlers/messages.ts` | DM handler (respond_to_dms), mention detection (@bot in groups), group response mode (respond_to_groups). Full Claude conversation loop with 5-message history, qualification extraction, escalation detection. Cached agent config (60s TTL) to avoid DB hits on every message. | Done |
| 2b | **Auto-deal creation** | `bot/handlers/messages.ts` | When AI extracts `<qualification>` data AND `auto_create_deals` is enabled: auto-creates/updates contact by telegram_user_id, creates deal at Stage 1 with name from qualification data, links to TG chat, fires `lead_qualified` workflow trigger. Deduplicates: won't create duplicate contacts or deals for same user. | Done |
| 2c | **Contact engagement scoring** | `app/api/contacts/engagement/route.ts`, migration 048 | `engagement_score` (0-100) on contacts. Weighted formula: TG group activity via `tg_group_members` (35%), outreach reply rates (25%), recency (20%), deal linkage (20%). Hourly cron via `/api/cron?job=engagement-scoring`. Engagement badges (Hot/Warm/Cool) in contacts table. | Done |
| 2d | **Workflow dry-run/test mode** | `packages/automation-builder/src/core/engine.ts`, `lib/workflow-engine.ts`, `app/api/workflows/[id]/run/route.ts` | New `dryRun` flag on EngineConfig. Actions return simulated success (`{ dryRun: true }`) without executing. Delays skip pause and continue traversal. API accepts `test_mode: true` in body, returns full `node_outputs`. | Done |
| 2e | **`lead_qualified` workflow trigger** | `lib/workflow-registry.ts`, `bot/handlers/messages.ts` | New trigger type in palette with board_type filter. Fires when AI auto-creates a deal. Passes vars: `deal_name`, `contact_name`, `stage`, `qualification`. Enables workflows like: lead qualified → send welcome TG → assign rep → create follow-up task. | Done |
| 2f | **AI agent settings: auto-create deals** | `app/settings/ai-agent/page.tsx` | New toggle under "Auto Lead Qualification": "Auto-Create Deals from Qualified Leads". When enabled + auto_qualify on, extracted qualification data triggers the full pipeline. | Done |
| 2g | **Contact last_activity_at updates** | `bot/handlers/messages.ts` | Bot now updates `crm_contacts.last_activity_at` on every group message from a linked TG user. Feeds into engagement recency scoring. | Done |

**Architecture decisions:**
- AI response runs directly in the bot process (not via API route) to avoid auth overhead. Uses the same Claude call pattern as `/api/ai-agent/respond`.
- Config is cached for 60s to avoid hitting Supabase on every message.
- Auto-deal creation is fire-and-forget (non-blocking) so it doesn't delay message processing.
- Engagement scoring aggregates from `tg_group_members` (linked via `crm_contact_id`) rather than raw `tg_group_messages` for efficiency.

**What's left to harden (future passes):**
- [ ] Qualification scoring threshold (currently any qualification data triggers deal creation — add configurable score threshold)
- [ ] Round-robin rep assignment on auto-created deals (currently unassigned)
- [ ] Qualification dashboard widget showing funnel: conversations → qualified → deal created
- [ ] Rate limiting on AI responses (prevent bot from overwhelming Claude API in busy groups)
- [ ] Workflow canvas: show dry-run results visually on nodes (green simulated, yellow skipped)

**Exit criteria achieved:** Prospect messages bot in TG → AI qualifies over conversation → deal auto-created at Stage 1 → `lead_qualified` workflow fires → engagement scores visible on contact cards. Score: ~73-75.

**Estimated effort:** Done (shipped in this session)

---

### Stage 3: "Live in Telegram" (Target: 76+ → Clear buffer over Respond.io) — DETAILED

**Theme:** The TMA becomes the primary mobile CRM, the bot becomes data-isolation-aware, and outreach gets smart branching. BD reps manage everything without leaving Telegram — but the bot never leaks data between orgs/groups.

---

#### CPO Guidance: Data Isolation is the Foundation

> **Critical context:** `supraadmin_bot` operates in many groups across different organizations. A single bot serves Supra's BD groups, marketing groups, partner groups, and potentially external org groups. Every bot response, notification, digest, and AI answer must be scoped to the group it's responding in. No deal names, contact info, pipeline values, or org-internal data should ever leak to a group that isn't explicitly linked to that deal.
>
> **This is not a nice-to-have.** It's the trust foundation. If a partner sees another partner's deal value in a daily digest, you lose both partners. Every feature in Stage 3 must pass the "wrong group" test: *"If this message appeared in a group it wasn't meant for, what would happen?"*

**What already exists:**
- 8 TMA pages: home, deals, deal detail, contacts, tasks, AI chat, broadcasts, apply
- Outreach sequences with linear steps, delay-based, separate workers
- Broadcasting with slug-filtered targeting, scheduling, merge variables, delivery tracking
- Bot handlers with per-chat deal scoping (`telegram_chat_id` filtering)
- AI conversations scoped by `tg_chat_id` + `tg_user_id`
- Multi-bot registry with encrypted tokens and per-group bot assignment

**What's already safe:**
- Deal queries in bot handlers filter by `telegram_chat_id` ✅
- AI conversation history scoped by chat + user ✅
- Stage change notifications sent only to deal's linked chat ✅
- Outreach messages sent to enrollment's `tg_chat_id` ✅
- Contact upsert uses `telegram_user_id` with unique constraint ✅

**What needs hardening (found in security audit):**
- Daily digest sends org-wide deal data (including top deal names + values) to ALL groups
- AI agent includes deal context in system prompt — if deal is linked to wrong group, context leaks
- Bot RLS policies allow any authenticated user to view/update any bot record
- AI conversations viewable org-wide in admin UI (includes DM content)
- No group-level permission scoping for broadcasts (any user can broadcast to any group)

---

#### What to Build

| # | Task | What Specifically | Score Impact |
|---|------|-------------------|-------------|
| 3a | **Data isolation layer** | The prerequisite for everything else. See detailed breakdown below. | Foundation |
| 3b | **TMA deal gestures** | Swipe-to-change-stage on deal cards (left = prev, right = next). Pull-to-refresh on all list pages. Haptic feedback via `window.Telegram.WebApp.HapticFeedback`. Tap-and-hold for quick actions (assign, note, call). | +2-3 |
| 3c | **TMA push notifications** | When a deal stage changes or a TG highlight fires, send a notification via the bot to the assigned rep with a deep link back into the TMA. Use `Bot.sendMessage` with `web_app_data` button linking to `/tma/deals/[id]`. Only notify reps assigned to the deal — never broadcast to unrelated chats. | +1-2 |
| 3d | **TMA offline mode** | Cache last 50 deals + contacts in localStorage (only deals the current user is assigned to or has viewed). Show cached data when offline with "Offline" indicator. Sync on reconnect. Queue actions (stage changes, notes) and replay when back online. | +1 |
| 3e | **Outreach sequence branching** | Add `condition` step type to sequence builder. Reply detection: `outreach-worker.ts` checks `last_reply_at` on enrollment — if replied since last step, follow `true` branch. Time branch: if no reply after X hours, follow `false` branch. Engagement branch: if contact `engagement_score > threshold`, follow priority path. Visual branch editor in outreach UI. | +2-3 |
| 3f | **Broadcast analytics** | New analytics tab on broadcasts page: delivery rate per bot/slug/group, response tracking (did recipient send a message in the group within 24h of broadcast?), A/B testing (split recipients 50/50 between two message variants, track response rates). Store variant assignment in `crm_broadcast_recipients`. | +2 |

---

#### 3a: Data Isolation Layer — Detailed Breakdown

This is the most critical piece. Every bot interaction must answer: *"What data is this group allowed to see?"*

**Principle:** A Telegram group should only ever see data about deals linked to that group. The bot should never mention a deal name, contact, value, or pipeline detail from a different group.

| Sub-task | What to do | Where |
|----------|-----------|-------|
| **3a-i: Group-scoped daily digest** | Rewrite `cron/daily-digest.ts` to filter deals by group. Each group's digest shows only deals where `telegram_chat_id` or `tg_group_id` matches that group. If a group has no linked deals, send a generic "No active deals in this group" message instead of org-wide stats. Remove top deal names/values from cross-group digests entirely. | `cron/daily-digest.ts` |
| **3a-ii: AI agent context boundary** | The AI agent's system prompt must never include deal context from a different group. Add a guard in `handleAIResponse()`: only inject `dealContext` if the deal's `telegram_chat_id === chatId`. If bot is responding in a DM, only include deals where the contact matches the DM user's `telegram_user_id`. Log and alert if a context mismatch is detected. | `bot/handlers/messages.ts` |
| **3a-iii: AI conversation visibility** | Add group-scoped view to `/api/ai-agent/conversations`. Default: show only conversations from groups the current user has access to (via `crm_user_slug_access`). Admin override: admins can view all. Add `is_private_dm` flag to `crm_ai_conversations` — DM conversations are only visible to the user who had the conversation + admins. | `app/api/ai-agent/conversations/route.ts`, migration |
| **3a-iv: Bot RLS tightening** | Fix `crm_bots` SELECT/UPDATE policies to restrict to `created_by` or users with `admin_lead` role. Non-admin users should see bot metadata (username, label) but not token references or webhook URLs. | Migration |
| **3a-v: Broadcast group validation** | Before sending a broadcast, verify the sending user has slug access to the target groups. Non-admin users can only broadcast to groups they have explicit slug access for. Admin users can broadcast to any group. Add audit log entry for every broadcast with sender + target groups. | `app/api/broadcasts/send/route.ts` |
| **3a-vi: Bot response data scrubbing** | Create a `sanitizeBotMessage()` utility that strips or redacts any data that shouldn't appear in a group context. Apply to: stage change notifications (don't include deal value in group messages), daily digests (group-scoped as above), AI agent responses (never mention other deals). Add configurable "privacy level" per group: `full` (internal team groups — show everything), `limited` (partner groups — show stage names but not values), `minimal` (external groups — only generic messages). | `lib/bot-privacy.ts` (new), `tg_groups` column |
| **3a-vii: DEV_ACCESS_PASSWORD guard** | Add production guard: if `NODE_ENV === 'production'` and `DEV_ACCESS_PASSWORD` is set, log a warning and ignore it. Never allow dev bypass in production. | `lib/auth-guard.ts` |

**Migration (049_data_isolation.sql):**
```sql
-- Privacy level per group
ALTER TABLE tg_groups ADD COLUMN privacy_level TEXT DEFAULT 'full'
  CHECK (privacy_level IN ('full', 'limited', 'minimal'));

-- DM flag on AI conversations
ALTER TABLE crm_ai_conversations ADD COLUMN is_private_dm BOOLEAN DEFAULT false;

-- Fix bot RLS: restrict SELECT to creator + admin_lead
DROP POLICY IF EXISTS crm_bots_select ON crm_bots;
CREATE POLICY crm_bots_select ON crm_bots FOR SELECT TO authenticated
  USING (
    auth.uid() = created_by
    OR EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND crm_role = 'admin_lead'
    )
  );

DROP POLICY IF EXISTS crm_bots_update ON crm_bots;
CREATE POLICY crm_bots_update ON crm_bots FOR UPDATE TO authenticated
  USING (
    auth.uid() = created_by
    OR EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND crm_role = 'admin_lead'
    )
  );
```

---

#### 3b: TMA Deal Gestures — Detailed

**Gesture system for mobile-first deal management:**

| Gesture | Action | Implementation |
|---------|--------|---------------|
| **Swipe right** on deal card | Move to next pipeline stage | Touch event handler with 80px threshold. Animate card sliding right with stage name preview. Confirm with haptic `impact("light")`. POST to `/api/deals/[id]` with `stage_id` of next stage. Undo toast for 5s. |
| **Swipe left** on deal card | Move to previous stage | Same mechanics, opposite direction. Prevent swiping left from Stage 1. |
| **Pull-to-refresh** on all list pages | Reload data | CSS `overscroll-behavior: contain` + touch tracking. Show spinner at top. Trigger `router.refresh()` or SWR mutate. Haptic `impact("medium")` on release. |
| **Tap-and-hold** on deal card | Quick action menu | 500ms press threshold. Haptic `impact("heavy")` on trigger. Popup menu: Assign, Add Note, Change Board, Mark Won/Lost. Use `Telegram.WebApp.HapticFeedback` for all. |
| **Double-tap** on contact | Quick call/message | Open `tg://resolve?domain=${username}` for TG message, or `tel:${phone}` for call. |

**Files to modify:**
- `app/tma/deals/page.tsx` — add `SwipeableDealCard` component
- `app/tma/components/pull-to-refresh.tsx` — new shared component
- `app/tma/components/haptic.ts` — new utility wrapping `Telegram.WebApp.HapticFeedback`
- `app/tma/layout.tsx` — add `overscroll-behavior: contain` to prevent browser pull-to-refresh

**Privacy consideration:** Gesture actions (stage changes) fire the same API as desktop. Stage change notifications go only to the deal's linked chat. No new data exposure.

---

#### 3c: TMA Push Notifications — Detailed

**Notification flow:** Event occurs → bot sends DM to assigned rep → message includes TMA deep link button.

| Trigger | Who gets notified | Message content | Deep link |
|---------|------------------|-----------------|-----------|
| Deal stage change | Assigned rep | "📊 {deal_name} moved to {stage}" | `/tma/deals/{id}` |
| New TG message in deal group | Assigned rep (if not sender) | "💬 {sender} in {group}: {preview}" | `/tma/deals/{id}` |
| Escalation from AI agent | Admin + assigned rep | "⚠️ Escalation in {group}: {reason}" | `/tma/deals/{id}` |
| Outreach reply detected | Sequence creator | "↩️ Reply from {contact} on {sequence}" | `/tma/contacts/{id}` |

**Implementation:**
1. New `bot/handlers/push-notifications.ts` — `sendTMAPush(userId, title, body, tmaPath)`
2. Looks up rep's `telegram_user_id` from `profiles` (need to add this column or use `crm_contacts` self-link)
3. Sends via `bot.api.sendMessage(userId, text, { reply_markup: { inline_keyboard: [[{ text: "Open in CRM", web_app: { url: tmaUrl } }]] } })`
4. Respect `notification_preferences` (new column on profiles): `all`, `mentions_only`, `off`

**Privacy consideration:** Push notifications are DMs to the assigned rep only. Message preview is truncated to 100 chars. Deal name is included because the rep is already assigned to the deal. Never send push notifications to group chats.

**Migration addition:**
```sql
ALTER TABLE profiles ADD COLUMN telegram_user_id BIGINT;
ALTER TABLE profiles ADD COLUMN notification_preferences TEXT DEFAULT 'all'
  CHECK (notification_preferences IN ('all', 'mentions_only', 'off'));
```

---

#### 3d: TMA Offline Mode — Detailed

**Cache strategy:**
- On each successful API fetch, store response in `localStorage` with timestamp
- Keys: `crm_cache_deals`, `crm_cache_contacts`, `crm_cache_stages`
- Max cache: 50 deals (user's assigned deals first), 100 contacts, all stages
- Cache TTL: 30 minutes (show stale data with "Updated X min ago" indicator)
- Offline detection: `navigator.onLine` + `window.addEventListener('online'|'offline')`

**Action queue:**
- Offline actions stored in `localStorage` key `crm_offline_queue`
- Each entry: `{ action: 'stage_change', dealId, newStageId, timestamp }`
- On reconnect: replay queue in order, skip if deal state has changed server-side
- Conflict resolution: server wins. Show "X changes synced, Y conflicts" toast.

**UI indicators:**
- Offline banner at top: "📡 Offline — showing cached data"
- Queued action badges: orange dot on deal cards with pending changes
- Sync spinner when reconnecting

**Files:**
- `app/tma/lib/cache.ts` — new cache manager
- `app/tma/lib/offline-queue.ts` — new action queue
- `app/tma/components/offline-banner.tsx` — new UI component
- Modify all TMA pages to use cache-first fetch pattern

**Privacy consideration:** Local cache only stores deals the user has access to. Cache is cleared on logout. No cross-user data in localStorage.

---

#### 3e: Outreach Sequence Branching — Detailed

**New step type: `condition`**

Current sequence model: linear steps (message → delay → message → delay).
New model: steps can branch based on conditions.

**Condition types:**

| Condition | Check | True branch | False branch |
|-----------|-------|-------------|--------------|
| **Reply received** | `enrollment.last_reply_at > step.executed_at` | "Replied" path (e.g., send follow-up, notify rep) | "No reply" path (e.g., wait longer, send reminder) |
| **Time elapsed** | `now - step.executed_at > X hours` | "Timed out" path | Continue waiting (re-check on next worker poll) |
| **Engagement score** | `contact.engagement_score > threshold` | "High engagement" path (aggressive follow-up) | "Low engagement" path (gentle nudge or pause) |
| **Deal stage** | `deal.stage_id === targetStageId` | "In target stage" path | "Not yet" path |

**Data model changes:**
```sql
-- Add branching fields to outreach steps
ALTER TABLE crm_outreach_steps ADD COLUMN condition_type TEXT
  CHECK (condition_type IN ('reply', 'time_elapsed', 'engagement_score', 'deal_stage'));
ALTER TABLE crm_outreach_steps ADD COLUMN condition_config JSONB DEFAULT '{}';
ALTER TABLE crm_outreach_steps ADD COLUMN true_next_step_id UUID REFERENCES crm_outreach_steps(id);
ALTER TABLE crm_outreach_steps ADD COLUMN false_next_step_id UUID REFERENCES crm_outreach_steps(id);
```

**Worker changes (`bot/outreach-worker.ts`):**
- When current step is `condition` type, evaluate the condition
- If true: advance to `true_next_step_id`
- If false: advance to `false_next_step_id`
- If neither branch exists: end sequence
- Log branch decision in enrollment history

**UI changes:**
- Sequence builder gets a "Add Condition" button between steps
- Condition step renders as a diamond (decision node) with two exits
- Each exit connects to the next step in that branch
- Visual editor shows branching tree, not just linear list

**Privacy consideration:** Branching decisions are based on data already scoped to the enrollment (reply count, contact score, deal stage). No cross-group data access needed.

---

#### 3f: Broadcast Analytics — Detailed

**New analytics tab on `/broadcasts` and `/tma/broadcasts`:**

| Metric | How to calculate | Display |
|--------|-----------------|---------|
| **Delivery rate** | `sent / total_recipients` per broadcast | Bar chart by group |
| **Failure breakdown** | Group by error type from `crm_broadcast_recipients.error` | Pie chart |
| **Response tracking** | Check `tg_group_messages` for messages from recipient within 24h of broadcast `sent_at` | "X% responded" metric |
| **A/B testing** | New `variant` column on `crm_broadcast_recipients` ('A' or 'B'). Split recipients 50/50. Compare response rates. | Side-by-side comparison card |
| **Best send time** | Aggregate response rates by hour-of-day from historical broadcasts | Heatmap |

**Data model:**
```sql
ALTER TABLE crm_broadcast_recipients ADD COLUMN variant TEXT CHECK (variant IN ('A', 'B'));
ALTER TABLE crm_broadcast_recipients ADD COLUMN responded_at TIMESTAMPTZ;
ALTER TABLE crm_broadcasts ADD COLUMN variant_b_message TEXT;
ALTER TABLE crm_broadcasts ADD COLUMN variant_b_parse_mode TEXT;
```

**Response tracking worker (new cron job):**
- Runs hourly
- For each broadcast sent in last 48h with `responded_at IS NULL`
- Check `tg_group_messages` for messages from recipient in same group after `sent_at`
- Update `responded_at` on match
- Calculate and cache aggregate metrics on the broadcast record

**Privacy consideration:** Response tracking only checks if a message was sent in the same group as the broadcast — no cross-group snooping. A/B variant assignment is random, not based on personal data.

---

#### CPO Review: Stage 3 Risk Assessment

> **What I like:** The data isolation layer (3a) being first is the right call. You can't build trust features on a leaky foundation. The TMA gestures (3b) are the highest-UX-impact item — swipe-to-change-stage is the kind of thing that makes people say "this is better than HubSpot on mobile."
>
> **What concerns me:**
> 1. **3a is underestimated.** The daily digest rewrite alone touches cron logic, message formatting, and group-level configuration. Budget extra time.
> 2. **3d (branching) is the riskiest.** It changes the outreach data model from linear to DAG. Test exhaustively — especially the worker's branch evaluation with concurrent enrollments.
> 3. **Offline mode (3d) is nice-to-have at this score level.** If you're behind on 3a or 3e, cut offline mode first. Reps have connectivity 99% of the time in Taipei.
>
> **Priority order within Stage 3:**
> 1. **3a (data isolation)** — non-negotiable, do first
> 2. **3b (gestures)** — highest UX impact, relatively contained
> 3. **3c (push notifications)** — quick win once profiles have `telegram_user_id`
> 4. **3e (branching)** — high score impact but complex
> 5. **3f (broadcast analytics)** — valuable but can ship incrementally
> 6. **3d (offline)** — cut if behind schedule
>
> **The "wrong group" test:** Before merging ANY Stage 3 PR, manually test: create a deal in Group A, then check that Group B's daily digest, AI agent responses, and push notifications don't mention it. This should be a gate on every PR.

**Exit criteria:** BD rep manages full pipeline from phone inside Telegram — swipes deals between stages, gets push notifications for their deals only, works offline. Outreach auto-branches on reply/silence. Broadcasts show which messages drive engagement. **No data leaks between groups.** Score: ~76-78.

**Estimated effort:** 4-5 weeks (extra week for data isolation layer)

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
