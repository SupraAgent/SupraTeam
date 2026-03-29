# CPO Change List -- SupraCRM

**Date:** 2026-03-28
**Priority Framework:** P0 = ship this week, P1 = next 2 weeks, P2 = month 2, P3 = backlog

---

## P0: CRITICAL (Ship this week)

| # | Issue | Files | Effort | Impact |
|---|-------|-------|--------|--------|
| 1 | **No pagination on core API endpoints** -- contacts, deals, groups, broadcasts all load entire DB into memory. Crashes at 1k+ records. | `app/api/contacts/route.ts`, `app/api/deals/route.ts`, `app/api/groups/route.ts` | M | Critical |
| 2 | **No CSV import for contacts** -- only export exists. Can't bulk-import. Manual entry doesn't scale. Every competitor has this. | Missing entirely | L | Critical |
| 3 | **Monolithic page components** -- broadcasts (1648 lines, 100+ useState), inbox (1536), groups (1397), automations/[id] (1125), pipeline (730). Impossible to test or modify safely. | `app/broadcasts/page.tsx`, `app/inbox/page.tsx`, `app/groups/page.tsx`, `app/automations/[id]/page.tsx` | XL | Critical |
| 4 | **No error boundaries on critical pages** -- one API error crashes entire page. Only email has an error boundary. | All pages except email | M | High |
| 5 | **Browser-native confirm() on destructive actions** -- bulk delete, broadcast to 5k people, archive groups all use `window.confirm()`. Not themeable, easy to fat-finger. | `app/contacts/page.tsx:170`, `app/broadcasts/page.tsx`, `app/groups/page.tsx` | S | High |
| 6 | **No rate limiting on auth endpoints** -- verification codes, OTP checks, auth attempts have zero throttling. Brute-forceable. | `app/api/login*`, `app/api/auth/callback/*`, `app/api/telegram-client/verify-code/route.ts` | M | Critical |

---

## P1: IMPORTANT (Ship next 2 weeks)

| # | Issue | Files | Effort | Impact |
|---|-------|-------|--------|--------|
| 7 | **Missing loading states on async operations** -- broadcast sending shows "Sending..." but no progress bar. Deal detail fires 8 parallel API calls with one generic loader. No skeleton screens. | Multiple pages | M | Medium |
| 8 | **Poor empty states** -- zero contacts shows nothing (no "Add your first contact" CTA). Same for groups, pipeline, broadcasts. `components/ui/empty-state.tsx` exists but underused. | All list pages | S | Medium |
| 9 | **Saved filters limited** -- only saves lifecycle + stage + 3 checkboxes. Can't save "Has Email + Has Deals + Company = X". Competitors offer unlimited saved views. | `app/contacts/page.tsx:441-452` | L | High |
| 10 | **No real-time sync** -- if Jon moves a deal to Won, your board doesn't update until refresh. Broadcasts sent by teammates invisible until manual reload. 2-min polling fallback only. | All pages (no Supabase realtime wired) | L | Medium |
| 11 | **No undo/redo for CRM actions** -- email has undo-send (`components/email/undo-send-bar.tsx`), CRM has nothing. Delete wrong deal? Move 50 deals to wrong stage? No recovery. | Missing entirely for CRM | L | Medium |
| 12 | **No keyboard shortcuts across CRM** -- email has keyboard help modal, CRM only has global command palette. No `n`=new, `e`=export, `j/k`=navigate, `?`=help. | `app/email/page.tsx:37` has shortcuts; CRM pages don't | M | Medium |
| 13 | **Accessibility gaps** -- only 68 aria mentions in entire codebase. Missing aria-labels, semantic roles, focus management. Screen readers can't navigate. | Most interactive components | M | Medium |
| 14 | **Mobile responsiveness incomplete** -- kanban columns squish on tablets, deal detail panel doesn't adapt, broadcast multi-select unusable on phone. Email pages responsive, CRM pages not. | `app/pipeline/page.tsx`, `app/broadcasts/page.tsx` | M | Medium |
| 15 | **Integration health checks incomplete** -- Slack shows "connected" but no channel count or last sync. Email shows "Gmail connected" but doesn't verify token expiry. Webhooks page stubs features. | `app/settings/integrations/page.tsx:85-102` | S | Medium |

---

## P2: IMPORTANT BUT NOT URGENT (Month 2)

