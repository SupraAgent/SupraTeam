# Implementation Plan: SupraCRM — Path to #1

**Date:** 2026-04-03 | **Current Score:** 69.5/100 | **Target:** 80.5 (beat CRMChat)

> Based on rigorous 30-category weighted scoring. See `reviews/cpo-review-2026-04-03.md` for full scorecard. Priorities ordered by weighted score impact, not effort.

---

## Current Position

| Rank | CRM | Score |
|------|-----|-------|
| 1 | CRMChat | 80.4 |
| 2 | Respond.io | 72.0 |
| **3** | **SupraCRM** | **69.5** |
| 4 | Entergram | 68.7 |

Gap to #1: **-10.9 points.** Top 5 moves close +4.9. Full execution to 80+ requires ~8 features total.

---

## Tier 0: Highest-Impact Feature (Ship First)

### TG Folder Sync (+2.3 weighted — largest single lever)

**Current:** 15/100 | **Target:** 75/100 | **CRMChat:** 90/100

This is worth more than the next 3 features combined. CRMChat's folder sync means instant onboarding — users' existing TG folders become pipeline stages. We have the MTProto client but zero folder API usage.

| Task | Details |
|------|---------|
| MTProto folder methods | Add `getDialogFilters()`, `updateDialogFilter()`, `deleteDialogFilter()` to `lib/telegram-client.ts` |
| Sync engine | `lib/folder-sync.ts` — slug -> folder mapping. Create/update "CRM: {slug}" folders. Batch with 5-min throttle per slug. |
| API routes | `POST /api/telegram-client/folders/sync`, `GET /api/telegram-client/folders`, `DELETE /api/telegram-client/folders/:id` |
| UI | Toggle per slug in groups page: "Sync to TG folder". Status indicator + manual sync. |
| Migration | `tg_group_slugs.sync_to_folder` boolean column |
| Onboarding | Add "Import from TG Folders" step to setup wizard — auto-create slugs from existing folders |

**Also improves:** Onboarding Speed (72 -> 82 = +0.3), because folder sync IS the fastest onboarding path.

**Risk:** MTProto rate limits. Mitigation: batch ops, exponential backoff, max 1 sync per 5 min per slug.

---

## Tier 1: High-Impact Features (Ship Next)

### 1a. QR Code Lead Capture (+1.0 weighted)

**Current:** 20/100 | **Target:** 70/100 | **CRMChat:** 85/100

| Task | Details |
|------|---------|
| QR generator | `lib/qr-generator.ts` — generate QR codes that deep-link to bot DM with pre-filled context (`tg://resolve?domain={bot}&start={payload}`) |
| Tracking | `crm_qr_codes` table: name, payload, bot_id, deal_stage, scan_count, created_by |
| Bot handler | In `bot/handlers/messages.ts`: parse `/start {payload}`, auto-create contact + deal from QR context |
| UI | QR management page or section in settings. Generate, download, print. Scan analytics. |
| Attribution | Tag deals with `source_qr_id` for campaign tracking |

### 1b. Public REST API (+0.4 weighted)

**Current:** 65/100 | **Target:** 80/100 | **CRMChat:** 85/100

API key infrastructure exists. Internal routes handle all CRUD. This is thin wrapper work.

| Task | Details |
|------|---------|
| Migration: `crm_api_keys` | `key_prefix`, `key_hash` (SHA-256), `scopes[]`, `rate_limit`, `last_used_at`, `revoked_at` |
| Auth guard: `requireApiKey()` | Check `Authorization: Bearer sk_live_...`, validate hash, check scopes, enforce rate limit |
| Rate limiter | In-memory sliding window per key prefix (`lib/rate-limiter.ts`) |
| 10 v1 endpoints | `app/api/v1/`: deals (GET/POST/PATCH), contacts (GET/POST/GET:id), groups (GET), broadcasts/send (POST), pipeline/stages (GET) |
| API key management UI | `app/settings/api/page.tsx` — generate, list, revoke. Show full key once. |
| API docs | `app/settings/api/docs/page.tsx` — static listing with curl examples |

### 1c. Chatbot Decision Trees (+0.6 weighted)

**Current:** 65/100 | **Target:** 80/100 | **CRMChat:** 78/100

| Task | Details |
|------|---------|
| Migration: `crm_chatbot_flows` | `bot_id`, `name`, `trigger_keywords[]`, `nodes` (JSONB), `edges`, `is_active`, `fallback_to_ai` |
| Migration: `crm_chatbot_sessions` | `flow_id`, `tg_user_id`, `tg_chat_id`, `current_node_id`, `context` (JSONB), `status` |
| Node types | `chatbot_message`, `chatbot_question` (wait for reply), `chatbot_branch` (keyword/intent), `chatbot_qualify` (AI extraction), `chatbot_handoff`, `chatbot_action` |
| Flow engine | `lib/chatbot-flow-engine.ts` — stateful: check session -> resume, or match keywords -> start. Priority: chatbot flow > workflow trigger > AI agent |
| Builder UI | Extend `app/automations/` or new page. React Flow with chatbot nodes, preview/test. |

### 1d. Task System Hardening (+0.5 weighted)

**Current:** 68/100 | **Target:** 82/100 | **CRMChat:** 85/100

