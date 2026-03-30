# SupraCRM Strategic Roadmap: Path to #1 Telegram CRM
**Date:** 2026-03-20 | **Author:** Jon + Claude Code session

---

## Current Position

| Rank | CRM | Weighted Score |
|------|-----|---------------|
| 1 | CRMChat | 80.5 |
| 2 | Respond.io | 72.3 |
| 3 | Entergram | 66.6 |
| **4** | **SupraCRM** | **~64** |
| 5 | NetHunt CRM | 57.8 |
| 6 | Planfix | 55.5 |

**Journey so far:** 32.5 (v1) → 64 (v2). Passed NetHunt and Planfix. Need +17 to beat CRMChat.

---

## Strategic Thesis

SupraCRM wins by being **the CRM that lives inside Telegram** — not another CRM with a Telegram plugin. Three moats no competitor has:

1. **Telegram conversation timeline inside deal detail** — no competitor shows TG message history inline with CRM data
2. **TMA as full mobile CRM** — manage deals without leaving Telegram
3. **Blockchain-native payment tracking** — close the loop from MOU to on-chain payment automatically

---

## Priority Matrix

### P0 — Ship These to Pass Entergram (~67+)

| Feature | Category Impact | Score Lift | Why |
|---------|----------------|------------|-----|
| **TG conversation timeline in deal detail** | #7 TG Integration (+12), #22 AI Summaries (+10) | +5-7 weighted | This IS the "why SupraCRM" answer. No CRM shows TG messages inline. `crm_notifications` already captures TG messages — surface them in deal detail with reply capability. |
| **TMA deal management (full)** | #12 Mini-App (+15), #29 Mobile (+10) | +4-6 weighted | Current TMA is thin. Add: task management, AI chat, quick actions, broadcast send. Zero context-switching for BD team. |
| **Outreach sequence branching** | #14 Outreach (+12) | +2-3 weighted | Current sequences are linear. Add: reply detection, auto-pause on response, conditional branching. |

### P1 — Ship These to Pass Respond.io (~73+)

| Feature | Category Impact | Score Lift | Why |
|---------|----------------|------------|-----|
| **Bot drip sequences** | #14 Outreach (+8), #20 Workflows (+5) | +3-4 weighted | Automate follow-ups triggered by TG events (group join, keyword, silence). Competitors do this. |
| **Auto-assignment rules** | #4 Tasks (+8), #20 Workflows (+5) | +3-4 weighted | Round-robin, by tag, by board. Scale beyond 3 people. |
| **Contact engagement scoring from TG activity** | #19 AI Lead Qual (+15), #11 Group Monitoring (+5) | +3-5 weighted | Passive intelligence: message frequency, response time, group participation → deal health score. |
| **Unified inbox across bots** | #8 Multi-Account (+15) | +4-5 weighted | Currently per-bot views. Need: single timeline across all bots, filterable by bot/group/contact. |
| **Saved views + custom dashboards** | #1 Kanban (+5), #28 UI/UX (+5) | +2-3 weighted | Save filter combos, create personal boards. Dmitry R.'s #1 complaint. |

### P2 — Ship These to Pass CRMChat (~81+)

| Feature | Category Impact | Score Lift | Why |
|---------|----------------|------------|-----|
| **Payment tracking integration** | #3 Deals (+5), #7 TG Integration (+5) | +2-3 weighted | Track USDT/USDC transfers linked to deals. Auto-move deals to "First Check Received" on payment confirmation. Supra L1 native. |
| **AI chatbot flows (decision trees)** | #18 AI Agent (+15), #20 Workflows (+5) | +4-5 weighted | Not just Claude Q&A — configurable decision trees per group. Auto-qualify, auto-route, auto-respond. |
| **Public REST API + API keys** | #24 Zapier/API (+20) | +3-4 weighted | Let third parties pull data. Foundation for Zapier/Make apps. |
| **TG folder sync** | #9 Folders (+40) | +4-5 weighted | Requires MTProto folder API. Infrastructure exists in telegram-client.ts. |
| **Custom fields on deals + groups** | #5 Custom Fields (+12) | +2-3 weighted | Currently contact-only. Extend to all entities. |

### P3 — Polish & Defensibility

| Feature | Why |
|---------|-----|
| AI conversation summarization (auto, per-group) | Turn passive group admin into active deal intelligence |
| Multi-workspace / white-label | If this works for Supra BD, other L1/L2 teams want it |
| QR code deep-link lead capture | Low-effort, fills a gap |
| Calendar + timeline views | Addresses Dmitry R.'s "no Gantt/calendar" objection |

---

## Remaining Structural Gaps (Acknowledged, Not Prioritized)

These are real gaps that we **intentionally deprioritize** because they don't serve the Telegram-first thesis:

| Category | Gap | Why We Skip |
|----------|-----|-------------|
| Omnichannel (-65) | No WhatsApp, IG, SMS | Telegram-first by design. Not a weakness — a focus. |
| Voice-to-Data (-70) | No voice transcription | Low value for BD text-based workflows |
| Third-Party CRM Sync (-65) | No HubSpot/Salesforce bidirectional | Webhook outbound + public API (P2) covers 80% of use cases |
| QR Code (-67) | No QR lead capture | Nice-to-have, not blocking adoption |

---

## Score Projection

| Milestone | Target Score | Key Deliverables | Passes |
|-----------|-------------|-----------------|--------|
| Current | ~64 | — | NetHunt, Planfix |
| P0 complete | ~73 | TG timeline, full TMA, sequence branching | Entergram, Respond.io |
| P1 complete | ~78 | Drip sequences, auto-assign, engagement scoring, unified inbox | — |
| P2 complete | ~84 | Payment tracking, AI flows, public API, folder sync | **CRMChat** |

---

## Implementation Notes

- **TG conversation timeline** is the single highest-ROI feature. It touches the two highest-weighted categories (#7 TG Integration, wt=5) and creates a defensible moat.
- **TMA expansion** has outsized impact because it scores on both Mini-App (#12, wt=4) and Mobile (#29, wt=3) — 7 combined weight.
- **Payment tracking** is unique to SupraCRM. No other Telegram CRM can do blockchain-native deal completion tracking. This is the feature that makes SupraCRM the obvious choice for Web3 BD teams.
- **Don't chase Planfix's objections** about custom entities/Gantt/time-tracking. That's a different product for a different market. Win the Telegram-first niche decisively.

---

## What Changed from Previous Plan

| Old Plan (CLAUDE.md) | New Plan |
|----------------------|----------|
| Phase 2: Telegram Bot (basic) | P0: TG conversation timeline + full TMA |
| Phase 3: Access Control (slugs) | Slug UI already partially built, folded into P1 |
| Phase 4: Polish | Replaced with P2 (payment, AI flows, API) + P3 (polish) |
| No competitive framing | Every feature tied to score impact + competitor to beat |

---

## Sources

All reviews live in `docs/reviews/` — see `docs/reviews/README.md` for the index and naming convention.

- `docs/reviews/cpo-review-v3.md` — v3 review (73.4/100, 3 CPO personas, 20 functions rated 1-100, 2026-03-30)
- `docs/reviews/cpo-review-2026-03-28.md` — v2 feature maturity table (8.3/10, 50+ line items)
- `docs/reviews/cpo-review-post-4c.md` — Sarah Chen CPO directive ("3 things that matter")
- `persona-improvement-research.md` — Improvement loop methodology (in SupraLoop/Persona Builder/)
- `plan.md` — Knowledge Graph plan (ships independently)
