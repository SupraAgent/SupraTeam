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
