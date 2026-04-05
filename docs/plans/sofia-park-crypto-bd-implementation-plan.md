# Sofia Park — Crypto-BD Agent Implementation Plan

> **Reviewer:** Sofia Park, CPO (GroupFlow)
> **Date:** 2026-04-05
> **Primary User:** crypto-BD agent (slug: `crypto-bd`)
> **Focus:** Main products and functions the crypto-BD agent needs to close protocol partnerships faster via Telegram

---

## Executive Summary

The TMA foundation is solid -- offline-first with IndexedDB, proper WebApp SDK integration (`ready()`, `BackButton`, `MainButton`, `HapticFeedback`, `themeParams`), pull-to-refresh, swipeable deal cards. But the TMA is still a read-mostly surface. The crypto-BD agent cannot complete their morning workflow without opening a desktop browser for calendar, contacts-to-deal navigation, or meeting scheduling. Below is every change needed to turn the TMA from "impressive demo" to "daily driver," organized by priority.

---

## Crypto-BD Agent Daily Loop (What We Build For)

1. Check TG unreads from protocol founders/partners
2. Qualify inbound leads (protocol TVL, chain deployments, token status)
3. Update deals in pipeline (move stages, update values)
4. Reply to partners via TG (DMs and groups)
5. Schedule partnership calls (send Calendly links via TG)
6. Broadcast to partner group segments (slug-tagged)
7. Review group health (which partnership groups are dying?)
8. Triage ALL of the above from phone between calls (TMA)

---

## PRIORITY 1: TMA as Daily Driver (TMA 80 -> 88)

The crypto-BD agent does 80% of their work from their phone. Every missing action on TMA is a reason to open a laptop.

### 1A. TMA Deal Detail: "Schedule Meeting" Action

**The gap:** `app/tma/deals/[id]/page.tsx` has a `BookingLinkButton` component (line 213) but it only generates a Calendly link and copies it to clipboard. There is no flow to send that link directly via Telegram to the deal contact, and no auto-linking of the resulting meeting back to the deal.

**What to build:**
- **File:** `app/tma/deals/[id]/page.tsx` -- Add a "Send Booking Link via TG" button next to the existing `BookingLinkButton`. When tapped: generate the Calendly link, then POST to `/api/inbox/reply` with the contact's `tg_chat_id` and a templated message ("Hi {name}, here is a link to schedule our call: {url}"). Use `hapticNotification("success")` on send.
- **File:** `components/calendly/booking-link-button.tsx` -- Add an `onSendViaTelegram` callback prop that passes the generated URL back to the parent. Currently `onLinkGenerated` exists (line 21) but is only used for clipboard copy.
- **File:** `app/api/calendly/booking-link/route.ts` -- Add optional `deal_id` to the response so the frontend can auto-link the meeting when the calendar event is created.
- **New API:** `app/api/calendar/link-deal/route.ts` -- POST endpoint that takes `{ event_id, deal_id }` and writes to a new `crm_calendar_event_deals` junction table. This is the meeting-to-deal link the crypto-BD agent needs.

**Why:** Daily loop step 5 (schedule partnership calls). Today: generate link -> copy -> switch to TG -> paste -> switch back = 3 context switches per meeting. This makes it one tap.

**Effort:** M (3-4 days)

### 1B. TMA Inbox: Quick Reply with Context

**The gap:** `app/tma/inbox/page.tsx` has inline reply (lines 316-334) -- good. But there is no message history visible inline. The user sees only the latest message preview (line 251) and must navigate away to see context.

**What to build:**
- **File:** `app/tma/inbox/page.tsx` -- Add an expandable message history section. When the user taps "Reply," show the last 3-5 messages from that conversation below the preview, before the reply input. Fetch from `/api/inbox?chat_id={id}&limit=5` on expand. Use a slide-down animation.
- **File:** `app/tma/inbox/page.tsx` -- Add "Send as Client" option next to "Reply" (currently bot-only, line 133: `send_as: "bot"`). The crypto-BD agent often needs to reply as themselves, not the bot.

**Why:** Daily loop step 4 (reply to partners via TG). Replying without context means opening the full TG chat. Every time the user leaves the TMA to check context, they lose the CRM workflow.

