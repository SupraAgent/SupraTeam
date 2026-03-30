# SupraCRM Action Plan — March 2026
**Date:** 2026-03-30 | **Current Score:** 73.4/100 | **Target:** 81+ (beat CRMChat)

---

## The 3 Telegram CRM Moats

### Moat 1: Conversation IS the CRM
TG messages as first-class CRM objects. Reply from CRM. Context cards inline. No competitor shows TG history inside deal records with bi-directional reply. Switching cost = losing conversation context.

### Moat 2: Slug-Based Group Control at Scale
Programmatic add/remove across group clusters. Engagement tiers. Health scoring. AI summaries. Audit trail. Switching cost = operational (can't go back to manual).

### Moat 3: TMA — CRM That Lives Inside Telegram
"Never leave Telegram" play. No competitor has a serious TMA. BD reps already live in TG. Zero adoption friction.

---

## Execution Blocks

### Block 1: Actionable Inbox (Moat 1)
- 1a: Reply from inbox (bot + MTProto modes) — M
- 1b: Conversation status (open/assigned/snoozed/closed + tabs) — M
- 1c: Canned responses with merge vars + `/` trigger — S
- 1d: First-response-time tracking — S

### Block 2: Conversation-First Deal Detail (Moat 1)
- 2a: Chat tab as default, widen panel or full-page route — M
- 2b: Context cards inline (stage changes, notes, AI insights) — M
- 2c: Quick action bar (Move Stage, Add Note, Assign, Won/Lost) — S
- 2d: Merge activity + conversation into single timeline — S

### Block 3: Smart Assignment (Enables Moats 1+3)
- 3a: Assignment rules engine (conditions + round-robin) — M
- 3b: Inbox auto-assignment on new conversation — S
- 3c: Settings UI for rules — S

### Block 4: TMA → Real Mobile Product (Moat 3)
- 4a: Deep TG WebApp SDK (MainButton, BackButton, theme, haptics) — M
- 4b: Inbox in TMA (reuse Block 1 APIs) — M
- 4c: Deal quick actions from TMA — S
- 4d: Pull-to-refresh, swipe gestures — S
- 4e: Push notifications wired to bot DM delivery — S

### Block 5: Cleanup & Hardening
- 5a: Kill /drip, redirect to /outreach — S
- 5b: Hide Knowledge Graph — S (DONE)
- 5c: Pagination on contacts, deals, workflow runs — M
- 5d: Undo on deal drag in kanban — S
- 5e: Converge or differentiate two workflow systems — S

### Block 6: Sharpen Moat 2 (Group Control)
- 6a: Time-bound access grants (auto-revoke) — S
- 6b: Group comparison dashboard — M
- 6c: Automated re-engagement for quiet groups — M

### Future Consideration
- Google Calendar bidirectional sync
- Payment tracking (blockchain-native)
- AI chatbot decision trees
- Public REST API

---

## Score Projection

| After | Score | Delta |
|-------|-------|-------|
| Current | 73.4 | — |
| Blocks 1+2 | ~77 | +3.6 |
| Block 3 | ~78 | +1 |
| Block 4 | ~81 | +3 |
| Block 5 | ~82 | +1 |
| Block 6 | ~83 | +1 |
