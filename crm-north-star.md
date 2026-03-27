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

## 5-Stage Implementation Plan

### Guiding Principle

Each stage has a **competitive milestone** — a score target that unlocks a new rank. Don't start Stage N+1 until Stage N ships and the existing features from that stage are hardened. Depth beats breadth.

**Current: Rank 4 at ~64 → Target: Rank 1 at 81+**

---

### Stage 1: "Own the Conversation" (Target: 69+ → Pass Entergram)

**Theme:** Make SupraCRM the only CRM where reps see Telegram messages inside deal context.

| # | Feature | Type | What to Build | Score Impact |
|---|---------|------|---------------|-------------|
| 1 | **TG Conversation Timeline** | Build | Fetch TG message history via bot API, cache in `crm_tg_messages`, render as scrollable timeline in deal detail panel. Search, @-mention highlighting, "open in Telegram" deep links, reply-from-CRM. | +5-7 |
| 2 | **AI Conversation Summaries** | Build | After syncing messages, run Claude summarization per conversation. Auto-generate 3-line summary on deal open. Surface key topics, action items, risk signals. Wire up the existing `crm_deal_sentiment` and `crm_deal_highlights` tables (currently at 22/100). | +2-3 |
| 3 | **Slug-Based Access Control** (harden) | Existing | Stress-test bulk operations at 50+ groups. Add progress indicators, error recovery for partial failures, and "undo last bulk action" capability. This is the moat — make it bulletproof. | Defend moat |

**Deliverables:**
- `crm_tg_messages` table with message sync pipeline (bot API polling + webhook push)
- `ConversationTimeline` component in deal detail panel (Chat tab)
- Auto-summary generation on conversation sync
- Sentiment/highlights wired to actual conversation data (not stubs)
- Slug bulk operations hardened with progress UI and rollback

**Exit criteria:** BD rep opens a deal → sees last 50 TG messages inline → gets an AI summary → never opens Telegram separately. Score: ~69-71.

**Estimated effort:** 2-3 weeks

---

### Stage 2: "Automate the Intake" (Target: 73+ → Pass Respond.io)

**Theme:** Turn passive Telegram conversations into active pipeline automatically.

| # | Feature | Type | What to Build | Score Impact |
|---|---------|------|---------------|-------------|
| 4 | **AI Lead Qualification** | Build | Enhance `/api/ai-agent/respond` to score every conversation turn. Extract structured data (budget, timeline, decision-maker, project type) into `qualification_data`. When score > threshold, auto-create deal at correct stage and notify assigned rep. | +4-5 |
| 5 | **Contact Engagement Scoring** | Build | Passive scoring from TG activity: message frequency, response time, group participation, @-mention density. Store on contact record. Surface as "engagement heat" on contact cards and deal list. Feed into workflow triggers. | +3-5 |
| 6 | **Visual Workflow Builder** (harden) | Existing | Add retry logic on failed nodes, real-time execution status in the canvas, better error messages, and a "test run" mode that simulates without sending. The builder is 78/100 — push it to 90. | Defend moat |

**Deliverables:**
- Qualification scoring engine in AI agent (configurable fields per `crm_ai_agent_config`)
- Auto-deal creation pipeline: qualified lead → deal at Stage 1 → workflow trigger → rep notification
- `engagement_score` column on `crm_contacts` with calculation job (hourly)
- Engagement heat badges on contact cards and pipeline cards
- Workflow execution monitoring: live node status, retry on failure, test mode
- New workflow trigger: `lead_qualified` (fires when AI qualification threshold met)

**Exit criteria:** Prospect messages bot in TG group → AI qualifies them → deal auto-created at correct stage → assigned rep gets notified → workflow fires follow-up sequence. Score: ~73-75.

**Estimated effort:** 3-4 weeks

---

### Stage 3: "Live in Telegram" (Target: 76+ → Clear buffer over Respond.io)

**Theme:** The TMA becomes the primary mobile CRM. BD reps manage everything without leaving Telegram.

| # | Feature | Type | What to Build | Score Impact |
|---|---------|------|---------------|-------------|
| 7 | **Full TMA Mobile CRM** | Build | Upgrade all 8 existing TMA pages: swipe-to-change-stage on deals, pull-to-refresh everywhere, haptic feedback, push notifications for stage changes and new messages, quick-reply to broadcasts, offline deal viewing with sync-on-reconnect. | +4-6 |
| 8 | **Outreach Sequence Branching** | Build | Add reply detection (auto-pause on response), conditional branches (if replied → path A, if no reply after 48h → path B), and merge with engagement scoring (if engagement > X → skip to path C). | +2-3 |
| 9 | **Multi-Bot Broadcasting** (harden) | Existing | Add broadcast analytics dashboard: delivery rates per bot, per slug, per group. Response tracking (did recipient reply within 24h?). A/B message testing (send variant A to 50%, variant B to 50%, track which gets more replies). | Defend moat |

**Deliverables:**
- TMA deal cards with swipe gestures (left = prev stage, right = next stage)
- TMA push notifications via Telegram Bot API `answerWebAppQuery` / notification system
- TMA offline mode: cache last 50 deals in localStorage, sync on reconnect
- Outreach branching UI in sequence editor (visual branch nodes)
- Reply detection in `outreach-worker.ts` (check for inbound messages between steps)
- Broadcast analytics page: delivery funnel, reply rates, A/B variant comparison
- Broadcast response tracking: link inbound messages to broadcast campaigns