**Effort:** S (1-2 days)

### 1C. TMA Home: Today's Meetings Widget

**The gap:** `app/tma/page.tsx` shows deals, stale alerts, and group health -- but zero calendar information. The crypto-BD agent's day is structured around meetings.

**What to build:**
- **File:** `app/tma/page.tsx` -- Add a "Today's Calls" section between "Needs Attention" and "Group Health" (between lines 211 and 214). Fetch from `/api/calendar/google/events?from={today_start}&to={today_end}`. Show each event as: time (in user's TZ), title, linked deal (if any), and a "Join" button if `hangout_link` exists.
- **File:** `app/tma/page.tsx` -- The `Stats` type (line 22) needs a `meetings` field. Add `meetings: { id: string; summary: string; start_at: string; deal_name?: string; hangout_link?: string }[]`.
- Fetch calendar events alongside existing parallel fetches (line 64).

**Why:** Daily loop step 8 (triage from phone). Morning standup: "What meetings do I have, which deals need attention, which groups went quiet." Today the TMA answers 2 of 3.

**Effort:** S (1-2 days)

### 1D. TMA: Stale Data Warning

**The gap:** Offline cache can serve 10-min stale data without warning. Currently shows "Offline" label but not the age of cached data.

**What to build:**
- **File:** `app/tma/page.tsx` -- When `fromCache` is true, show the cache timestamp: "Last updated X min ago".
- **File:** `components/tma/offline-cache.ts` -- Modify `cacheGet` to return `{ data, timestamp }` instead of just `data`.

**Why:** The crypto-BD agent makes decisions based on deal status. Serving 10-minute stale data without a timestamp is dangerous.

**Effort:** S (half day)

### 1E. TMA AI Chat: Deal Context Injection

**The gap:** `app/tma/ai-chat/page.tsx` sends `page_context: "/tma"` (line 60) but no deal-specific context. Desktop AI injects per-page context, but TMA AI chat is context-free.

**What to build:**
- **File:** `app/tma/ai-chat/page.tsx` -- Accept optional `?deal_id=X` query param. When present, fetch the deal and include it in the request as `deal_context`. Show the deal name in the header.
- **File:** `app/tma/deals/[id]/page.tsx` -- Add a "Ask AI" quick action that navigates to `/tma/ai-chat?deal_id={id}`.
- **File:** `app/tma/ai-chat/page.tsx` -- Update SUGGESTIONS to be contextual when deal context is present ("Summarize this deal's TG conversation", "Draft a follow-up message", "What's the next step?").

**Why:** Daily loop step 2 (qualify inbound leads). The AI assistant is only useful if it knows what you are working on.

**Effort:** S (1 day)

---

## PRIORITY 2: Calendar -> Deal Pipeline (Calendar 58 -> 75)

### 2A. Meeting-to-Deal Auto-Linking

**The gap:** Calendar events exist in `crm_calendar_events` but zero linkage to deals. No junction table exists.

**What to build:**
- **Migration:** Create `crm_calendar_event_deals` junction table: `{ id, calendar_event_id (FK), deal_id (FK), created_at }`.
- **File:** `app/api/calendar/link-deal/route.ts` -- New POST endpoint to create/delete links.
- **File:** `app/api/calendar/google/webhook/route.ts` -- When a new event arrives via webhook, auto-link: match attendee emails against `crm_contacts.email`, find linked deals, auto-create junction records.
- **File:** `app/calendar/page.tsx` -- In event detail view, show linked deals and allow manual linking via deal search dropdown.

**Why:** Daily loop step 5. "No meeting-to-deal auto-linking" is the single most impactful Calendar change.

**Effort:** M (3-4 days)

### 2B. "Schedule Meeting" from Deal Detail (Desktop)

**What to build:**
- Ensure desktop pipeline deal detail panel includes `BookingLinkButton` with TG send capability.
- **File:** `app/api/calendar/google/events/route.ts` -- Add `deal_id` field to POST request body. When present, auto-create junction record after event creation.

**Why:** One-click from deal -> scheduled meeting -> auto-linked is the core meeting-to-deal flow.

**Effort:** S (1 day)

### 2C. Stage Auto-Advance on Meeting Confirmed

**What to build:**
- **File:** `app/api/calendar/google/webhook/route.ts` -- When a confirmed event is auto-linked to a deal in "Calendly Sent" stage, auto-advance to "Video Call" stage.
- Store as built-in automation rule in `crm_workflow_templates`.

**Why:** Eliminates one manual step per deal. The crypto-BD agent moves deals through stages manually today.

**Effort:** S (1 day)

---

## PRIORITY 3: Group Health x Deal Pipeline Cross-Reference

### 3A. TMA Group Detail: Show Linked Deal Pipeline Status

**The gap:** `app/tma/groups/[id]/page.tsx` shows linked deals (line 459) but only name and stage color. No health signal correlation.

**What to build:**
- **File:** `app/tma/groups/[id]/page.tsx` -- Enrich linked deals section with deal health score, days since last activity, and stale indicator.
- **File:** `app/tma/groups/[id]/page.tsx` -- Add "Cross-Signal Alert" card at top of page when group is stale/dead AND any linked deal is in an active stage. Red alert: "This group went quiet but {deal_name} is in {stage_name}. Action needed."

**Why:** Daily loop step 7 (review group health). The crypto-BD agent needs group health cross-referenced with deal pipeline to spot dying partnerships.

**Effort:** S (1 day)

### 3B. TMA Home: Group-Deal Cross-Signal Section

**The gap:** Desktop dashboard (`app/page.tsx` lines 188-216) computes `crossSignals`. TMA home does not.

**What to build:**
- **File:** `app/tma/page.tsx` -- Port cross-signal logic from `app/page.tsx`. Show "Deal + Group Alerts" section before deals list.

**Why:** The cross-signal is one of the most useful dashboard features. Not having it on mobile means missed alerts during phone-based workflow.

**Effort:** S (1 day)

---

## PRIORITY 4: Contacts -> Crypto-Native (Contacts 68 -> 80)

### 4A. Contact Detail: Show Linked Deals

**The gap:** "No deal visibility from contact view -- must navigate away to see deals."

**What to build:**
- **File:** `app/tma/contacts/page.tsx` -- In contact detail bottom sheet (line 246), add "Deals" section. Fetch `GET /api/deals?contact_id={id}`. Show deal name, stage, value. Tap to navigate to `/tma/deals/{deal_id}`.
- Desktop `ContactDetailPanel` -- Add the same.

**Why:** Daily loop step 3 (update deals). Every deal starts with a contact. Not seeing a contact's deals from their profile forces mental context-holding.

**Effort:** S (1 day)

### 4B. Contact Form: Wallet Address in TMA

**The gap:** Desktop API accepts `wallet_address` and `wallet_chain`. TMA contact form does not expose these fields.

**What to build:**
- **File:** `app/tma/contacts/page.tsx` -- Add "Wallet Address" and "Chain" fields to create/edit form. Chain dropdown: Supra, EVM, Solana.
- Show wallet in contact detail with copy-to-clipboard.

**Why:** In crypto BD, the wallet address IS the identity for on-chain verification.

**Effort:** S (half day)

### 4C. Company Fields: Crypto-Native Enrichment

**The gap:** Company model is generic. No TVL, chain deployments, token status, funding round.

**What to build:**
- **Migration:** Add to `crm_companies`: `tvl NUMERIC`, `chains TEXT[]`, `token_status TEXT` (pre-token/live/vesting), `funding_round TEXT`, `dex_listings TEXT[]`.
- **File:** `app/companies/page.tsx` -- Add fields to detail and create forms.
- **File:** `app/api/contacts/route.ts` -- Include company crypto fields in joined select.

**Why:** Daily loop step 2 (qualify leads). TVL, chain deployments, and token status ARE the primary qualification criteria.

**Effort:** M (2-3 days)

---

## PRIORITY 5: Dashboard -> War Room (Dashboard 72 -> 82)

### 5A. "Hot Deals Closing This Week" Widget

**What to build:**
- **File:** `app/page.tsx` -- Add "Closing This Week" widget after stat cards. Filter deals where `expected_close_date` is within current week AND outcome is "open". Show deal name, value, stage, days until close. Red highlight for overdue.
- **File:** `app/api/stats/route.ts` -- Add `closingThisWeek` to stats response.

**Why:** "Which deals am I about to close or lose?" is THE most important morning question.

**Effort:** S (1 day)

### 5B. Token Denomination Toggle

**What to build:**
- **File:** `app/page.tsx` -- Add denomination selector: USD / USDT / SUPRA. Store in localStorage.
- **File:** `lib/utils.ts` -- Add `formatDealValue(value, denomination)` utility.
- For SUPRA denomination, fetch price from cached API call.

**Why:** Half of crypto BD deals are denominated in tokens. USD-only means mental math on every value.

**Effort:** M (2 days)

---

## PRIORITY 6: AI Agent Improvements (AI Agent 74 -> 82)

### 6A. Human Handoff with Context Summary

**What to build:**
- **File:** `app/api/ai-agent/respond/route.ts` -- On escalation, generate structured handoff summary (contact name, qualification data, conversation summary, escalation reason). Store in new `handoff_summary` column on `crm_ai_conversations`.
- **File:** `bot/handlers/messages.ts` -- Send handoff summary to assigned team member via bot DM.
- **File:** `app/tma/inbox/page.tsx` -- Show escalation badge with handoff summary visible.

**Why:** Daily loop step 2. When escalating to human, the human has no context. The crypto-BD agent loses time re-reading conversations.

**Effort:** M (2-3 days)

### 6B. Expand Context Window from 5 to 15 Messages

**What to build:**
- **File:** `app/api/ai-agent/respond/route.ts` -- Change `.limit(5)` to `.limit(15)`. Add token-counting guard: if history exceeds 3000 tokens, summarize older messages using Claude call, keep last 5 verbatim.
- **File:** `app/api/ai-agent/config/route.ts` -- Add `context_window_size` to allowed update fields.

**Why:** Crypto BD conversations span days. 5-message window means the agent "forgets" what was discussed 3 messages ago.

**Effort:** S (1 day)

---

## Implementation Order

| Phase | Items | Effort | Score Impact |
|-------|-------|--------|-------------|
| **Week 1** | 1A (TMA Schedule Meeting), 1C (Today's Meetings), 1D (Stale Warning) | ~4 days | TMA +3 |
| **Week 2** | 2A (Meeting-Deal Link), 2B (Schedule from Deal), 2C (Stage Auto-Advance) | ~5 days | Calendar +10 |
| **Week 3** | 1B (Inbox Context), 1E (AI Chat Context), 3A (Group-Deal Cross-Signal), 3B (TMA Cross-Signal) | ~4 days | TMA +3, Groups +2 |
| **Week 4** | 4A (Contact Deals), 4B (Wallet in TMA), 4C (Company Crypto Fields) | ~4 days | Contacts +8 |
| **Week 5** | 5A (Closing This Week), 5B (Token Toggle), 6A (Handoff Summary), 6B (Context Window) | ~6 days | Dashboard +5, AI +4 |

**Projected score after 5 weeks:** Calendar 58->73, Contacts 68->78, Dashboard 72->80, AI Agent 74->80, TMA 80->88. **Overall: 78 -> 85.**

---

## Final Verdict

The TMA foundation is genuine -- not a responsive web page stuffed into Telegram. The `useTelegramWebApp` hook properly handles `ready()`, `BackButton`, `MainButton`, `HapticFeedback`, and `themeParams`. Offline-first with IndexedDB is real. Pull-to-refresh with haptic feedback is real. Swipeable deal cards are real. This is not a demo.

But it is not a daily driver yet. The crypto-BD agent cannot schedule a meeting, see today's calls, check a contact's deals, or get a context-aware AI response -- all things they need to do between back-to-back partnership calls. The plan above fills exactly those gaps. Five weeks of focused execution, no new features that do not serve the crypto-BD agent's phone-first workflow.

> "If your community manager has to open a laptop to manage groups, you have already lost to the person who builds it in TMA." — Sofia Park
