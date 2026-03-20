# SupraCRM Email — User Testing Evaluation
**Date:** 2026-03-20 | **Benchmarks:** Superhuman ($30/mo), Missive ($24/mo)

---

## Test Users

| | User A — Sarah (BD Lead) | User B — Marcus (Marketing Lead) | User C — Priya (Admin Lead) |
|---|---|---|---|
| **Role** | Outbound BD, 80+ emails/day | Campaign coordination, 40 emails/day | Ops & legal, 25 emails/day |
| **Prior client** | Superhuman (2 years) | Gmail + Missive (1 year) | Apple Mail |
| **What they care about** | Speed, sequences, CRM linking | Templates, team visibility, broadcasts | Reliability, search, audit trail |

---

## Rating Criteria (1-10 scale)

Criteria selected based on what Superhuman and Missive are known for — the features that define a modern business email client.

### 1. Speed & Responsiveness

*Superhuman's entire brand. Sub-100ms interactions, pre-fetched threads, instant search.*

| Criteria | Superhuman | Missive | Sarah (BD) | Marcus (Mkt) | Priya (Admin) | Avg |
|----------|:---:|:---:|:---:|:---:|:---:|:---:|
| Thread list load time | 10 | 7 | 5 | 6 | 6 | **5.7** |
| Thread open speed | 10 | 7 | 5 | 5 | 6 | **5.3** |
| Action feedback (archive/star) | 10 | 8 | 4 | 5 | 5 | **4.7** |
| Search speed | 10 | 7 | 5 | 5 | 4 | **4.7** |
| **Category avg** | **10** | **7.3** | **4.8** | **5.3** | **5.3** | **5.1** |

**Why low:** No optimistic UI — every action round-trips to Gmail API (~200ms+). No pre-indexing. IndexedDB cache exists but isn't aggressively warming. Feels noticeably slower than Superhuman.

---

### 2. Keyboard-Driven Workflow

*Superhuman: 100+ shortcuts, never touch the mouse. Missive: solid shortcuts + command palette.*

| Criteria | Superhuman | Missive | Sarah (BD) | Marcus (Mkt) | Priya (Admin) | Avg |
|----------|:---:|:---:|:---:|:---:|:---:|:---:|
| Shortcut coverage | 10 | 7 | 7 | 6 | 5 | **6.0** |
| Discoverability (help overlay) | 10 | 8 | 8 | 7 | 7 | **7.3** |
| Command palette (Cmd+K) | 10 | 9 | 0 | 0 | 0 | **0.0** |
| Multi-select & bulk actions | 9 | 8 | 0 | 0 | 0 | **0.0** |
| **Category avg** | **9.8** | **8.0** | **3.8** | **3.3** | **3.0** | **3.3** |

