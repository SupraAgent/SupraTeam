# Session Log: Stages 3a–4c Implementation

**Date:** 2026-03-27 — 2026-03-28
**Branch:** `claude/crm-review-features-QcDb0`
**PRs:** #32 (North Star doc), #33 (Stages 3a–4b merged)
**Current:** Stage 4c committed, Snob + Sherlock reviews pending fixes

---

## What We Built

### Stage 1 — Intelligence Layer + Slug Access Hardening
- Wired up the intelligence layer across the CRM
- Hardened slug-based access control

### Stage 2 — AI Lead Qualification, Engagement Scoring, Workflow Test Mode
- AI-powered lead qualification via Claude
- Engagement scoring computed from TG activity
- Workflow builder test mode for dry-running automations
- **Sherlock review** caught 4 critical issues → fixed (security, race conditions, reliability)

### Stage 3a — Data Isolation Layer
- Multi-group bot safety: ensures bot operations are scoped per-group
- Prevents cross-group data leakage in bot handlers

### Stage 3b — TMA Deal Gestures
- Swipe actions, pull-to-refresh, haptic feedback, long-press context menus
- **Snob review** found haptic spam, timer leaks, stale closures → all fixed

### Stage 3c — TMA Push Notifications via Bot DMs
- Bot sends DM notifications to users for deal events
- **Snob review** found N+1 queries, quiet hours bug, validation gaps → all fixed

### Stage 3e — Outreach Sequence Branching
- `engagement_score` and `deal_stage` branch conditions
- Step builder UI with condition nodes
- **Snob review** found stale state, step filter bug, concurrency issue → all fixed

### Stage 3f — Broadcast Analytics
- A/B testing support, response tracking, best-send-time optimization
- Broadcast history dashboard with delivery/open metrics
- **Snob review** found response tracking gaps, query limits → all fixed

### Stage 4a — Bot Drip Sequences
- Event-triggered automated messaging (group_join, first_message, keyword_match, silence_48h, engagement_drop)
- `drip-triggers.ts` — Grammy handler that auto-enrolls users into active drip sequences with 60s cache
- `drip-worker.ts` — Poll-based worker (60s interval), processes message/condition/wait steps
- `increment_drip_enrollment_reply` RPC for atomic reply tracking
- Drip reply tracking wired into `messages.ts` handler
- API routes: `api/drip/sequences/route.ts`, `api/drip/steps/route.ts`
- Full UI: trigger selector, step builder, enrollment stats
- **Snob review** found: missing reply tracking (B1), sequential queries (B2), cache stale-when-empty (B3), first_message race condition (W1), missing try/catch on request.json (W2), shared mutable default steps (W3), console.log in outreach-worker (N1) → all fixed

### Stage 4b — Unified Inbox
- `api/inbox/route.ts` — fetches 500 recent messages across all CRM-linked TG groups
- Thread detection via `reply_to_message_id`, orphan reply handling
- `app/inbox/page.tsx` — split-pane UI (conversation list + message detail)
- Supabase realtime subscription on `tg_group_messages` INSERT events
- Expandable reply threads, search, linked deals in conversation header
- Deep links to Telegram messages

### Stage 4c — Shareable Pipeline URLs + Forecast Analytics
- **URL filter persistence:** `useSearchParams` + `router.replace()` for shareable pipeline links
- All filter state (board, search, minValue, maxValue, probability, assignedTo, staleDays, outcome) synced bidirectionally with URL
- `SavedViewsBar` integrates with URL sync
- **Forecast API** (`api/forecast/route.ts`):
  - Monthly revenue forecast (weighted by probability, grouped by expected_close_date)
  - Stage velocity (avg days per stage from 90-day history)
  - Forecast confidence (% closed within 7 days of expected_close_date)
  - Weekly pipeline trend (12-week created/won/lost)
