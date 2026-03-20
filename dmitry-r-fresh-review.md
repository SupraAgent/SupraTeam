# Planfix CPO "Dmitry R." — Fresh Review of SupraCRM (Current Build)
**Date:** 2026-03-20 | **Reviewer:** Dmitry R. (Planfix Head of Product persona)
**Context:** First-time review of the current codebase. No knowledge of previous scores. Scored the lowest in v1 (29.7/100).

---

## Who I Am

Enterprise process architect. 15+ years in business process management. I built Planfix — 400+ configurable tools, one platform that becomes YOUR platform. CRM is just one use case. If your tool doesn't let me customize everything, it's another piece of tech debt in the stack.

---

## First Impressions

I audited the full codebase: 33 SQL migrations, 226 TypeScript files, 123 API routes, 34 lib modules.

> "Credit where due — this is no longer a pipeline stub with empty database columns. There's a real task system, a working workflow engine with a visual ReactFlow builder, actual AI integration with Claude, and GDPR tooling. But my core objection hasn't changed: **this is a single-purpose, single-channel CRM that can't be bent into anything else.** No custom entities. No custom views. No reporting builder. No Gantt. No calendar. No timeline. It does one thing — Telegram BD pipeline management — and for that narrow scope, it's become competent. But competent in a narrow lane isn't the same as competitive."

---

## 30-Category Ratings