| # | Issue | Files | Effort | Impact |
|---|-------|-------|--------|--------|
| 16 | **Deal forecasting/reporting missing** -- reports page is read-only stats. No probability-weighted pipeline forecast, no win/loss trends, no team leaderboard. CRM without forecasting is incomplete. | `app/reports/page.tsx` | XL | High |
| 17 | **Timeline/Gantt view missing** -- only Kanban and List views. No visual timeline by close date. Salesforce and Pipedrive have this. | Missing | L | Medium |
| 18 | **Calendar view stubbed** -- page exists (50 lines) but non-functional. Should show deal close dates, reminders, scheduled broadcasts. | `app/calendar/page.tsx` | M | Medium |
| 19 | **Prop drilling in detail panels** -- DealDetailPanel and GroupDetailPanel both 750+ lines, receive 15+ props each. 8 parallel API calls on mount with no shared loader. | `components/pipeline/deal-detail-panel.tsx`, `components/groups/group-detail-panel.tsx` | M | Medium |
| 20 | **API routes lack body validation** -- POST/PATCH bodies not validated (arbitrary JSON accepted). No CSRF protection. No request size limits. | All POST/PATCH routes | M | Medium |
| 21 | **N+1 queries in deal detail** -- loads deal, then fetches stages, notes, activity, docs, fields, custom values, sentiment, summary separately (8 calls). Should batch. | `components/pipeline/deal-detail-panel.tsx:125-134` | S | Low |
| 22 | **No idempotency on broadcast sending** -- clicking send twice sends the broadcast twice. Only UI debouncing, no backend idempotency key. | `app/broadcasts/page.tsx:350+` | S | Low |

---

## P3: POLISH & BACKLOG

| # | Issue | Effort | Impact |
|---|-------|--------|--------|
| 23 | Quality scoring client-calculated (not persistent, recalculates every page load) | M | Low |
| 24 | Custom field validation missing (text in number fields, invalid dates accepted) | M | Low |
| 25 | Broadcast template system incomplete (no save custom, no versioning) | L | Low |
| 26 | Group auto-archive configured but no UI to set rules | M | Low |
| 27 | Workflow version control missing (edit = old version gone forever) | M | Low |
| 28 | No bulk export for reports (view-only, can't get data into Excel) | S | Low |

---

## Architecture Debt Summary

| Category | Severity | Scope | Action |
|----------|----------|-------|--------|
| Monolithic components | Critical | 6k+ lines across 5 files | Extract state into custom hooks, split panels |
| Prop drilling | High | 1.5k+ lines in detail panels | Use React Context, split sub-components |
| Missing pagination | Critical | All core endpoints | Add limit/offset, implement infinite scroll |
| State management | High | 621 useState calls across pages | Consolidate into useReducer + Context |
| Error handling | High | All pages except email | Add error boundaries |
| Zero tests | Critical | 0 test files | Add Jest + RTL (lower priority for internal tool) |

---

## Security Checklist

| Issue | Severity | Status |
|-------|----------|--------|
| Rate limiting on auth endpoints | Critical | **Missing** |
| CSRF protection | Medium | Not implemented (Supabase cookies help but not explicit) |
| API body validation (Zod) | Medium | **Missing** |
| Request size limits | Medium | **Missing** |
| SQL injection (parameterized) | Low | OK (Supabase handles) |
| Secrets in env | Low | OK (no hardcoded) |
| Token encryption | Low | OK (AES-256-GCM) |

---

## Two Workflow Systems -- Strategic Decision Required

**Problem:** Two production-quality visual workflow builders exist in parallel:
- **Automations** (`app/automations/`) -- React Flow, 20 triggers x 20 actions, template library
- **Loop Builder** (`packages/supra-loop-builder/`) -- streaming LLM, cost tracking, onboarding tour

**Options:**
1. **Converge** -- merge Loop Builder's AI features into Automations. Single system.
2. **Differentiate** -- Automations = rule-based flows. Loop Builder = AI-heavy flows. Clear UI separation.
3. **Deprecate one** -- pick a winner, sunset the other.

**Recommendation:** Option 2 (differentiate) is fastest. Rename Loop Builder to "AI Flows" and keep Automations as "Rules". Add a single entry point that routes users to the right tool.

---

## Recommended Execution Order

**Week 1:**
1. Pagination on contacts + deals endpoints (unblocks scale)
2. Rate limiting on auth (security)
3. Confirmation dialog component (replace all `window.confirm`)
4. Error boundaries on 5 critical pages

**Week 2:**
5. CSV import for contacts
6. Loading skeletons + empty states
7. Begin component extraction (broadcasts → hooks first)

**Week 3-4:**
8. Saved filters system
9. Real-time sync (Supabase subscriptions)
10. Keyboard shortcuts

**Month 2:**
11. Deal forecasting dashboard
12. Calendar view completion
13. Undo/redo system
14. Mobile polish pass