- **ForecastSection** in reports page: 4 KPI cards, monthly forecast bars, stage velocity bars (color-coded), weekly trend stacked bars

---

## Review Process

Every stage follows the same cycle:
1. **Implement** — build the feature
2. **Build check** — `npm run build` + `npx tsc --noEmit`
3. **Snob review** — brutal pedantic code reviewer persona, finds bugs/warnings/nits
4. **Fix all findings** — address every B (bug), W (warning), and relevant N (note)
5. **Rebuild + commit + push**
6. **Sherlock review** (periodic) — detective-style deep investigation, traces data flows, finds hidden issues

### Snob Review Style
Rates findings as B (bug), W (warning), N (note). Every B and W must be fixed before commit. Looks for: race conditions, stale closures, N+1 queries, missing validation, shared mutable state, O(n^2) operations, type coercion bugs.

### Sherlock Review Style
Rates findings as Critical/High/Medium/Low. Focuses on: data flow integrity (DB → API → UI type consistency), security (auth bypass, injection), logic errors (off-by-one, wrong comparisons), performance (unnecessary re-renders, missing memoization).

---

## Outstanding: Snob + Sherlock Findings (4b + 4c)

These were identified but **not yet fixed**. This is where to pick up.

### From Snob Review (4b + 4c)

| ID | Sev | File | Issue |
|----|-----|------|-------|
| B1 | Bug | `api/inbox/route.ts:107` | O(n) orphan-root lookup — use a `Set<number>` |
| B2 | Bug-ish | `api/inbox/route.ts:117` | Reply sort relies on accidental descending order — use explicit latest |
| B3 | **Bug** | `api/inbox/route.ts:48,81` | `telegram_group_id` (string) vs `telegram_chat_id` (number) — Map.get fails type coercion |
| W1 | Warn | `reports/page.tsx:476` | Fetch response not checked before `.json()` |
| W2 | Warn | `reports/page.tsx:589` | `max` recomputed inside every `.map()` iteration — O(n^2) |
| W3 | Warn | `pipeline/page.tsx:152-165` | `setFiltersAndSync` etc. capture stale closure values |
| W4 | Warn | `api/forecast/route.ts` | 5 sequential Supabase queries — should be `Promise.all` |

### From Sherlock Review (4b + 4c)

| # | Sev | File | Issue |
|---|-----|------|-------|
| 3 | **BLOCKER** | `api/inbox/route.ts:49` | `chat_id` filter bypasses group membership — can read arbitrary chats |
| 1 | High | `api/inbox/route.ts:116` | Orphan thread sort picks wrong "latest" timestamp |
| 7 | High | `api/forecast/route.ts:131` | ISO week calculation wrong near year boundaries |
| 5 | Medium | `inbox/page.tsx:94` | No debounce on realtime refetch |
| 6 | Medium | `reports/page.tsx:475` | Fetch errors swallowed; error JSON parsed as data |
| 9 | Medium | `api/forecast/route.ts:60` | First pipeline stage excluded from velocity |
| 10 | Medium | `pipeline/page.tsx:103` | One-shot URL sync ignores browser back/forward |
| 4 | Medium | `api/inbox/route.ts:50` | NaN from non-numeric `chat_id` not handled |
| 8 | Low | `reports/page.tsx:589` | O(n^2) max recomputation in weekly trend |

### Deduplicated Fix List

After merging overlapping findings from both reviews:

1. **BLOCKER: Inbox `chat_id` auth bypass** — validate `chatIdFilter` against `groupMap` + reject NaN
2. **Bug: `groupMap` type mismatch** — `telegram_group_id` string vs number key in Map
3. **Bug: Thread sort** — compute explicit `latestTime()` from root + all replies
4. **Bug: ISO week calc** — replace homebrew with proper ISO 8601
5. **Warn: Forecast sequential queries** — `Promise.all` the 5 independent fetches
6. **Warn: Forecast fetch error handling** — check `r.ok` before `.json()`
7. **Warn: Weekly trend O(n^2)** — hoist `max` outside `.map()`
8. **Warn: Pipeline URL sync stale closures** — use `useEffect` for bidirectional sync
9. **Warn: Realtime debounce** — debounce `fetchInbox` on INSERT events
10. **Medium: First-stage velocity exclusion** — join `crm_deals.created_at` for first entry time

