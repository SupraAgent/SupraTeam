# Implementation Plan: SupraCRM — Path to #1

**Date:** 2026-04-03 | **Current Score:** ~75/100 | **Target:** 81+ (beat CRMChat at 80.5)

> Consolidates: `strategic-roadmap.md`, `remaining-plan.md`, `implementation-plan.md`, `plan.md`

---

## Current Position

| Rank | CRM | Score |
|------|-----|-------|
| 1 | CRMChat | 80.5 |
| 2 | Respond.io | 72.3 |
| **2-3** | **SupraCRM** | **~75** |
| 4 | Entergram | 66.6 |
| 5 | NetHunt CRM | 57.8 |

**Journey:** 32.5 (v1) -> 64 (v2) -> 73.4 (v3) -> ~75 (v4). Passed Entergram and Respond.io. Need +6 to beat CRMChat.

---

## What's Already Shipped (Stages 1-4 + Email)

| Feature | Category | Status |
|---------|----------|--------|
| TG conversation timeline in deal detail | TG Integration | Done |
| Full TMA (10 pages: deals, tasks, inbox, AI chat, broadcasts) | Mini-App + Mobile | Done |
| Outreach sequence branching | Outreach | Done |
| Bot AI agent with qualification + auto-deal creation (partial) | AI Agent | Done |
| Contact engagement scoring | AI Lead Qual | Done |
| Broadcast A/B + analytics | Outreach | Done |
| SLA monitoring | Workflows | Done |
| Smart reply suggestions | AI Summaries | Done |
| Forecast analytics | Kanban | Done |
| AI conversation summaries | AI Summaries | Done |
| Deal health + sentiment | AI Summaries | Done |
| Zero-knowledge TG sessions | Security | Done |
| Full Gmail client (compose, threads, groups, sequences) | Email | Done |
| Google Calendar sync | Calendar | Done |
| Company records | Contacts | Done |
| TMA push notifications | Mobile | Done |
| Saved pipeline views | Kanban | Done |
| Auto-assignment rules (inbox routing) | Workflows | Done |
| Bot drip sequences (partial) | Outreach | Partial |

---

## Tier 1: Ship to Beat CRMChat (~81+)

These close the two highest-weighted competitive gaps. Ship all of Tier 1 to reach #1.

### 1a. Public REST API (M — 2 weeks)

**Score lift:** +3-4 weighted (API/Zapier category wt=5, currently 30/100)

**What exists:**
- `crm_api_keys` table spec (hash, scopes, rate limit)
- `requireApiKey()` auth guard spec in `lib/auth-guard.ts`
- All internal CRUD routes already handle the logic

**What to build:**

| Task | Details |
|------|---------|
| Migration: `crm_api_keys` table | `key_prefix`, `key_hash` (SHA-256), `scopes[]`, `rate_limit`, `last_used_at`, `revoked_at` |
| API key management UI | `app/settings/api/page.tsx` — generate, list, revoke keys. Show full key once. |
| Auth guard: `requireApiKey()` | Check `Authorization: Bearer sk_live_...` header, validate hash, check scopes, rate limit |
| Rate limiter | In-memory sliding window per key prefix (`lib/rate-limiter.ts`) |
| 10 v1 endpoints | Thin wrappers under `app/api/v1/`: deals (GET/POST/PATCH), contacts (GET/POST/GET:id), groups (GET), broadcasts/send (POST), pipeline/stages (GET) |
| API docs page | `app/settings/api/docs/page.tsx` — static endpoint listing with curl examples |

**Standard v1 envelope:** `{ data: T, meta: { page, per_page, total } }`

### 1b. AI Chatbot Decision Trees (L — 3 weeks)

**Score lift:** +2-3 weighted (AI Agent wt=4, currently 52/100)

**What exists:**
- AI agent with free-form Claude conversations + escalation
- Workflow builder with React Flow canvas + 18 triggers/actions
- `bot_dm_received` trigger concept (designed, partially wired)

**What to build:**

| Task | Details |
|------|---------|
| Migration: `crm_chatbot_flows` | `bot_id`, `name`, `trigger_keywords[]`, `nodes` (React Flow JSONB), `edges`, `is_active`, `fallback_to_ai` |
| Migration: `crm_chatbot_sessions` | `flow_id`, `tg_user_id`, `tg_chat_id`, `current_node_id`, `context` (JSONB), `status` |
| Chatbot node types | `chatbot_message`, `chatbot_question` (wait for reply), `chatbot_branch` (keyword/intent), `chatbot_qualify` (AI extraction), `chatbot_handoff`, `chatbot_action` (CRM actions) |
| Flow execution engine | `lib/chatbot-flow-engine.ts` — stateful: check active session -> resume, or match trigger keywords -> start new session |
| Bot handler integration | In `bot/handlers/messages.ts`: check chatbot flows before AI agent fallback. Priority: chatbot flow > workflow trigger > AI agent |
| Builder UI | Extend `app/automations/` or new `app/chatbot-flows/page.tsx` — React Flow with chatbot nodes, preview/test mode |

### 1c. Quick Wins Sprint (S — 1 week, parallel)

| Item | What | Effort | Lift |
|------|------|--------|------|
| Group custom fields | Copy contact field pattern -> `tg_group_fields` + `tg_group_field_values`. Field management UI in settings. | 4h | +0.5 |
| Webhook event expansion | Add 5 events to existing `crm_webhooks`: `broadcast.sent`, `sequence.completed`, `sla.breached`, `drip.enrolled`, `highlight.created` | 4h | +0.5 |
| Inbox bot filter | Bot selector dropdown on inbox page. Filter by `bot_id` query param. | 2h | +0.5 |
| Group conversation summaries | `POST /api/groups/[id]/summary` — Claude summarizes last 50 messages. "Summarize" button in group detail. | 3h | +0.5 |

