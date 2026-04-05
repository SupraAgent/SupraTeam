# CPO North Star: SupraCRM

**Date:** 2026-04-05 | **Crypto-BD Agent Score: 78/100** | **Target: 90/100**

> The North Star user is the **crypto-BD agent** (slug: `crypto-bd`, commit `7426f09`): a founder-level CBO running business development for an L1 blockchain / DeFi protocol. Every product decision must serve this user's daily workflow of closing protocol partnerships via Telegram.

---

## Who We Build For

**The crypto-BD agent** is not a generic "BD rep." They are:

- A **founder/CBO** at an L1 blockchain protocol (Supra)
- Running 50+ TG DMs, 20 group chats, 10 deal threads daily
- Qualifying leads by **protocol TVL, chain deployments, token status, funding stage, integration timeline**
- Speaking crypto-native: TVL, TGE, LBP, vesting cliffs, integration grants, validator incentives, bridge partnerships
- **80% Telegram, 15% X DMs, 5% email** — Telegram is where crypto deals happen
- Working across **UTC+8 to UTC-8** on their phone between calls
- Evaluating every tool by: **"does this help me close protocol partnerships faster?"**

Their full product review: `docs/reviews/crypto-bd-agent-first-impressions.md`

---

## Current State: Crypto-BD Agent Scores

| Product Area | Score | Verdict |
|---|---|---|
| **Telegram Integration** | 88/100 | THE MOAT. Zero-knowledge + broadcasts + group health. Best-in-class. |
| **Pipeline / Kanban** | 85/100 | Best feature. Deal cards are info-dense, TG integration visible. |
| **Outreach Sequences** | 82/100 | Sophisticated A/B engine, but email-only. Needs TG as a channel. |
| **TMA (Mobile)** | 80/100 | Strategically critical. Native feel, offline-first. Needs more actions. |
| **Automations** | 79/100 | Powerful 40-node builder. Needs BD templates + reliability. |
| **Email / Gmail** | 76/100 | Over-engineered for crypto BD. Polished but secondary channel. |
| **AI Agent (crypto-bd)** | 74/100 | Good v1. Single-agent limit and thin context hold it back. |
| **Dashboard** | 72/100 | Good snapshot, needs urgency layer + crypto-native metrics. |
| **Contacts & Companies** | 68/100 | Not crypto-native. Needs multi-wallet, cross-chain, contact→deal nav. |
| **Calendar** | 58/100 | Read-only widget. No meeting→deal linking or scheduling actions. |
| **Overall** | **78/100** | |

---

## What's Strong (Defend These)

| Area | Score | Why It Matters to Crypto-BD |
|------|-------|-----------------------------|
| Telegram Integration | 88 | Zero-knowledge auth is existential for crypto. Broadcasts + group health + AI auto-qualification is the killer BD workflow. |
| Pipeline / Kanban | 85 | Deal cards with TG unread counts, health scores, sentiment, awaiting-reply timers. This IS the crypto-BD agent's daily view. |
| Outreach Sequences | 82 | AI-generated sequences with A/B testing and web3_native tone. Statistical significance calculations. |
| TMA Mobile | 80 | CRM inside Telegram. Offline-first. The thesis made real. |

**Rule: Do not regress these.** Any change to these areas must maintain or improve the crypto-BD agent's score.

---

## What's Weak (The 5 Moves That Matter)

### 1. Contacts → Crypto-Native Data Model (68 → 82)

The crypto-BD agent needs contacts that understand crypto:
- **Multi-wallet support** — people have 5+ wallets across chains
- **Protocol-level company fields** — TVL, chain deployments, token status, funding round
- **Contact→deal navigation** — click a contact, see their deals instantly
- **Cross-chain enrichment** — not just Supra, also EVM chains
- **ENS / domain resolution** from wallet addresses

**Impact:** Every deal starts with a contact. If the contact model doesn't speak crypto, every downstream workflow suffers.

### 2. Calendar → Meeting-to-Deal Pipeline (58 → 75)

The crypto-BD agent schedules 5-10 partnership calls daily. Calendar must participate in the deal flow:
- **"Schedule meeting" action** from deal or contact (one click → Calendly link via TG)
- **Meeting→deal auto-linking** (attendees → which deal it belongs to)
- **Timezone handling** — critical for UTC+8 to UTC-8 global BD
- **Transcript integration** — Fireflies/meeting notes auto-attached to deal
- **Stage auto-advance** — deal moves to "Video Call" stage when meeting confirmed

