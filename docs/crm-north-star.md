# CPO Review: SupraCRM — Multi-Channel Telegram-First CRM

**Reviewer persona:** CPO with 12+ years shipping CRMs at scale (HubSpot, Pipedrive, CRMChat). Deep expertise in Telegram-first GTM, automation, and Web3 BD workflows.

**Date:** 2026-04-03 | **Score: ~75/100** | **Previous: 64 (v2), 73.4 (v3)**

---

## Executive Assessment

**Score: ~75/100** — Upper-mid tier. 88 pages, 100+ migrations, 60+ API routes, visual workflow builder, multi-bot support, TMA, full Gmail integration, AI chat, broadcasts, outreach sequences, zero-knowledge Telegram sessions, and company records. The surface area has doubled since v2.

**The thesis evolved.** Started as "CRM that lives inside Telegram." Now it's a multi-channel engagement platform (Telegram + Gmail + Calendar) with Telegram as the primary channel. The Telegram moat features are still the differentiator, but email is now a production-grade parallel track.

**What's improved since v3 (73.4):**
- Email is now a full Gmail client (compose, threads, groups, sequences, side-by-side reply)
- Zero-knowledge Telegram sessions (client-side encryption, device-bound keys)
- Company records with contact linkage
- Email groups/folders with auto-routing by sender
- TG chat groups for organizing conversations
- Multiple security hardening passes (encryption key versioning, HMAC, scoped BroadcastChannel)

