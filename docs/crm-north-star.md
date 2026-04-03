# CPO North Star: SupraCRM

**Date:** 2026-04-03 | **Weighted Score: 69.5/100** | **Rank: 3rd** | **Target: 80.5 (#1)**

> Scoring uses the same 30-category weighted framework as `telegram_crm_ratings.xlsx`. See `reviews/cpo-review-2026-04-03.md` for the full 30-category scorecard with evidence.

---

## Where We Stand

| Rank | CRM | Weighted Score |
|------|-----|---------------|
| 1 | CRMChat | 80.4 |
| 2 | Respond.io | 72.0 |
| **3** | **SupraCRM** | **69.5** |
| 4 | Entergram | 68.7 |

**Gap to #1: -10.9 points.** Previous estimates (~75) were aspirational, not math-based. Rigorous per-category scoring reveals the real position.

**Score trajectory:** 32.5 (v1) -> 64 (v2) -> 69.5 (v4 rigorous)

---

## What's Strong (Our Advantages Over CRMChat)

| Category | Us | CRMChat | Wt | Advantage |
|----------|-----|---------|-----|-----------|
| Workflow Automation | 80 | 60 | 4 | **+80** |
| AI Summaries/Sentiment | 82 | 65 | 3 | **+51** |
| Privacy (ZK sessions) | 85 | 70 | 3 | **+45** |
| Omnichannel (TG+Gmail+Cal) | 48 | 30 | 2 | +36 |
| GDPR/Compliance | 78 | 65 | 2 | +26 |
| Custom Fields | 82 | 75 | 3 | +21 |
| Group Monitoring | 80 | 75 | 3 | +15 |

**Total weighted advantage: +274 points.** Defend these — especially workflow automation, AI summaries, and privacy.

---

## What's Weak (Top Gaps by Weighted Impact)

| Category | Us | CRMChat | Wt | Gap | Fix |
|----------|-----|---------|-----|-----|-----|
| TG Folder Sync | 15 | 90 | 4 | **-300** | Ship MTProto folder API (client exists) |
| 3rd-Party CRM Sync | 10 | 82 | 3 | -216 | Skip — webhook outbound is enough |
| Voice-to-Data | 5 | 80 | 2 | -150 | Skip — low value for text BD workflows |
| QR Code Lead Capture | 20 | 85 | 2 | -130 | Ship QR generation + tracking |
| Task Assignment | 68 | 85 | 4 | -68 | Add priorities, recurring, metrics |
| Zapier/API Access | 65 | 85 | 3 | -60 | Ship v1 REST endpoints |
| Mini-App / TMA | 78 | 92 | 4 | -56 | Add offline, gestures |
| Onboarding Speed | 72 | 90 | 3 | -54 | Folder sync IS onboarding |
| AI Chatbot | 65 | 78 | 4 | -52 | Ship decision trees |
| AI Lead Qual | 58 | 75 | 3 | -51 | Complete auto-deal + scoring |

**Total weighted gap: -1,137 points.** But most of it is concentrated in folder sync (-300) and 3rd-party CRM (-216), and we intentionally skip voice (-150) and CRM sync (-216).

---

## The 5 Moves That Close the Gap

### 1. TG Folder Sync (15 -> 75 = +2.3 weighted score)

The single highest-ROI feature. MTProto client exists, folder API is a few method calls. Map slugs to folders, sync on change. Also unlocks onboarding improvement (folder sync = instant pipeline).

### 2. Public REST API (65 -> 80 = +0.4 weighted score)

Ship 10 v1 endpoints. API keys exist. Internal routes handle all logic. Thin wrappers + rate limiting + docs page. Unlocks Zapier/Make integrations.

### 3. Chatbot Decision Trees (65 -> 80 = +0.6 weighted score)

`chatbot_turn` node in workflow builder + `bot_dm_received` trigger + stateful conversation engine. Goes from "helpful chatbot" to "revenue-generating automation."

### 4. QR Code Lead Capture (20 -> 70 = +1.0 weighted score)

Trackable QR codes -> bot DM deep link -> auto-create contact + deal. Small feature, high competitive signal.

### 5. Task System Hardening (68 -> 82 = +0.5 weighted score)

Priority levels, recurring tasks, SLA tracking, completion metrics, one-click reminders via TG.

**Combined: +4.9 weighted -> 74.4.** Then TMA polish, lead qual, campaign analytics, and onboarding get us to 80+.

---

## Strategic Decisions

### DO pursue:
- TG Folder Sync — largest single score lever
- Public API — highest-weighted unbuilt category
- Chatbot flows — second highest AI gap
- QR lead capture — easy win, high signal
- Task system — practical gap that users feel

### DON'T pursue:
- 3rd-party CRM sync — webhook outbound covers 80% of value. Building HubSpot/Salesforce connectors is months of work for +2 weighted.
- Voice-to-Data — low value for text-based BD workflows. CRMChat has it but it's wt=2.
- WhatsApp/SMS — Telegram-first by design. Our omnichannel score (48) already beats CRMChat (30).

### STOP investing in:
- Email features — Gmail is good enough. Every hour on email is an hour not spent on folder sync (5x higher weighted impact). Park it.

---

## Score Projection

| Milestone | Score | Gap to #1 |
|-----------|-------|-----------|
| Current | 69.5 | -10.9 |
| + Folder Sync + QR | 73.2 | -7.2 |
| + API + Chatbot | 76.2 | -4.2 |
| + Tasks + TMA + Lead Qual | 79.0 | -1.4 |
| + Attribution + Onboarding | 80.5 | **Tied #1** |

---

## Bottom Line

We're 3rd, not 2nd. The gap to #1 is 10.9 points, not 5. But the path is clear: folder sync (+2.3), QR capture (+1.0), chatbot flows (+0.6), API (+0.4), tasks (+0.5) = 74.4 with 5 features. The rest is incremental polish to 80+.

Stop widening the product. Stop building email features. Win the Telegram war.