**Impact:** The single lowest score (58). Currently a read-only widget that doesn't participate in any workflow.

### 3. Outreach Sequences → TG as a Channel (82 → 90)

The crypto-BD agent's outreach is multi-channel: TG DM → follow-up TG → send Calendly → email formal proposal. Today sequences are email-only:
- **Telegram message steps** in sequences (not just email)
- **Cross-channel conditions** ("pause if they joined our TG group")
- **Pre-built crypto BD templates** (partnership outreach, grant follow-up, integration proposal)
- **Reply attribution per step** (not just enrollment-level)

**Impact:** Highest-scored weak area. Small delta to move it from "good" to "best-in-class."

### 4. AI Agent → Multi-Agent + Deeper Context (74 → 85)

The crypto-BD agent needs the AI to be a real teammate, not a single-prompt chatbot:
- **Multi-agent support** — crypto-BD for partnerships, separate agent for dev relations
- **Longer context window** — 5 messages is too thin for multi-day BD conversations
- **Human handoff with summary** — when escalating, give the human a deal context brief
- **Rich responses** — inline buttons, formatted messages, not just plain text
- **A/B testing of prompts** — compare "confident founder" vs "helpful advisor" conversion

**Impact:** The AI agent IS the crypto-BD agent's first line of defense for inbound leads. Better AI = more qualified pipeline with zero human effort.

### 5. Dashboard → Crypto-BD War Room (72 → 82)

The crypto-BD agent's morning standup should take 30 seconds:
- **"Hot deals closing this week"** widget — pipeline velocity + follow-ups combined
- **Response time metrics** — how fast is the team replying in TG?
- **Token denomination toggle** — USDT / USD / native token for deal values
- **"Who hasn't replied in 24h"** urgency list
- **"Groups that went silent"** cross-referenced with deal stage

**Impact:** The dashboard is the first thing they see. If it doesn't answer "what do I need to do RIGHT NOW?", they skip it.

---

## Strategic Decisions

### DO pursue (serves the crypto-BD agent):
- Crypto-native contact model — every deal starts with a contact
- Meeting→deal pipeline — 5-10 calls/day, none linked to deals
- TG sequence steps — the outreach channel is Telegram, not email
- Multi-agent AI — inbound qualification at scale
- Dashboard urgency layer — 30-second morning standup

### DON'T pursue (doesn't serve the crypto-BD agent):
- **More email features** — Email is 5% of crypto BD communication. Park it. Every hour on email is an hour not spent on TG sequences.
- **3rd-party CRM sync** — Webhook outbound covers 80% of value. HubSpot/Salesforce connectors are months of work for a user who doesn't use those tools.
- **Voice-to-Data** — Low value for text-based TG workflows.
- **WhatsApp/SMS** — Telegram-first by design. The crypto-BD agent doesn't use WhatsApp for deals.
- **Generic CRM features** — Custom fields, advanced reporting, team permissions — these are table stakes, not differentiators. Build them only when the crypto-BD agent specifically needs them.

### STOP investing in:
- **Email compose polish** — It's already 76/100, which is more than enough for the 5% of communication that happens over email.
- **Calendar as a standalone feature** — Calendar only matters if it's connected to deals. Don't build calendar features; build deal-meeting-linking features.

---

## Score Projection

| Milestone | Score | Delta |
|-----------|-------|-------|
| Current | 78 | — |
| + Crypto contacts + contact→deal nav | 81 | +3 |
| + Meeting→deal pipeline + Calendly TG flow | 83 | +2 |
| + TG sequence steps + crypto BD templates | 86 | +3 |
| + Multi-agent AI + longer context | 88 | +2 |
| + Dashboard war room + urgency layer | 90 | +2 |

---

## The Thesis (One Sentence)

**SupraCRM is the CRM that lives inside Telegram for crypto BD — where protocol partnerships are qualified, managed, and closed without ever leaving the messenger.**

Every feature we build must make that sentence more true. Every feature that doesn't should be questioned, paused, or killed.

---

## Bottom Line

We're at 78/100 through the crypto-BD agent's eyes. The Telegram integration (88) and Pipeline (85) prove the thesis works. But the product still thinks like a generic CRM in places: contacts don't understand crypto, calendar is a read-only widget, sequences are email-only, and the AI agent is a single-prompt chatbot. The path to 90 is clear: crypto-native data model, meeting→deal linking, TG sequences, multi-agent AI, and a dashboard that serves as a 30-second war room. Five moves, focused execution, no distractions.

Stop widening the product. Win the crypto BD war.