---

## Files Changed (Key Files)

### Bot
| File | What |
|------|------|
| `bot/index.ts` | Entry point — added drip trigger + worker imports |
| `bot/handlers/drip-triggers.ts` | Event trigger handler for drip auto-enrollment |
| `bot/handlers/messages.ts` | Added drip reply tracking |
| `bot/drip-worker.ts` | Poll-based worker for drip step execution |
| `bot/outreach-worker.ts` | console.log → console.warn fix |

### API Routes
| File | What |
|------|------|
| `app/api/drip/sequences/route.ts` | CRUD for drip sequences |
| `app/api/drip/steps/route.ts` | Drip step management |
| `app/api/inbox/route.ts` | Unified inbox with thread detection |
| `app/api/forecast/route.ts` | Forecast analytics (revenue, velocity, confidence, trend) |

### Pages
| File | What |
|------|------|
| `app/drip/page.tsx` | Drip sequence builder UI |
| `app/inbox/page.tsx` | Unified inbox with realtime + threads |
| `app/pipeline/page.tsx` | URL filter persistence |
| `app/reports/page.tsx` | ForecastSection added |

### Navigation
| File | What |
|------|------|
| `app/_components/shell/desktop-sidebar.tsx` | Added Drip + Inbox nav items |
| `app/_components/shell/mobile-header.tsx` | Added Drip + Inbox nav items |

### Migrations
| File | What |
|------|------|
| `supabase/migrations/052_drip_sequences.sql` | Drip tables + `increment_drip_enrollment_reply` RPC |

### Fixes
| File | What |
|------|------|
| `lib/workflow-engine.ts` | Removed pre-existing `dryRun` build error |

---

## Roadmap Position

Per `strategic-roadmap.md`, we've completed:

| Priority | Feature | Status |
|----------|---------|--------|
| P1 | Bot drip sequences | **Done** (Stage 4a) |
| P1 | Unified inbox across bots | **Done** (Stage 4b) |
| P1 | Saved views + custom dashboards | **Done** (Stage 4c — URL persistence + saved views) |
| P0 | Outreach sequence branching | **Done** (Stage 3e) |

### What's Next (from strategic roadmap)

| Priority | Feature | Notes |
|----------|---------|-------|
| **Next** | Fix Snob + Sherlock findings for 4b/4c | 10 deduplicated issues, 1 blocker |
| P0 | TG conversation timeline in deal detail | The #1 differentiator — show TG messages inline with CRM data |
| P0 | Full TMA (tasks, AI chat, broadcasts) | Expand mini-app beyond gestures |
| P1 | Auto-assignment rules | Round-robin, by tag, by board |
| P1 | Contact engagement scoring from TG activity | Passive intelligence from message patterns |
| P2 | Payment tracking integration | On-chain USDT/USDC → auto-close deals |
| P2 | AI chatbot flows (decision trees) | Beyond Q&A — configurable per-group bots |
| P2 | Public REST API + API keys | Foundation for Zapier/Make integrations |

---

## How to Resume

```bash
git checkout claude/crm-review-features-QcDb0
# Branch is rebased on main, Stage 4c is the tip commit

# Step 1: Fix all 10 deduplicated Snob + Sherlock findings
# Step 2: npm run build && npx tsc --noEmit
# Step 3: Commit + push
# Step 4: Continue to next roadmap item (TG conversation timeline or full TMA)
```

The review findings are fully documented above with file:line references and recommended fixes. The blocker (inbox `chat_id` auth bypass) should be fixed first.
