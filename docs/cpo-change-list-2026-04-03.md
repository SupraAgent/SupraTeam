# CPO Change List — SupraCRM

**Date:** 2026-04-03 | **Score:** 69.5/100 | **Supersedes:** `cpo-change-list-2026-03-28.md`

**Priority Framework:** P0 = blocks score improvement or scale. P1 = ship within 2 sprints. P2 = backlog.

---

## P0: CRITICAL (Blocks Scoring or Scale)

| # | Issue | Why It's P0 | Effort |
|---|-------|-------------|--------|
| 1 | **TG Folder Sync not implemented** | Single largest competitive gap (-300 weighted). MTProto client exists but folder API not wired. Worth +2.3 score points alone. | M |
| 2 | **No pagination on core API endpoints** | Contacts, deals, groups load entire DB. Crashes at 1k+ records. Blocks scale. | M |
| 3 | **Two workflow systems coexist** | Automations (React Flow, 20 triggers) + Loop Builder (AI-heavy). Confuses users, dilutes automation score (80/100 should be 90+). Decide: converge or differentiate. | Decision |
| 4 | **Two outreach systems coexist** | `/outreach` + `/drip` are nearly identical. Consolidate into one sequence builder with trigger types. | M |
| 5 | **Public API has keys but no endpoints** | API key management shipped but zero v1 routes. Score: 65/100 on API/Zapier (wt=3). Need 10 thin wrapper endpoints. | M |
| 6 | **No QR code lead capture** | Score: 20/100 (wt=2). CRMChat scores 85. Small feature, high signal. Generate trackable QR -> bot DM -> auto-create contact + deal. | S |

---

## P1: IMPORTANT (Ship Within 2 Sprints)

| # | Issue | Impact | Effort |
|---|-------|--------|--------|
| 7 | **Task system is thin** | 68/100 vs CRMChat 85. No priority levels, no recurring tasks, no SLA tracking, no completion metrics. Users feel this daily. | M |
| 8 | **AI chatbot has no decision trees** | 65/100 vs CRMChat 78. Free-form Claude only. Need structured flows: keyword trigger -> branch -> qualify -> handoff. | L |
| 9 | **Auto-deal creation from AI qualification incomplete** | Config flag exists, extraction works, but actual deal creation not wired. Biggest gap in AI Lead Qual (58/100). | S |
| 10 | **TMA missing offline + gestures** | 78/100 vs CRMChat 92. No offline cache, no swipe-to-change-stage, no native TG keyboard integration. | M |
| 11 | **No campaign attribution** | Can't trace broadcast -> deal -> revenue. Blocks campaign analytics (68/100). Add `source_campaign_id` to deals. | M |
| 12 | **No error boundaries on CRM pages** | One API error crashes entire page. Only email has error boundaries. | S |
| 13 | **`window.confirm()` on destructive actions** | Bulk delete, broadcast to 5k people use browser native confirm. Not themeable, easy to fat-finger. | S |
| 14 | **No real-time sync** | Supabase realtime not wired. Changes invisible until refresh. 2-min polling fallback only. | L |

---

## P2: BACKLOG

| # | Issue | Notes | Effort |
|---|-------|-------|--------|
| 15 | Monolithic page components | Broadcasts (1648 lines), inbox (1536), groups (1397). Extract hooks, split panels. | XL |
| 16 | No body validation on POST/PATCH routes | Arbitrary JSON accepted. Add Zod validation. | M |
| 17 | Missing loading states | No skeleton screens on most pages. Deal detail fires 8 parallel API calls with one loader. | M |
| 18 | Poor empty states | Zero contacts shows nothing. `components/ui/empty-state.tsx` exists but underused. | S |
| 19 | No keyboard shortcuts across CRM | Email has shortcuts; CRM only has global command palette. | M |
| 20 | Quality scoring client-calculated | Recalculates every page load, not persistent server-side. | M |
| 21 | Custom field validation missing | Text in number fields, invalid dates accepted. | M |
| 22 | No workflow versioning | Edit = old version gone forever. | M |
| 23 | No undo/redo for CRM actions | Email has undo-send; CRM has nothing for deal moves, deletes. | L |

---

## Resolved Since March 28

These items from the previous change list have been addressed:

| Issue | Resolution |
|-------|-----------|
| Rate limiting on auth endpoints | Security hardening pass (multiple commits March-April) |
| Email error boundary | Implemented |
| Encryption key versioning | Shipped with key rotation support |
| Zero-knowledge TG sessions | Shipped with device-bound encryption |
| HMAC password hashing | Shipped |
| BroadcastChannel scoping | Fixed in security audit |

---

## Architecture Debt Summary

| Category | Severity | Scope |
|----------|----------|-------|
| Two workflow systems | Critical | Converge or clearly differentiate |
| Two outreach systems | Critical | Consolidate into one |
| No pagination | Critical | All core endpoints |
| Monolithic components | High | 5 files > 1000 lines |
| No real-time sync | High | All pages lack Supabase realtime |
| Missing body validation | Medium | All POST/PATCH routes |

---

## Strategic Note

**Stop building email features.** Gmail integration is good enough (75/100). Every hour spent on email improvements has zero impact on the Telegram CRM competitive score. The single highest-ROI action is TG Folder Sync (+2.3 weighted points). That's worth more than the next 3 features combined.