---

## Tier 2: Moat + Intelligence (~83+)

Ship after Tier 1 to create sustainable differentiation.

### 2a. Campaign Attribution (M — 2 weeks)

| Task | Details |
|------|---------|
| Add `source_campaign_id` to `crm_deals` | Tag deals with the broadcast/sequence that originated them |
| Attribution tracking | First-touch (first broadcast contact received) and last-touch (most recent before deal creation) |
| Campaign ROI widget | Dashboard + reports: broadcasts -> conversations -> qualified -> deals -> won -> value |

### 2b. AI Deal Prediction (M — 2 weeks)

| Task | Details |
|------|---------|
| `POST /api/deals/[id]/predict` | Inputs: conversation timeline, engagement trend, stage velocity, historical data. Claude-powered. |
| Output | Dynamic win probability, estimated close date, risk factors, recommended next action |
| "Deal Intelligence" card | Replace static health score in deal detail with predictive card. Run on stage change + daily cron. |

### 2c. TG Folder Sync (M — 1 week)

| Task | Details |
|------|---------|
| MTProto folder API | Add `getDialogFilters()`, `updateDialogFilter()`, `deleteDialogFilter()` to `lib/telegram-client.ts` |
| Sync logic | `lib/folder-sync.ts` — slug -> folder mapping. Create/update "CRM: {slug}" folders. |
| UI | Toggle per slug: "Sync to TG folder". Status indicator + manual sync button. |

### 2d. Payment Tracking (L — 2 weeks)

| Task | Details |
|------|---------|
| Migration: `crm_payment_tracking` | `deal_id`, `wallet_address`, `chain`, `token`, `expected_amount`, `tx_hash`, `status`, `confirmations` |
| Payment poller | `bot/payment-poller.ts` — 60s cron, query chain RPC, auto-move deal stage on confirmation |
| Deal UI | "Payment" tab in deal detail. Wallet input, amount, token selector, confirmation progress bar. |

Unique moat: no other Telegram CRM tracks blockchain payments.

---

## Tier 3: Polish + Defensibility

| Feature | What | Size |
|---------|------|------|
| Consolidate outreach systems | Merge /outreach + /drip into single sequence builder with trigger types | M |
| Consolidate workflow systems | Decide: converge automations + loop builder, or clearly differentiate as "Rules" vs "AI Flows" | M |
| Knowledge graph view | Obsidian-style graph of deals, contacts, companies, groups. `crm_docs` + `crm_doc_links` tables. Cytoscape.js canvas. | L |
| Multi-workspace / white-label | Separate data by workspace_id. RLS per workspace. | L |
| Calendar timeline view | Deal close dates on calendar, drag-to-reschedule, broadcast schedule overlay | M |
| QR code lead capture | QR deep-link to bot DM with pre-filled context. Scan at events -> auto-create contact + deal. | S |
| Advanced reporting | Exportable PDF reports, custom metric builder, scheduled email reports | M |

---

## Architecture Debt (Address Alongside Features)

| Issue | Priority | Action |
|-------|----------|--------|
| No pagination on core endpoints | P0 | Add limit/offset to contacts, deals, groups APIs. Infinite scroll on frontend. |
| Monolithic components | P1 | Extract state into custom hooks. Broadcasts (1648 lines), inbox (1536), groups (1397). |
| No real-time sync | P1 | Wire Supabase realtime subscriptions on deals, inbox, broadcasts. |
| Missing error boundaries | P1 | Add to all pages (only email has one). |
| `window.confirm()` on destructive actions | P1 | Replace with themed confirmation dialog component. |
| No body validation on POST/PATCH routes | P2 | Add Zod validation on all mutation endpoints. |

---

## Score Projection

| Milestone | Score | Delivers | Timeline |
|-----------|-------|----------|----------|
| Current | ~75 | — | — |
| + Quick Wins | ~77 | Group fields, webhooks, inbox filter, summaries | Week 1 |
| + Public API | ~80 | v1 REST endpoints, API keys, rate limiting, docs | Weeks 2-3 |
| + Chatbot Flows | ~82 | Decision trees, bot DM routing, stateful conversations | Weeks 3-5 |
| + Attribution + Prediction | ~85 | Campaign ROI, AI win probability | Weeks 5-7 |
| + Folder Sync + Payments | ~87 | TG folder mapping, blockchain payment tracking | Weeks 7-9 |

**Critical path: Quick Wins (1 wk) -> Public API (2 wk) -> Chatbot Flows (2 wk) = #1 in 5 weeks.**

---

## What We Intentionally Skip

| Gap | Why |
|-----|-----|
| Omnichannel (WhatsApp, IG, SMS) | Telegram-first by design. Not a weakness — a focus. |
| Voice transcription | Low value for BD text-based workflows |
| HubSpot/Salesforce bidirectional sync | Webhook outbound + public API covers 80% of use cases |
| Full project management (Gantt, time tracking) | Different product for different market |

---

## Risk Register

| Risk | Impact | Mitigation |
|------|--------|-----------|
| MTProto folder API rate limits | Folder sync fails at scale | Batch operations, exponential backoff, max 1 sync per 5 min per slug |
| Claude API latency for chatbot flows | User-facing delay in bot responses | Stream responses, cache common paths, fallback to template |
| API key security | Leaked keys = data breach | Hash at rest, scoped permissions, key rotation, rate limiting |
| Chain reorgs (payment tracking) | False positive confirmations | Wait for N confirmations, idempotent stage transitions |
| Two workflow systems creating confusion | User churn | Decide convergence strategy before shipping more automation features |
