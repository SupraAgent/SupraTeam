# Merge Plan: 8 Feature Branches to Main

**Date:** 2026-04-07
**Reviewed by:** Sarah Chen (CPO), Claude (Technical Analysis)
**Strategic lens:** "The CRM that lives inside Telegram" -- prioritize what moves crypto-BD agent scores up.

---

## Executive Summary

8 branches are pending merge. We recommend merging **6 in 3 waves**, **deferring 2**. The merge order is driven by:

1. Closing the two lowest crypto-BD agent scores: **Calendar (58)** and **Contacts (68)**
2. Protecting what already works: **Telegram (88)** and **Pipeline (85)**
3. Minimizing conflict risk on the 7 hotspot files touched by multiple branches

---

## Branch Inventory

| # | Branch | PR | Behind | Ahead | Files | Category |
|---|--------|-----|--------|-------|-------|----------|
| 1 | `list-agent-numbers-2Xsta` | #185 | 11 | 51 | 18 | P0: Deal-TG linking, enrichment, calendar |
| 2 | `crypto-bd-agent-feedback-PmyTj` | #194 | 3 | 10 | 13 | Dashboard, onboarding, SLA, bulk actions |
| 3 | `polish-telegram-crm-6z4wn` | #193 | 4 | 4 | 12 | TG cleanup, hook extraction, TMA fixes |
| 4 | `desktop-crm-messaging-kVeQ7` | #192 | 6 | 5 | 37 | **DEFER** -- Tauri desktop app |
| 5 | `telegram-crm-features-hxUzb` | #191 | 6 | 2 | 18 | Inbox polish, seen tracking, keyboard nav |
| 6 | `noob-bd-persona-fGuDS` | none | 2 | 5 | 34 | **DEFER** -- Second persona, scattered features |
| 7 | `crypto-bd-app-review-3gRXP` | #190 | 7 | 2 | 7 | Calendar write, TG outreach routing |
| 8 | `refactor-settings-location-B2vcH` | #189 | 9 | 2 | 10 | Inline settings refactor |

---

## Conflict Hotspots

These files are touched by 3-4 branches and require careful resolution:

| File | Branches | Resolution Strategy |
|------|----------|-------------------|
| `pipeline/page.tsx` | 4 branches | Branch 1 data model -> Branch 5 UI -> Branch 8 inline settings |
| `deal-detail-panel.tsx` | 4 branches | Branch 1 base + Branch 2 protocol snapshot additive |
| `page.tsx` (dashboard) | 3 branches | Branch 2 wins (action cards + onboarding) |
| `tma/page.tsx` | 3 branches | Branch 3 cleanup first -> Branch 5 features |
| `conversation-timeline.tsx` | 3 branches | Branch 1 base + Branch 2 SLA badges |
| `inbox/page.tsx` | 3 branches | Branch 5 -> Branch 2 -> Branch 8 (layered) |
| `contact-detail-panel.tsx` | 3 branches | Branch 1 enrichment + Branch 7 conversations |

---

## Wave 1: Foundation (Close the scoring gaps)

**Goal:** Address Calendar (58) and Contacts (68), establish deal-TG linking.

### Step 1: Merge `polish-telegram-crm-6z4wn` (PR #193)
- **Risk:** LOW (4 commits, 12 files, mostly cleanup)
- **Why first:** Cleans up TMA dead links, extracts reusable hooks, fixes turbopack config. Creates a clean merge base before the big branches land.
- **Effort:** ~1 hour

### Step 2: Merge `list-agent-numbers-2Xsta` (PR #185)
- **Risk:** HIGH (51 commits, 18 files, already resolved 13 conflicts)
- **Why second:** This is the P0 branch. Deal-TG conversation linking (junction table + API), cross-conversation message search, multi-account TG support, contact enrichment pipeline with AI, crypto profile UI, calendar improvements. Addresses 60% of the crypto-BD agent's wishlist.
- **Pre-merge:** Dry-run `git merge --no-commit --no-ff` to count conflicts. If >5 files conflict, rebase first.
- **Post-merge:** `npx tsc --noEmit` immediately.
- **This branch WINS** all conflicts on: deal-detail-panel, contact-detail-panel, conversation-timeline, calendar page, contacts page.
- **Note:** This branch removes chatbot flow builder, voice transcription, and conversations intelligence page. Verify no other branches depend on removed files.
- **Effort:** 4-6 hours including conflict resolution

### Step 3: Merge `crypto-bd-app-review-3gRXP` (PR #190)
- **Risk:** LOW (2 commits, 7 files)
- **Why third:** Adds schedule-call-modal (Calendar 58 -> higher) and contact conversations API. Stacks on Branch 1's calendar work.
- **Effort:** 1-2 hours

### Stabilization Gate 1
- `npm run build` must pass
- `npx tsc --noEmit` must pass
- **Manual test 3 core workflows:**
  1. TG message -> qualify -> create deal -> assign stage -> schedule follow-up
  2. Deal in pipeline -> check TG conversation -> reply from CRM -> move stage
  3. Verify contact enrichment and crypto profile UI renders

