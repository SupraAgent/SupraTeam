# CRM CPO Review -- SupraCRM

**Date:** 2026-03-28
**Reviewer:** CPO Agent
**Overall Score:** 8.3 / 10

---

## Feature & Function Rating Table

| Category | Feature | Rating (1-10) | Maturity | Notes |
|---|---|---|---|---|
| **Pipeline & Deals** | Kanban board (drag-drop, multi-board) | 9 | Production | 4 board types, collapsible columns, WIP indicators, inline editing |
| | Deal cards (data density) | 9.5 | Production | Ice effects, sentiment momentum, health dots, unread badges -- best-in-class info density |
| | Custom fields | 8 | Production | 6 field types, per-board scoping, required flag |
| | Filtering & saved views | 8.5 | Production | 7 filter dimensions, URL persistence, saved presets |
| | Bulk actions | 7.5 | Production | Move/delete/outcome; missing undo and confirm on non-delete |
| | Pipeline insights (AI) | 8 | Production | Claude-powered executive summary with risk/opportunity signals |
| **Contacts** | List & detail views | 8 | Production | Desktop table + mobile cards, 9 columns, lifecycle badges |
| | Duplicate detection & merge | 9 | Production | Multi-signal algorithm (email, TG, phone, name fuzzy), confidence scoring, field-by-field merge preview |
| | Telegram identity linking | 8.5 | Production | Private contact sync, group import, share-to-CRM flow |
| | Engagement scoring | 7.5 | Production | Background cron, multi-factor (TG activity, reply rate, recency) |
| | Quality scoring | 6.5 | Beta | Client-calculated, no server-side consistency |
| | Export | 6 | MVP | CSV only, no import, no custom column selection |
| **Telegram** | Multi-bot registry | 9 | Production | Encrypted tokens, per-bot webhook, activate/deactivate |
| | Group management & slugs | 9 | Production | Tag-based access control, matrix UI, bulk ops, audit log |
| | Broadcasts | 9 | Production | A/B testing, rich media, send-time optimization, suppression rules |
| | Stage-change notifications | 8.5 | Production | Template variables, action buttons, privacy levels per group |
| | Bot AI agent | 8 | Production | Configurable role prompt, escalation detection, auto-qualification, auto-deal creation |
| **Automation** | Visual workflow builder | 9 | Production | 20 triggers x 20 actions, React Flow canvas, dry-run, templates |
| | Loop Builder | 8.5 | Production | Streaming LLM, real-time cost calc, onboarding tour |
| | Outreach sequences | 9 | Production | Conditional branching, A/B splits, goal-based completion, analytics |
| | Drip sequences | 8.5 | Production | Event-triggered (group_join, silence_48h, engagement_drop) |
| | Email sequences | 7.5 | Production | Template vars, scheduling, worker processing |
| | Automation rules | 8 | Production | Trigger->condition->action, SLA enforcement, delivery retries |
| **AI** | Global chat assistant | 9 | Production | 13 page-specific contexts, workflow JSON generation, template suggestions |
| | Sentiment analysis | 8 | Production | Multi-source (notes, TG messages, stage history), momentum tracking |
| | Highlight triage | 7.5 | Production | Auto-categorize by urgency, batch processing |
| | AI classification | 8 | Production | Lead quality, intent, urgency scoring |
| **Settings & Admin** | Settings ecosystem | 9 | Production | 19+ pages, integrations, pipeline, AI, compliance, webhooks, API keys |
| | GDPR / Privacy | 8.5 | Production | Retention policies, auto-purge, deletion requests, consent records |
| | Audit logging | 8 | Production | Action history, entity filtering, actor attribution |
| | Role-based access | 7.5 | Production | 3 roles (bd_lead, marketing_lead, admin_lead); functional but basic |
| | Onboarding | 7 | Production | Interactive 6-step tour for Loop Builder; no full-app onboarding |
| **Dashboard** | Analytics & KPIs | 8.5 | Production | Win rate, revenue, forecast, velocity, health distribution, trends |
| | Activity feed | 8 | Production | Multi-event types, real-time metrics |
| **UX & Design** | Dark mode design system | 9 | Production | HSL variables, consistent glass effects, semantic colors |
| | Mobile responsiveness | 7.5 | Production | List view fallback, mobile header, touch targets -- no offline |
| | Information architecture | 8.5 | Production | 19 nav items logically grouped; clean sidebar |
| **Infrastructure** | Database design | 9 | Production | 62 migrations, proper indexing, RLS, atomic RPCs |
| | API coverage | 9 | Production | 194 routes, RESTful, proper status codes, webhook delivery |
| | Type safety | 8.5 | Production | Strict TS throughout, comprehensive interfaces |

---

## Statements That Stick Out

### 1. The Telegram moat is real and deeply engineered

This isn't a CRM that bolted on a Telegram integration as an afterthought. The multi-bot registry with AES-256-GCM encrypted tokens, slug-based access control matrix, privacy-level-aware notifications, send-time optimization from reply hour stats, and event-triggered drip sequences (silence_48h, engagement_drop) -- this is a **Telegram-native CRM**, not a CRM with Telegram. Most competitors treat messaging as a notification channel. SupraCRM treats it as the primary workspace. That's the right call for Web3 BD where deals happen in group chats, not email threads.

### 2. The deal card information density is the best I've seen in a lightweight CRM

Ice-frost effects for stale deals, sentiment momentum arrows, health score dots, unread message badges, inline-editable value/probability, response-time SLA indicators, engagement highlighting -- all on a single card without feeling cluttered. The "ice" cold-activity visualization (CSS-only, 8 progressive frost stages) is genuinely creative and more intuitive than a red badge saying "stale."

### 3. Two workflow systems is a strategic risk

There are **two** complete visual workflow builders: the classic automations system (React Flow, 20x20 trigger/action matrix) and the Loop Builder package (streaming LLM, cost tracking). Both are production-quality. But maintaining two parallel automation paradigms will confuse users and split engineering effort. Recommendation: converge them or clearly differentiate their use cases in the UI (e.g., Loop Builder = AI-heavy flows, Automations = rule-based flows).

### 4. Scalability has a known ceiling

No pagination anywhere -- contacts, deals, and workflow runs all load into memory. The O(n^2) duplicate detection algorithm and full-dataset client-side filtering will hit a wall around 500-1000 records. For an internal tool serving a small team today, this is fine. But if SupraCRM ever opens to external teams or the deal pipeline grows past a few hundred, pagination and server-side filtering become urgent.

### 5. The AI integration is genuinely useful, not gimmicky

Claude is wired into 13 page-specific contexts, generates actual workflow JSON that drops into the canvas, auto-qualifies leads from Telegram conversations, and produces executive pipeline summaries with risk signals. The sentiment analysis pulls from three data sources (notes, TG messages, stage history) before scoring. This isn't "AI-powered" marketing -- it's AI doing real work that would otherwise take a human 15 minutes per deal.

### 6. Missing: real-time collaboration and undo

No WebSocket/Supabase realtime subscriptions means two team members working the board simultaneously will overwrite each other. No undo on deal moves means accidental drags are manually recoverable only. For a team tool, these are the kind of quality-of-life gaps that erode daily trust in the system.