**What's still weak:**
- No AI deal prediction (health score exists but no predictive model)
- No campaign attribution (can't trace broadcast → deal → revenue)
- No public REST API (API key table exists, no v1 routes)
- Workflow dry-run still missing
- TMA offline mode not implemented
- Two workflow systems (automations + loop builder) still coexist

---

## Feature-by-Feature Assessment

### What's Strong (75+)

| Feature | Score | Notes |
|---------|-------|-------|
| **Group Management + Slugs** | 82/100 | Moat feature. Health classification, engagement tiers, per-member stats, slug tagging, sparklines, AI summaries. Best-in-class for TG CRM. |
| **Kanban Pipeline** | 80/100 | Dual-view, drag-drop, 3 board types, WIP limits, collapsible columns, saved views, AI sentiment overlay, forecast analytics. Mature. |
| **Telegram Bot** | 78/100 | Grammy with message recording, AI agent, push notifications, multi-bot registry, encrypted tokens. Solid production system. |
| **Broadcasting** | 77/100 | Slug-filtered targeting with AND/OR, merge variables, scheduling, A/B analytics, send-time optimization. Feature-rich. |
| **Visual Workflow Builder** | 76/100 | React Flow, 18+ triggers, 18+ actions, templates, execution history, webhook triggers. Approaching n8n-lite territory. |
| **Email Client** | 75/100 | Full Gmail sync, multi-account, compose with side-by-side reply/forward, threads, labels, email groups, sequences, AI drafts. Ambitious and functional. |
| **Multi-Bot Registry** | 75/100 | Encrypted token storage, per-group bot assignment, activate/deactivate, up to 10+ bots. Unique capability. |

### Mid-Tier (60-74)

| Feature | Score | Notes |
|---------|-------|-------|
| **Contact Management** | 70/100 | Lifecycle stages, duplicate detection + merge, engagement scoring, company linkage, TG identity. Missing: unified activity timeline, smart lists. |
| **Outreach Sequences** | 70/100 | Multi-step with branching (condition_type, on_true/false_step), A/B, AI generation. Two systems (/outreach + /drip) is confusing — consolidate. |
| **TMA (Mini App)** | 68/100 | 10 pages (deals, contacts, tasks, AI chat, broadcasts, apply). Real mobile CRM in Telegram. Push notifications working. Gestures partial. No offline. |
| **AI Chat/Agent** | 67/100 | Claude-powered on every page, per-page context, qualification extraction, escalation detection. Present but not decision-tree capable. |
| **Inbox** | 65/100 | Two-pane TG conversations with labels, snooze, VIP, canned responses. Missing: reply from inbox, conversation assignment SLAs, team collision detection. |
| **Calendar** | 60/100 | Google Calendar sync with webhooks. Functional but thin — no deal close date overlay, no drag-to-reschedule. |
| **Drip Sequences** | 60/100 | Files exist, worker exists, but implementation depth unclear. Overlap with outreach sequences creates confusion. |

### Weak (<60)

| Feature | Score | Notes |
|---------|-------|-------|
| **AI Lead Qualification** | 52/100 | Config flag for auto-create deals exists, qualification extraction works, but auto-creation logic incomplete. No configurable score threshold. |
| **Campaign Analytics** | 50/100 | Broadcast analytics exist (delivery rates, A/B). No campaign-to-deal attribution. Can't answer "which broadcast drove revenue?" |
| **Public API** | 30/100 | API key table designed, auth guard spec written. Zero v1 routes shipped. |
| **AI Deal Prediction** | 20/100 | Health score formula exists. No ML/Claude-powered prediction, no win probability, no recommended next action. |

---

## Top 3 Competitive Moats (Existing)

### 1. Slug-Based TG Group Access Control (10/10 importance)

No competitor has this. "Tag groups with slugs, 1-click add/remove users across all matching groups." For teams managing 50+ TG communities, this is the killer workflow. Combined with engagement tiers, health scoring, and AI summaries — this is the strongest single feature.

### 2. Zero-Knowledge Telegram + Conversation Timeline (9/10 importance)

Client-side encrypted TG sessions with device-bound keys. Server never sees plaintext. Conversation timeline embedded in deal detail with search, reply, and deep links. No other CRM shows TG messages inline with CRM data AND keeps sessions zero-knowledge.

### 3. Visual Workflow Builder + Bot Integration (8/10 importance)

React Flow canvas with 18+ triggers (including TG events) and 18+ actions. Templates, execution history, natural language creation. Connected to bot handlers — workflows fire on TG message events, stage changes, qualification triggers. This is the automation backbone.

---

## Top 3 Features to Build — Highest ROI

### 1. Public REST API + Zapier Foundation (10/10 importance)

**Why #1:** The API/Zapier category (wt=5) is the highest-weighted gap at 30/100. API key infrastructure exists. Internal routes handle all CRUD. This is a thin wrapper exercise — expose 10 endpoints under `/api/v1/` with key auth, rate limiting, and pagination. Score lift: +3-4 weighted.

**What "done" looks like:** External developer can create deals, list contacts, send broadcasts via authenticated API calls. Zapier can poll for new deals.

### 2. AI Chatbot Decision Trees (9/10 importance)

**Why:** AI Agent category (wt=4) scores 52/100. The free-form Claude agent exists but can't do structured flows. CRMChat's chatbot does keyword-triggered decision trees with auto-qualification and routing. Implementation path: new `chatbot_turn` workflow node + `bot_dm_received` trigger + stateful conversation engine. Score lift: +2-3 weighted.

**What "done" looks like:** Admin configures a flow: "If user says 'pricing' → send pricing card → ask budget → if >$10K → create deal + assign to BD lead." Runs automatically on bot DMs.

### 3. Campaign Attribution + Deal Prediction (8/10 importance)

**Why:** Two gaps that feed each other. Attribution (tag deals with `source_campaign_id`) answers "which broadcasts drive revenue." Prediction (Claude-powered win probability on deals) answers "which deals need attention." Combined with existing health scores and sentiment, this creates an intelligence layer no competitor has. Score lift: +3-4 weighted.

**What "done" looks like:** Dashboard widget shows "Campaign ROI: BD Outreach March → 12 deals, $340K pipeline, 3 won." Deal detail shows "72% win probability, recommended: schedule follow-up call."

---

## Architecture Issues to Address

| Issue | Severity | Notes |
|-------|----------|-------|
| Two workflow systems (automations + loop builder) | High | Confusing for users. Converge or clearly differentiate. |
| Two outreach systems (/outreach + /drip) | High | Same problem. Consolidate into one sequence builder with trigger types. |
| Monolithic page components (5 files > 1000 lines) | Medium | Broadcasts (1648), inbox (1536), groups (1397). Extract hooks, split panels. |
| No pagination on core API endpoints | Medium | Contacts, deals, groups load entire DB. Crashes at 1k+ records. |
| No real-time sync | Medium | Supabase realtime not wired. Changes invisible until refresh. |

---

## Score Projection

| Milestone | Target | Key Deliverables |
|-----------|--------|-----------------|
| Current | ~75 | — |
| + Public API + Quick Wins | ~79 | v1 REST API, chatbot flow trigger, group custom fields, inbox bot filter |
| + AI Chatbot Flows | ~82 | Decision tree builder, bot DM routing, stateful conversations |
| + Attribution + Prediction | ~85 | Campaign ROI, AI win probability, recommended actions |

**The path to #1 (81+) requires 2 things: ship the public API and ship chatbot flows.** Everything else is polish. These two features close the two highest-weighted competitive gaps.

---

## Bottom Line

Score went from 64 → ~75. That's real progress. The email track added significant capability but didn't move the Telegram CRM competitive score much (email is table stakes for CRM, not a differentiator in the Telegram niche).

The next +6 points come from:
1. **Public API** — highest weighted gap, lowest effort (thin wrappers on existing routes)
2. **Chatbot decision trees** — second highest gap, medium effort (extend existing workflow builder)
3. **Campaign attribution** — unique differentiator, connects broadcasts to revenue

Stop widening. The app does enough things. Make the API externally accessible, make the bot smart enough to run decision trees, and prove that broadcasts drive deals. That's #1.