| # | Category | Wt | Best Competitor | My Score | Reasoning |
|---|----------|-----|-----------------|----------|-----------|
| 1 | Kanban Pipeline Management | 5 | 90 | **74** | Working drag-drop with 8 pipeline components (board, column, card, detail panel, filters, bulk actions, list view). Board types (BD/Marketing/Admin) and knowledge graph with 4 layouts. Decent. But no custom views — can't save filters, can't create personal boards, can't switch to table/calendar/timeline views. Rigid. |
| 2 | Contact/Lead Management | 5 | 90 | **66** | Lifecycle stages (6 states), quality scoring, advanced filters, bulk actions, Telegram import. Custom fields UI exists (6 types). Duplicate scanner with multi-signal scoring and merge. Better than I expected. But no custom entities (can't model Partners, Vendors, Investors separately). No enrichment API. No cross-entity linking beyond deal→contact. |
| 3 | Deal Tracking & Stages | 4 | 88 | **72** | Stage history, outcomes, board-type separation, weighted value. Deal detail panel is functional. Knowledge graph shows cross-entity relationships. Still no custom deal views, no forecasting, no win-rate analytics. |
| 4 | Task Assignment & Reminders | 4 | 85 | **62** | Full task page (368 lines). 5 task types: follow-up, stale, stage-suggestion, escalation, manual. Snooze with 5 time options. Filters (all/due/snoozed/manual/auto). Linked to deals. This actually works now. But no subtasks, no recurring tasks, no time tracking, no Gantt. It's a reminder system, not a task management system. |
| 5 | Custom Fields & Properties | 3 | 85 | **58** | UI exists in Settings > Contacts (201 lines). 6 field types (text, number, dropdown, date, URL, long text). Drag-and-drop ordering. CRUD via API. Used in contact creation and detail panels. Decent for contacts. But no custom fields on deals, no custom fields on groups, no calculated fields, no field-level permissions. Contact-only. |
| 6 | Duplicate Detection | 2 | 78 | **70** | Three dedicated API routes (scan-duplicates, merge, duplicates). Multi-signal confidence scoring. Merge UI in contacts page. This is genuinely solid for a small CRM. No auto-dedup on import, no scheduled scans, but the core is there. |
| 7 | Native TG Integration Depth | 5 | 95 | **68** | Bot registry, per-bot webhooks, stage-change notifications with inline CRM buttons, template engine with conditionals. Groups page is massive (1228 lines). Group detail panel. This is the strength of the product — deep Telegram-first design. Still missing: inline deal editing from TG, thread-level context, read receipts. |
| 8 | Multi-Account Management | 5 | 95 | **52** | Bot registry (crm_bots table) with encrypted tokens. Per-bot webhook routing. Bot CRUD with Telegram getMe verification. Settings UI for bot management. Per-group bot assignment. This is operational but rudimentary — no unified inbox across bots, no per-bot analytics, no workspace isolation. |
| 9 | TG Folder Sync | 4 | 90 | **8** | Still not implemented. This requires Telegram's MTProto folder API. The telegram-client.ts (257 lines) exists for personal account connections but folder sync is a different beast. Giving 8 instead of 0 because the MTProto infrastructure theoretically supports it. |
| 10 | Personal Account Support | 4 | 95 | **55** | telegram-client.ts (257 lines), telegram-connect settings page, session management. Phone + connection flow exists. But no message reading from personal account, no contact sync from personal TG, no dual-mode (bot + personal). Infrastructure without depth. |
| 11 | Group/Channel Monitoring | 3 | 80 | **72** | 1228-line groups page. Group detail panel. Health tracking. Member engagement. Slug-based tagging. Bot assignment per group. Bulk operations. This is well-built for the use case. No sentiment analysis on group messages, no topic-level tracking. |
| 12 | Mini-App / In-TG UX | 4 | 92 | **56** | TMA with home, deals, contacts pages and layout. Quick stage moves. Functional but thin — no task management in TMA, no AI chat, no broadcast management. It's a read-only deal viewer with one action. |
| 13 | Broadcast Messaging | 4 | 88 | **74** | 951-line broadcast page. Rich editor, scheduling, slug filtering, delivery tracking. Broadcast history with analytics. This is one of the strongest features. Still single-channel (TG only), no A/B testing, no drip campaigns. |
| 14 | Outreach Sequence Automation | 4 | 88 | **61** | 439-line outreach page. API for sequences, steps, enrollment. Multi-step sequences exist. But no branching logic within sequences, no reply detection, no auto-pause on response. Linear sequences only. |
| 15 | Personalization / Merge Variables | 3 | 82 | **68** | Template engine in telegram-templates.ts with conditionals and defaults. Merge variable registry. Templates settings page. Used across broadcasts and sequences. No A/B variant testing, no send-time optimization. |
| 16 | QR Code Lead Capture | 2 | 85 | **5** | Not implemented. No QR generation, no deep-link capture. Giving 5 because Telegram deep links exist in the bot framework and could theoretically serve this purpose. |
| 17 | Campaign Analytics | 3 | 85 | **58** | Analytics API exists. Broadcast delivery rates, slug performance metrics. Dashboard with stats. Better than basic. No conversion attribution, no funnel analysis, no cohort tracking, no exportable reports. |
| 18 | AI Agent / Chatbot | 4 | 90 | **60** | Real Claude API integration (154-line respond route). Conversation history context. Configurable role prompt and knowledge base. Escalation keyword detection. Deal context injection. This actually works. No multi-model support, no conversation routing, no bot persona per group, no analytics on AI performance. |
| 19 | AI Lead Qualification | 3 | 85 | **45** | Built into the AI agent — auto_qualify flag, configurable qualification_fields, JSON extraction from AI responses via `<qualification>` tags. Clever integration but no dedicated scoring model, no threshold-based auto-routing, no qualification dashboard. It's qualification-by-side-effect, not a system. |
| 20 | Workflow Automation Builder | 4 | 92 | **68** | ReactFlow visual builder (276-line canvas, node sidebar, config panel). 4 node types (trigger, condition, delay, action). 507-line execution engine that actually traverses the graph and executes actions (send TG, send email, update deal, create task). Run history tracking. This is the biggest surprise — it's a real workflow engine, not a stub. Still: no loop/iteration nodes, no error handling nodes, no sub-workflow calls, no version history. |
| 21 | Voice-to-Data / NLP | 2 | 80 | **5** | Not implemented. No voice message transcription, no NLP entity extraction from text. Giving 5 because the AI agent could theoretically be extended. |
| 22 | AI Summaries & Sentiment | 3 | 82 | **60** | Deal sentiment migration exists. AI chat widget (516 lines) provides conversational AI interface. Sentiment analysis referenced in deal context. AI summaries available through the chat interface. No automatic summarization of TG group threads, no batch sentiment scoring, no trend visualization. |
| 23 | Third-Party CRM Sync | 3 | 85 | **18** | Webhook system with HMAC signing (131-line route, 126-line lib). 8 event types with auto-disable on failure. Outbound only. No HubSpot, Salesforce, Pipedrive connectors. No inbound webhook consumption. No field mapping. Webhooks are infrastructure, not integration. |
| 24 | Zapier / API Access | 3 | 90 | **48** | HMAC-signed webhooks are the foundation of API access. Configurable per event type. But no public REST API documentation, no API keys for third parties, no Zapier/Make app, no OAuth provider. You can push data out, but nobody can pull data in. |
| 25 | Omnichannel | 2 | 95 | **25** | Telegram + Email (Gmail push integration exists). No WhatsApp, no Instagram, no Facebook Messenger, no SMS, no webchat widget. By design — this is a Telegram-first CRM. But "by design" doesn't change the score. |
| 26 | Privacy (No Message Storage) | 3 | 95 | **65** | AES-256-GCM for stored tokens. Data retention policies API. Auth guard middleware. GDPR privacy section in settings. Consent records. No zero-message-storage mode. AI conversations ARE stored. Token encryption is solid but message privacy is partial. |
| 27 | GDPR / Compliance | 2 | 90 | **62** | Full privacy API section: /api/privacy/consent, /api/privacy/delete, /api/privacy/export, /api/privacy/retention. Four dedicated routes. Audit logging (audit.ts). This is functional GDPR tooling. No automated data expiry enforcement, no DPA generation, no cross-border transfer documentation. |
| 28 | UI/UX Quality & Design | 4 | 85 | **72** | Consistent dark-mode design system. HSL CSS variables. Clean component library (button, badge, card, input, textarea, select). Sonner toasts. Skeleton loaders. Knowledge graph visualization. Workflow canvas. No accessibility (ARIA), no internationalization, no custom dashboard layouts, no drag-and-drop dashboard widgets. |
| 29 | Mobile Experience | 3 | 88 | **52** | Responsive CSS layouts throughout. TMA provides in-Telegram mobile experience. Mobile sidebar/topbar in app shell. But no PWA manifest, no offline support, no touch-optimized interactions beyond basic responsive. TMA is thin. |
| 30 | Onboarding Speed / Time-to-Value | 3 | 90 | **64** | Setup checklist component (components/onboarding/setup-checklist.tsx). Welcome wizard referenced. Settings pages for each integration. But onboarding requires: GitHub OAuth + bot token setup + bot as group admin + slug tagging. 4+ step process before value. No guided tour, no demo data, no sandbox mode. |

---

## Weighted Score Calculation

Using the same formula: Weighted Score = Sum(score × weight) / Sum(weight)

| Category Group | Categories | Avg Score | Weight-Adjusted |
|---------------|------------|-----------|----------------|
| CRM Core (1-6) | Kanban, Contacts, Deals, Tasks, Fields, Dedup | 67.0 | High weights |
| Telegram (7-12) | TG Integration, Multi-Account, Folders, Personal, Groups, TMA | 51.8 | Mixed |
| Outreach (13-16) | Broadcast, Sequences, Personalization, QR | 52.0 | Mid-weights |
| Analytics/AI (17-22) | Campaign, AI Agent, AI Qual, Workflows, Voice, Sentiment | 49.3 | Mid-weights |
| Integrations (23-25) | CRM Sync, API, Omnichannel | 30.3 | Low-mid weights |
| Trust & Polish (26-30) | Privacy, GDPR, UI/UX, Mobile, Onboarding | 63.0 | Mixed |

**Weighted calculation:**

| # | Cat | Wt | Score | W×S |
|---|-----|-----|-------|-----|
| 1 | Kanban | 5 | 74 | 370 |
| 2 | Contacts | 5 | 66 | 330 |
| 3 | Deals | 4 | 72 | 288 |
| 4 | Tasks | 4 | 62 | 248 |
| 5 | Custom Fields | 3 | 58 | 174 |
| 6 | Dedup | 2 | 70 | 140 |
| 7 | TG Integration | 5 | 68 | 340 |
| 8 | Multi-Account | 5 | 52 | 260 |
| 9 | TG Folder Sync | 4 | 8 | 32 |
| 10 | Personal Account | 4 | 55 | 220 |
| 11 | Group Monitoring | 3 | 72 | 216 |
| 12 | Mini-App | 4 | 56 | 224 |
| 13 | Broadcast | 4 | 74 | 296 |
| 14 | Outreach | 4 | 61 | 244 |
| 15 | Personalization | 3 | 68 | 204 |
| 16 | QR Code | 2 | 5 | 10 |
| 17 | Campaign Analytics | 3 | 58 | 174 |
| 18 | AI Agent | 4 | 60 | 240 |
| 19 | AI Lead Qual | 3 | 45 | 135 |
| 20 | Workflow Builder | 4 | 68 | 272 |
| 21 | Voice/NLP | 2 | 5 | 10 |
| 22 | AI Summaries | 3 | 60 | 180 |
| 23 | 3rd Party Sync | 3 | 18 | 54 |
| 24 | Zapier/API | 3 | 48 | 144 |
| 25 | Omnichannel | 2 | 25 | 50 |
| 26 | Privacy | 3 | 65 | 195 |
| 27 | GDPR | 2 | 62 | 124 |
| 28 | UI/UX | 4 | 72 | 288 |
| 29 | Mobile | 3 | 52 | 156 |
| 30 | Onboarding | 3 | 64 | 192 |
| | **Totals** | **103** | | **5984** |

**Dmitry R.'s Weighted Score: 58.1 / 100**

---

## Comparison vs. Competitors

| Rank | CRM | Weighted Score |
|------|-----|---------------|
| 1 | CRMChat | 80.5 |
| 2 | Respond.io | 72.3 |
| 3 | Entergram | 66.6 |
| 4 | NetHunt CRM | 57.8 |
| **5** | **SupraCRM (Dmitry R.)** | **58.1** |
| 6 | Planfix | 55.5 |

**SupraCRM sits right at the NetHunt line. Depending on the day, it's #4 or #5.**

For reference, the v2 consensus average was 64. My score of 58.1 is ~6 points below that — I'm consistently the harshest reviewer because I penalize narrow scope.

---

## Where SupraCRM Surprised Me (Genuine Credit)

| Category | My Score | Why I'm Impressed |
|----------|----------|-------------------|
| Workflow Builder | 68 | ReactFlow visual builder with a 507-line execution engine that actually runs. 4 node types, graph traversal, run history. This isn't a mockup. |
| Broadcast | 74 | 951-line page. Rich editor, scheduling, slug filtering, delivery tracking. One of the best features in the product. |
| Duplicate Detection | 70 | 3 API routes, multi-signal confidence scoring, merge UI. Clean implementation for the scale. |
| AI Agent | 60 | Real Claude API integration with conversation history, escalation, qualification extraction. It's not deep but it's not fake. |
| Groups | 72 | 1228-line page. Per-group bot assignment, bulk operations, health tracking, slug tagging. This is where the Telegram-first bet pays off. |

---

## Where SupraCRM Still Gets Destroyed

| Category | Score | Gap to Best | My Objection |
|----------|-------|-------------|-------------|
| TG Folder Sync | 8 | -82 | Infrastructure exists but the feature doesn't. |
| QR Code | 5 | -80 | Not implemented. |
| Voice/NLP | 5 | -75 | Not implemented. |
| Omnichannel | 25 | -70 | By design, but design choices have consequences. |
| 3rd Party Sync | 18 | -67 | Outbound webhooks are not integrations. |
| Zapier/API | 48 | -42 | Can push but nobody can pull. |
| Multi-Account | 52 | -43 | Bot registry without unified inbox = partial. |
| AI Lead Qual | 45 | -40 | Side-effect of AI chat, not a system. |

---

## My Core Objection (Unchanged)

SupraCRM is a **single-purpose, single-channel pipeline tracker** that has grown real muscles in its narrow lane. The workflow engine, task system, broadcast tool, and AI agent are genuinely functional — they're not stubs anymore.

But it fundamentally can't do what Planfix does:
- **No custom entities** — you can't model anything beyond deals/contacts/groups
- **No custom views** — can't save filter combos, can't create personal dashboards
- **No reporting builder** — no drag-and-drop report creation
- **No cross-departmental coverage** — no help desk, no project management, no time tracking
- **No calendar/Gantt/timeline views** — everything is either kanban or table
- **No sub-tasks, no recurring tasks, no dependencies** — the task system is reminders, not work management

For a 10-person BD team running Telegram deals, this is now a usable tool. For anyone who needs their CRM to be more than a CRM, it's still a dead end.

**Score: 58.1 / 100** — up from 29.7 in v1 (+28.4). Respectable improvement. Still below the market midpoint for feature breadth.

---

## Scoring Methodology

- 0-100 scale per category. 90+ = Best-in-class. 70-89 = Strong. 50-69 = Adequate. <50 = Weak/Missing.
- Weights: 1-5 (5 = critical for Telegram-first CRM).
- Weighted score = Sum(score × weight) / Sum(weight).
- Audited: 33 migrations, 226 TS/TSX files, 123 API routes, 34 lib modules.
- Reviewed through the lens of an enterprise process architect who values configurability and cross-departmental coverage above single-purpose depth.