**Exit criteria:** BD rep manages full pipeline from phone inside Telegram. Outreach sequences auto-pause when prospect replies. Broadcast campaigns show delivery + response analytics. Score: ~76-78.

**Estimated effort:** 3-4 weeks

---

### Stage 4: "Scale the Machine" (Target: 79+ → Striking distance of CRMChat)

**Theme:** Automation that runs itself. The CRM works while the team sleeps.

| # | Feature | Type | What to Build | Score Impact |
|---|---------|------|---------------|-------------|
| 10 | **Bot Drip Sequences** | Build | Time-based auto follow-ups triggered by TG events: group join → welcome + qualify after 24h → check-in after 72h → escalate if no response. Different from outreach sequences (which are rep-initiated) — these are fully automated bot-driven flows. | +3-4 |
| 11 | **Unified Inbox** | Build | Single timeline view across all bots, all groups, all DMs. Filter by bot, group, contact, slug. Thread detection (group conversations into deal-linked threads). Quick actions: create deal, assign contact, add note — all from the inbox. | +4-5 |
| 12 | **Kanban Pipeline** (harden) | Existing | Saved views with shareable URLs. Custom board creation (beyond BD/Marketing/Admin). Pipeline conversion analytics: time-in-stage averages, stage-to-stage conversion rates, forecasting based on historical velocity. | Defend position |

**Deliverables:**
- Drip sequence builder (separate from outreach sequences — triggered by events, not manual enrollment)
- Drip trigger types: `group_join`, `first_message`, `keyword_match`, `silence_48h`, `engagement_drop`
- `/conversations` page: unified inbox with real-time message streaming
- Inbox → Deal linking: select messages → "Create deal from conversation"
- Inbox thread detection: group related messages by contact + time window
- Saved views on pipeline: save filter combos, share via URL, pin to sidebar
- Pipeline analytics tab: conversion funnel, velocity metrics, forecast chart

**Exit criteria:** Prospect joins TG group → bot drip qualifies over 72h → auto-creates deal → lands in unified inbox → rep takes over with full context. Pipeline shows conversion forecasting. Score: ~79-80.

**Estimated effort:** 4-5 weeks

---

### Stage 5: "Take the Crown" (Target: 81+ → #1)

**Theme:** Intelligence layer that no competitor can replicate. The CRM predicts, not just records.

This stage pulls from features beyond the original 12 — the final push requires combining what's built with new intelligence.

| # | Feature | What to Build | Score Impact |
|---|---------|---------------|-------------|
| Bonus | **AI Deal Prediction** | Use conversation timeline + engagement scoring + stage velocity to predict: deal close probability (dynamic, not manual), estimated close date, risk of stalling. Surface as "Deal Intelligence" card in deal detail. | +2-3 |
| Bonus | **Auto-Assignment Rules** | Round-robin by board, by slug, by engagement score. Load-balance across team. When AI qualifies a lead, auto-assign based on rules instead of defaulting to unassigned. | +3-4 |
| Bonus | **Campaign Intelligence** | Cross-reference broadcast campaigns with deal outcomes. "Deals that received Campaign X converted 2.3x faster." Attribution tracking from first TG message to deal close. | +2-3 |

**Deliverables:**
- Deal prediction model: train on stage history, time-in-stage, engagement scores, conversation sentiment
- "Deal Intelligence" card: predicted close date, win probability, risk factors, recommended actions
- Auto-assignment engine: configurable rules (round-robin, weighted by capacity, by expertise tag)
- Assignment rules UI in Settings > Team
- Campaign attribution: tag deals with source campaign, track conversion through pipeline
- Campaign ROI dashboard: broadcasts → deals created → deals closed → value attributed

**Exit criteria:** The CRM tells reps what to do next, assigns work automatically, and proves which campaigns drive revenue. Score: 81+. Rank: #1.

**Estimated effort:** 4-5 weeks

---

## Stage Summary

| Stage | Theme | Score Target | Rank | Key Unlock | Effort |
|-------|-------|-------------|------|-----------|--------|
| **1** | Own the Conversation | 69+ | #3 | TG messages in deal detail + AI summaries | 2-3 wks |
| **2** | Automate the Intake | 73+ | #2 | AI qualification + auto-deal creation | 3-4 wks |
| **3** | Live in Telegram | 76+ | #2 (buffer) | TMA as primary mobile + sequence branching | 3-4 wks |
| **4** | Scale the Machine | 79+ | #2 (close) | Bot drips + unified inbox + saved views | 4-5 wks |
| **5** | Take the Crown | 81+ | **#1** | AI prediction + auto-assignment + attribution | 4-5 wks |

**Total timeline: ~16-21 weeks (4-5 months)**

### Rules of Engagement

1. **Don't start the next stage until the current one is hardened.** Half-shipped features are worse than missing features.
2. **Every stage hardens one existing feature.** New builds are worthless if the moat erodes.
3. **Score after each stage.** Re-run the competitive audit. If the numbers don't move, the stage failed — fix before proceeding.
4. **Ship to real users within each stage.** Internal dogfooding after week 1. The BD team should be using Stage 1 features before Stage 2 starts.
5. **Cut scope, not stages.** If a stage is taking too long, ship the 80% version and move on. Polish comes from usage feedback, not upfront design.