| Task | Details |
|------|---------|
| Migration | Add `priority` (low/medium/high/urgent), `is_recurring`, `recurrence_rule`, `completed_at` to task schema |
| Daily digest enhancement | Include task summaries with overdue highlighting, priority ordering |
| One-click reminders | Bot sends reminder to assigned user via TG DM with TMA deep link |
| Completion metrics | Track completed/total per user, avg completion time. Show in reports. |
| SLA tracking | Configurable response time targets per stage. Alert on breach. |

---

## Tier 2: Score Optimization (75 -> 80+)

### 2a. TMA Polish (78 -> 85 = +0.3 weighted)

| Task | Details |
|------|---------|
| Offline mode | Service worker + IndexedDB cache for last-viewed deals. Show cached data with "Offline" badge. Queue stage changes for sync on reconnect. |
| Gesture support | Swipe-to-change-stage on deal cards. Pull-to-refresh on all pages. Tap-and-hold for quick actions. Haptic feedback. |
| Native TG features | Inline keyboard buttons for quick deal actions. Main button for primary CTA per page. |

### 2b. AI Lead Qualification Completion (58 -> 75 = +0.5 weighted)

| Task | Details |
|------|---------|
| Complete auto-deal creation | Wire `auto_create_deals` config flag to actual deal creation in bot handler. Dedup by telegram_user_id. |
| Scoring threshold | Configurable min qualification score before deal creation |
| BANT extraction | Add budget/authority/need/timeline fields to qualification prompt |
| Routing rules | Auto-assign qualified leads to reps based on board_type + capacity |

### 2c. Campaign Attribution (68 -> 78 = +0.3 weighted)

| Task | Details |
|------|---------|
| Source tagging | Add `source_campaign_id`, `source_type` (broadcast/sequence/qr/organic) to `crm_deals` |
| Attribution models | First-touch and last-touch tracking |
| ROI dashboard | Widget: campaigns -> conversations -> deals -> won -> value |

### 2d. Sequence Consolidation (78 -> 85 = +0.3 weighted)

| Task | Details |
|------|---------|
| Merge /outreach + /drip | Single sequence builder with trigger types (manual enrollment vs event-triggered) |
| Visual builder | React Flow UI for sequence steps with branching visualization |
| Kill /drip route | Redirect to unified sequences page |

---

## Tier 3: Moat Features

| Feature | Current | Target | Impact | Size |
|---------|---------|--------|--------|------|
| Payment tracking (blockchain) | 0 | 70 | Unique differentiator | L |
| Knowledge graph view | 0 | — | Internal tool value | L |
| Multi-workspace | 0 | — | Enables white-label | L |
| Calendar timeline view | 60 | 78 | +0.2 weighted | M |
| Advanced reporting (PDF export) | — | — | Enterprise signal | M |

---

## Architecture Debt (Address Alongside Features)

| Issue | Priority | Impact on Score |
|-------|----------|----------------|
| No pagination on core APIs | P0 | Blocks scale — crashes at 1k+ records |
| Two workflow systems (automations + loop) | P0 | Confuses users, dilutes automation score |
| Two outreach systems (/outreach + /drip) | P0 | Same problem — consolidate in Tier 2d |
| Monolithic components (5 files > 1000 lines) | P1 | Slows feature development |
| No real-time sync (Supabase realtime) | P1 | Users see stale data |
| `window.confirm()` on destructive actions | P1 | Unprofessional UX |
| No error boundaries (except email) | P1 | Single error crashes entire page |

---

## What We Intentionally Skip

| Gap | Weighted Cost | Why Skip |
|-----|--------------|----------|
| 3rd-Party CRM Sync (-216) | 2.1 pts | Months of work for HubSpot/Salesforce. Webhook outbound covers 80%. |
| Voice-to-Data (-150) | 1.5 pts | Low value for text-based BD. CRMChat has it but it's wt=2. |
| Omnichannel (-0) | 0 pts | We already beat CRMChat here (48 vs 30). TG-first by design. |
| Email features | 0 pts | Gmail is good enough. Park it. Every email hour = lost TG score. |

---

## Execution Sequence

**Sprint 1 (Weeks 1-2): Folder Sync + QR + Pagination**
- TG Folder Sync (Tier 0) — highest single impact
- QR Code Lead Capture (Tier 1a) — quick win
- API pagination on core endpoints (debt P0)
- **Target: 73.2**

**Sprint 2 (Weeks 3-4): API + Tasks**
- Public REST API v1 (Tier 1b)
- Task system hardening (Tier 1d)
- Consolidate outreach + drip (Tier 2d)
- **Target: 75.5**

**Sprint 3 (Weeks 5-7): Chatbot + Lead Qual**
- Chatbot decision trees (Tier 1c)
- AI lead qualification completion (Tier 2b)
- Campaign attribution (Tier 2c)
- **Target: 78.0**

**Sprint 4 (Weeks 8-9): TMA + Polish**
- TMA offline + gestures (Tier 2a)
- Onboarding improvement (folder-based)
- Error boundaries + real-time sync
- **Target: 80.5 — #1**

---

## Risk Register

| Risk | Impact | Mitigation |
|------|--------|-----------|
| MTProto folder API rate limits | Folder sync fails at scale | Batch ops, exponential backoff, 5-min throttle per slug |
| Claude latency in chatbot flows | Bot response delay | Stream responses, cache common paths, template fallback |
| API key security | Data breach via leaked keys | Hash at rest, scoped perms, rate limiting, rotation UI |
| Two workflow systems confusing users | Lower automation score | Decide convergence strategy in Sprint 2 |
| Scoring methodology disagreement | Wrong priorities | Re-run weighted scorecard after each sprint |