**Why low:** 18 shortcuts is a good start but missing command palette entirely (Superhuman's Cmd+K is core UX). No multi-select (`x` key) or bulk actions. Sarah (ex-Superhuman) feels this gap hardest.

---

### 3. Compose & Send Experience

*Superhuman: instant compose, undo send, Send+Archive, snippets. Missive: rich editor, canned responses, collision detection.*

| Criteria | Superhuman | Missive | Sarah (BD) | Marcus (Mkt) | Priya (Admin) | Avg |
|----------|:---:|:---:|:---:|:---:|:---:|:---:|
| Rich text editor quality | 8 | 9 | 7 | 8 | 7 | **7.3** |
| Undo send | 10 | 9 | 8 | 7 | 7 | **7.3** |
| Send & Archive combo | 10 | 8 | 0 | 0 | 0 | **0.0** |
| Attachments & inline images | 9 | 9 | 3 | 4 | 3 | **3.3** |
| Cc/Bcc UX (collapse/expand) | 9 | 9 | 5 | 5 | 5 | **5.0** |
| Signatures | 8 | 8 | 7 | 7 | 7 | **7.0** |
| **Category avg** | **9.0** | **8.7** | **5.0** | **5.2** | **4.5** | **4.9** |

**Why mixed:** Tiptap editor is solid. Undo send (60s) is generous. But no Send+Archive shortcut, no drag-drop attachments, no inline image paste. The compose flow works but has friction compared to both benchmarks.

---

### 4. AI Features

*Superhuman: auto-draft, voice matching, auto-labels. Missive: basic AI assist. SupraCRM should win here.*

| Criteria | Superhuman | Missive | Sarah (BD) | Marcus (Mkt) | Priya (Admin) | Avg |
|----------|:---:|:---:|:---:|:---:|:---:|:---:|
| AI draft quality (Claude) | 9 | 5 | 8 | 8 | 7 | **7.7** |
| Auto-draft on thread open | 10 | 0 | 0 | 0 | 0 | **0.0** |
| Tone adjustment | 8 | 3 | 8 | 7 | 6 | **7.0** |
| Thread summarization | 8 | 0 | 7 | 8 | 8 | **7.7** |
| AI search (NL → query) | 8 | 0 | 6 | 6 | 5 | **5.7** |
| Auto-categorization/triage | 9 | 3 | 0 | 0 | 0 | **0.0** |
| **Category avg** | **8.7** | **1.8** | **4.8** | **4.8** | **4.3** | **4.7** |

**Why lower than expected:** The AI features that ARE built (draft, summarize, tone) work well. But the highest-impact AI feature — auto-draft on thread open — isn't implemented. No auto-categorization either. These two gaps bring the score down significantly vs Superhuman.

---

### 5. CRM Integration (SupraCRM's Moat)

*Superhuman: HubSpot/Salesforce sidebar ($40/mo plan). Missive: HubSpot/Pipedrive connectors. SupraCRM: native.*

| Criteria | Superhuman | Missive | Sarah (BD) | Marcus (Mkt) | Priya (Admin) | Avg |
|----------|:---:|:---:|:---:|:---:|:---:|:---:|
| Deal ↔ Email linking | 6 | 5 | 10 | 9 | 8 | **9.0** |
| Contact recognition | 7 | 6 | 9 | 8 | 8 | **8.3** |
| Compose from deal page | 0 | 0 | 10 | 9 | 8 | **9.0** |
| Email in deal timeline | 5 | 4 | 9 | 9 | 9 | **9.0** |
| Auto-link by contact email | 0 | 0 | 9 | 8 | 8 | **8.3** |
| **Category avg** | **3.6** | **3.0** | **9.4** | **8.6** | **8.2** | **8.7** |

**Clear winner.** Native CRM integration is the standout. No context switching. Every user rated this highest. This is the reason to use SupraCRM email over anything else.

---

### 6. Sequences & Templates (BD Power Tools)

*Superhuman: no sequences (use Outreach). Missive: canned responses only. SupraCRM: native sequences.*

| Criteria | Superhuman | Missive | Sarah (BD) | Marcus (Mkt) | Priya (Admin) | Avg |
|----------|:---:|:---:|:---:|:---:|:---:|:---:|
| Template library | 7 | 7 | 8 | 8 | 7 | **7.7** |
| Template variables from CRM | 0 | 0 | 9 | 8 | 7 | **8.0** |
| Multi-step sequences | 0 | 0 | 9 | 7 | 5 | **7.0** |
| Auto-pause on reply | 0 | 0 | 9 | 7 | 6 | **7.3** |
| Sequence analytics | 0 | 0 | 2 | 3 | 2 | **2.3** |
| **Category avg** | **1.4** | **1.4** | **7.4** | **6.6** | **5.4** | **6.5** |

**Strong but incomplete.** Sequences exist and work — huge differentiator. But no analytics (reply rate per step, open rate) makes it hard to iterate on outreach. Sarah needs this data to optimize.

---

### 7. Inbox Management & Triage

*Superhuman: Split Inbox, auto-labels, snooze. Missive: shared inboxes, rules. HEY: Imbox/Feed/Paper Trail.*

| Criteria | Superhuman | Missive | Sarah (BD) | Marcus (Mkt) | Priya (Admin) | Avg |
|----------|:---:|:---:|:---:|:---:|:---:|:---:|
| Split inbox / categories | 10 | 7 | 5 | 5 | 4 | **4.7** |
| Snooze | 9 | 8 | 7 | 7 | 6 | **6.7** |
| Label management | 7 | 8 | 7 | 7 | 7 | **7.0** |
| Unread counts & badges | 9 | 8 | 6 | 6 | 6 | **6.0** |
| Real-time updates (push) | 10 | 8 | 2 | 2 | 2 | **2.0** |
| **Category avg** | **9.0** | **7.8** | **5.4** | **5.4** | **5.0** | **5.3** |

**Why low:** Split inbox exists but is basic (All/Important/Updates/Other vs Superhuman's ML-powered triage). Biggest pain: no real-time updates. Polling means new emails arrive late. Every user noticed.

---

### 8. Security, Privacy & Reliability

| Criteria | Superhuman | Missive | Sarah (BD) | Marcus (Mkt) | Priya (Admin) | Avg |
|----------|:---:|:---:|:---:|:---:|:---:|:---:|
| Token encryption | 8 | 8 | 8 | 8 | 8 | **8.0** |
| No email content stored | N/A | N/A | 8 | 7 | 9 | **8.0** |
| Audit logging | 7 | 8 | 5 | 5 | 4 | **4.7** |
| External image blocking | 5 | 8 | 7 | 7 | 7 | **7.0** |
| Error recovery | 8 | 8 | 4 | 5 | 4 | **4.3** |
| **Category avg** | **7.0** | **8.0** | **6.4** | **6.4** | **6.4** | **6.4** |

**Decent foundation** but audit logging is sparse and error recovery on failed sends needs work. Priya (admin/legal) cares most about the audit trail gap.

---

## Overall Scores

| | Superhuman | Missive | Sarah (BD) | Marcus (Mkt) | Priya (Admin) | **SupraCRM Avg** |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| Speed & Responsiveness | 10.0 | 7.3 | 4.8 | 5.3 | 5.3 | **5.1** |
| Keyboard Workflow | 9.8 | 8.0 | 3.8 | 3.3 | 3.0 | **3.3** |
| Compose & Send | 9.0 | 8.7 | 5.0 | 5.2 | 4.5 | **4.9** |
| AI Features | 8.7 | 1.8 | 4.8 | 4.8 | 4.3 | **4.7** |
| CRM Integration | 3.6 | 3.0 | 9.4 | 8.6 | 8.2 | **8.7** |
| Sequences & Templates | 1.4 | 1.4 | 7.4 | 6.6 | 5.4 | **6.5** |
| Inbox Management | 9.0 | 7.8 | 5.4 | 5.4 | 5.0 | **5.3** |
| Security & Reliability | 7.0 | 8.0 | 6.4 | 6.4 | 6.4 | **6.4** |
| | | | | | | |
| **OVERALL** | **8.6** | **6.4** | **5.9** | **5.7** | **5.3** | **5.6** |

---

## Gap Analysis vs Benchmarks

```
                    Superhuman (8.6)    Missive (6.4)    SupraCRM (5.6)
                    ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  ▓▓▓▓▓▓▓▓▓▓▓▓▓   ▓▓▓▓▓▓▓▓▓▓▓

Gap to close:       ████████████ 3.0     ████ 0.8
```

**vs Superhuman (gap: 3.0):** Biggest gaps are speed (4.9 gap), keyboard workflow (6.5 gap), and inbox management (3.7 gap). These are Superhuman's core strengths and hard to match.

**vs Missive (gap: 0.8):** Much closer. SupraCRM already beats Missive on CRM integration (+5.7) and sequences (+5.1). Needs to close compose (+3.8) and keyboard (+4.7) gaps.

---

## User Verdicts

**Sarah (BD Lead):** "CRM linking is incredible — I'd actually use this over Superhuman for deal-related email. But I can't give up Cmd+K and the speed. If you add a command palette, optimistic UI, and Send+Archive, I'd switch for BD work."

**Marcus (Marketing):** "Templates and sequences are exactly what I need for campaign outreach. The AI drafting is solid. But the inbox feels sluggish compared to Missive, and I miss real-time updates. Fix the speed and I'm in."

**Priya (Admin):** "I like that it doesn't store email content — good for compliance. But I need better audit logging for legal reviews, and the search is too slow for finding old threads. The CRM linking saves me from copy-pasting deal info into emails."

---

## Priority Improvements (by impact)

| # | Improvement | Effort | Impact | Closes gap with |
|---|------------|:---:|:---:|---|
| 1 | Optimistic UI for all actions | M | +1.5 speed score | Superhuman, Missive |
| 2 | Command palette (Cmd+K) | M | +2.0 keyboard score | Superhuman |
| 3 | Send + Archive shortcut | S | +1.0 compose score | Superhuman |
| 4 | Auto-draft on thread open (AI) | M | +1.5 AI score | Superhuman |
| 5 | Gmail Pub/Sub real-time | L | +2.0 inbox score | Superhuman, Missive |
| 6 | Sequence analytics dashboard | M | +1.5 sequences score | (unique advantage) |
| 7 | Drag-drop attachments | S | +0.5 compose score | Both |
| 8 | Audit log for email actions | S | +0.5 security score | Missive |
| 9 | Auto-categorization (Gmail cats) | M | +1.0 inbox score | Superhuman |
| 10 | Multi-select + bulk actions | S | +1.0 keyboard score | Both |

**Projected score after top 5 improvements: ~7.2** (closes Missive gap, narrows Superhuman gap to ~1.4)

---

## Conclusion

SupraCRM email is a **6/10 generic email client** but a **9/10 CRM-native email tool**. The strategy shouldn't be to match Superhuman feature-for-feature — it's to make core email UX "good enough" (target: 7.0+) so users don't context-switch back to Gmail, while doubling down on what no competitor can match: native CRM integration and BD sequences.

The 5 improvements above get you there.
