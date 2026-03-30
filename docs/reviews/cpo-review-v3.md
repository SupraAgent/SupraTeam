# SupraCRM CPO Review v3 — Feature Scorecard
**Date:** 2026-03-30 | **Overall Score: 73.4/100**

**Journey:** 32.5 (v1) → 64 (v2) → 73.4 (v3)

---

## Reviewers

| Persona | Role | Lens |
|---------|------|------|
| **Elena Voronova** | CPO, TeleCRM Pro (market leader, 50K+ teams) | Activation speed, time-to-value, daily BD rep UX |
| **Raj Mehta** | CPO, ChatPipe (#2, automation depth) | Power-user ceilings, integration depth, API extensibility |
| **Sofia Park** | CPO, GroupFlow (#3, community ops) | Group health, TMA mobile experience, 100+ group ops |

---

## 20 Functions Rated

| # | Function | Score | Lead | Verdict | To Hit 90+ |
|---|----------|-------|------|---------|------------|
| 1 | Pipeline / Kanban | 78 | Elena | Solid dual-view with filters, saved views, bulk actions, AI sentiment overlay. Deal card doing too much — info density without progressive disclosure hurts scannability. | Inline quick-edit on cards; subtotals + conversion arrows between columns |
| 2 | Telegram Inbox | 74 | Elena | Two-pane with labels, snooze, VIP, canned responses, context menus — good coverage. Missing conversation assignment SLAs, CSAT after close, team collision detection. | Agent collision / "typing" indicator; first-response-time tracking |
| 3 | Email Client | 72 | Raj | Ambitious — multi-account Gmail, AI drafts, IndexedDB cache. But rebuilding Gmail poorly. Only differentiating piece is thread-to-deal linking. | Drop Gmail rebuild, focus on CRM link: auto-associate threads to deals, surface email in deal timeline |
| 4 | Contacts | 68 | Elena | Lifecycle stages, quality score, on-chain enrichment, duplicate scanner — decent. No contact timeline, no smart lists, no contact-level automation triggers. | Unified activity timeline per contact; smart lists with auto-updating filters |
| 5 | Telegram Bot | 76 | Sofia | Grammy with message recording, AI agent, push notifications, inline keyboards, background workers, multi-bot. Solid. Missing webhook mode for production scale. | Webhook mode with fallback; per-group bot personality config |
| 6 | Group Management | **80** | Sofia | **Moat feature.** Health classification, engagement tiers, per-member stats, slug tagging, sparklines, AI summaries. Best-in-class for TG CRM at this stage. | Group comparison dashboard; automated re-engagement for "quiet" groups |
| 7 | Workflow Builder | 75 | Raj | React Flow with 18 triggers, 18 actions, 4 logic nodes, NL creation, version history, dry-run — impressive depth. No error recovery paths, no webhook-as-trigger. | Webhook trigger for external events; error handling/retry config per node |
| 8 | Broadcasts | 73 | Sofia | Slug-based targeting with AND/OR, merge variables, scheduled send, A/B analytics. Missing audience preview with exact reach, throttling, compliance opt-out. | Exact recipient preview before send; per-recipient delivery status |
| 9 | Outreach Sequences | 70 | Raj | Multi-step with triggers, AI generation, A/B. Having both /outreach AND /drip is confusing — legacy should die. Needs visual timeline. | Visual sequence timeline with branching; kill /drip entirely |
| 10 | Dashboard | 74 | Elena | ~10 widget types, time range selector, onboarding checklist, actionable notifications. Good command center. No widget customization or role-based defaults. | Drag-and-drop widget layout; role-based default dashboards |
| 11 | Access Control (Slugs) | 77 | Sofia | Slug-based group access matrix with bot auto-add/remove, audit log. Genuine differentiator for TG group ops at scale. | Time-bound access grants (auto-revoke); slug templates |
| 12 | Reports | 62 | Elena | Win rate, funnel, conversion, aging, team performance. All client-side — no materialized views, no scheduled delivery, no PDF export. | Server-side aggregation; scheduled report delivery via email/TG |
| 13 | TMA (Mini App) | 55 | Sofia | 5 tabs, deal list, tasks, AI chat. **Proof of concept, not a mobile experience.** No offline, no gestures, barely uses TG WebApp SDK. | Offline-first with service worker; native gestures; deep WebApp SDK integration |
| 14 | AI Chat Widget | 69 | Raj | Global floating chat with per-page context, can modify workflow canvas. Generic LLM wrapper — no CRM tool-use, no persistent memory. | CRM action execution from chat ("move Acme to MOU Signed"); persistent history |
| 15 | Calendar & Tasks | 60 | Elena | Custom calendar with deal dates, tasks with priorities. No two-way Google/Outlook sync, no meeting scheduling. Table stakes for BD. | Google Calendar bidirectional sync; meeting scheduling from deal detail |
| 16 | Settings & Integrations | 71 | Raj | 25+ settings pages covering TG, Slack, Gmail, webhooks, AI, API keys. Comprehensive. No integration health monitoring or webhook retry config. | Integration health dashboard; webhook retry policy config |
| 17 | Knowledge Graph | 45 | Raj | Cytoscape.js visualization demo. No BD rep uses this daily. Doesn't drive action or surface insights. | Cut it or make it actionable: "these 3 contacts connect to this whale deal" |
| 18 | SLA System | 66 | Elena | Per-board thresholds, bot push at warning/breach, deduplication. Solid foundation. No escalation chains, no SLA reporting. | Escalation chains with notification tiers; SLA compliance report |
| 19 | Companies | 40 | Elena | Create/delete, linked contacts, search. **Stub, not a feature.** For B2B blockchain BD, company should be first-class. | Company enrichment (Crunchbase/LinkedIn); account-level deal rollup |
| 20 | Application Form | 64 | Sofia | Multi-step with animations, validation, review. Hardcoded — no form builder, no conditional logic, no embed/share. | Configurable form builder; embeddable widget for external sites |

---

## Weighted Overall Score

| Weight | Function | Score |
|--------|----------|-------|
| 15% | Pipeline/Kanban | 78 |
| 13% | Telegram Inbox | 74 |
| 12% | Group Management | 80 |
| 10% | Telegram Bot | 76 |
| 8% | Access Control | 77 |
| 8% | Workflow Builder | 75 |
| 7% | Broadcasts | 73 |
| 6% | Outreach Sequences | 70 |
| 5% | Contacts | 68 |
| 4% | Dashboard | 74 |
| 3% | TMA | 55 |
| 3% | Email | 72 |
| 2% | Reports | 62 |
| 2% | Settings | 71 |
| 2% | Remaining 6 (avg) | 57 |

### **Overall: 73.4 / 100**

---

## One-Line Verdicts

**Elena (TeleCRM Pro):** "Strong pipeline and inbox foundation, but the BD rep still needs 4 fewer clicks for their daily standup — activation speed is the gap between 73 and 85."

**Raj (ChatPipe):** "Impressive automation breadth for this stage, but depth is shallow everywhere — the workflow builder, AI chat, and integrations all stop at 70% of what a power user needs before they hit a wall."

**Sofia (GroupFlow):** "Group management and slug-based access control are genuinely best-in-class for TG CRMs — that's your moat. But the TMA is a demo, not a product, and that's where your daily active users will actually live."

---

## Top 5 Highest-ROI Improvements

1. **TMA → real mobile product** (55→80 = +7.5 weighted pts) — offline, gestures, deep WebApp SDK
2. **Companies → first-class entity** (40→75 = +0.7 weighted pts, but unlocks account-based selling)
3. **Reports → server-side + delivery** (62→80 = +0.4 weighted pts)
4. **AI Chat → CRM tool-use** (69→85 = +0.5 weighted pts, high perception impact)
5. **Kill Knowledge Graph or make it actionable** (45→remove/80 = perception lift)