---

## Wave 2: Daily Driver (Make inbox and pipeline addictive)

**Goal:** Polish the features BD reps use every hour.

### Step 4: Merge `telegram-crm-features-hxUzb` (PR #191)
- **Risk:** MEDIUM (2 commits, 18 files)
- **Why:** Inbox seen tracking, keyboard nav, filtering, deal-chat linking UI, TMA improvements. Protects the 88 TG score and pushes TMA toward 85.
- **Conflict note:** `pipeline/page.tsx` and `inbox/page.tsx` will conflict with Wave 1. Branch 1's data model wins; Branch 5's UI additions (seen badges, keyboard handlers) get manually ported on top.
- **Effort:** 2-3 hours

### Step 5: Merge `crypto-bd-agent-feedback-PmyTj` (PR #194)
- **Risk:** MEDIUM (10 commits, 13 files)
- **Why:** Dashboard inline action cards, onboarding wizard, inbox bulk actions, response SLA badges, reply+advance pipeline, protocol snapshot card. Addresses crypto-BD agent's "needs urgency layer" feedback (Dashboard score 72).
- **Conflict note:** `inbox/page.tsx` just modified by Branch 5 -- careful merge. `deal-detail-panel` already has Branch 1's version; protocol snapshot card is additive.
- **Effort:** 3-4 hours

### Stabilization Gate 2
- `npm run build` must pass
- `npx tsc --noEmit` must pass
- **Test:** Inbox bulk actions, keyboard nav, SLA badges, reply+advance flow, dashboard action cards

---

## Wave 3: Infrastructure (Only after core is solid)

### Step 6: Merge `refactor-settings-location-B2vcH` (PR #189)
- **Risk:** MEDIUM (2 commits, 10 files, 9 behind main)
- **Why:** Inline settings is a UX improvement -- stage editor slide-over, canned responses in inbox. Not critical for scoring gaps but reduces settings page bloat.
- **Conflict note:** `pipeline/page.tsx` and `inbox/page.tsx` are the most-merged files at this point. Budget extra time for conflict resolution. Manually verify inline settings work against post-Wave-2 state.
- **Effort:** 2-3 hours

### Stabilization Gate 3
- `npm run build` + `npx tsc --noEmit`
- Full regression walkthrough

---

## Deferred Branches

### DEFER: `desktop-crm-messaging-kVeQ7` (PR #192)
**Reason:** The crypto-BD agent never asked for a desktop app. "Phone-first (TMA during meetings), desktop for complex pipeline reviews" means a browser tab. A Tauri desktop app with FTS5 caching and native notifications is impressive engineering but does not move any score on the crypto-BD scorecard. The 37 files (mostly new in `desktop/`) are low-conflict, but overlaps on `app-shell.tsx`, `pipeline/page.tsx`, and `kanban-board.tsx` create risk on hotspot files.

**Recommendation:** Defer to P2. If desktop presence is needed sooner, a PWA with service worker gives 80% of the value at 20% of the cost.

### DEFER: `noob-bd-persona-fGuDS` (no PR)
**Reason:** This branch adds 10 features across 34 files in 4 different product areas -- email urgency, per-rep SLA, TMA team view, email templates, milestone fields, BD automation library, manager activity feed, calendar meeting-to-deal linking, plus a second user persona. That's 20% improvement in each area instead of 80% improvement in one.

**Recommendation:** Cherry-pick the meeting-to-deal linking logic if Branch 1's implementation is incomplete. Defer everything else until the crypto-BD agent is fully won.

---

## Execution Timeline

| Day | Action | Effort |
|-----|--------|--------|
| Day 1 | Merge #3 (polish-telegram) + Merge #1 (list-agent-numbers) | 5-7 hours |
| Day 2 | Merge #7 (crypto-bd-review) + Stabilization Gate 1 | 3-5 hours |
| Day 3 | Merge #5 (telegram-crm-features) + Merge #2 (crypto-bd-feedback) | 5-7 hours |
| Day 4 | Stabilization Gate 2 + Merge #8 (refactor-settings) + Gate 3 | 4-6 hours |

**Total:** 3-4 days of focused integration work. Do not compress into one day.

---

## Risk Mitigation Checklist

- [ ] Dry-run merge Branch 1 before committing (`git merge --no-commit --no-ff`)
- [ ] Grep for imports of removed files (chatbot flow builder, voice transcription, conversations intelligence) across all branch tips
- [ ] Freeze `pipeline/page.tsx` structure after Wave 1 -- subsequent branches rebase onto Wave 1 version
- [ ] Run `npx tsc --noEmit` after every individual merge
- [ ] Run `npm run build` after every wave
- [ ] Test TMA in actual Telegram on mobile after Wave 2 (browser misses WebApp SDK issues)
- [ ] Re-score with crypto-BD agent after Wave 2 to validate score improvements
