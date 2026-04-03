# SupraCRM CPO Review v4 — Weighted Competitive Scorecard

**Date:** 2026-04-03 | **Weighted Score: 69.5/100** | **Rank: 3rd (just above Entergram)**

**Journey:** 32.5 (v1) -> 64 (v2) -> 73.4 (v3 estimated) -> **69.5 (v4 rigorous)**

> **Methodology change:** Previous scores (v2, v3) were estimated lifts on a self-assessed baseline. This v4 uses the same 30-category weighted framework as the `telegram_crm_ratings.xlsx` competitive benchmark. Every score is evidence-based from a deep codebase audit. The drop from ~75 to 69.5 isn't regression — it's honest measurement.

---

## Reviewer

**CPO persona:** 12+ years shipping CRMs at scale (HubSpot, Pipedrive, CRMChat). Deep expertise in Telegram-first GTM, automation, and BD workflows.

---

## Competitive Standings

| Rank | CRM | Weighted Score | Simple Avg |
|------|-----|---------------|------------|
| 1 | CRMChat | 80.4 | 78.9 |
| 2 | Respond.io | 72.0 | 72.7 |
| **3** | **SupraCRM** | **69.5** | **69.8** |
| 4 | Entergram | 68.7 | 66.4 |
| 5 | NetHunt CRM | 58.9 | 58.3 |
| 6 | Planfix | 55.6 | 54.1 |

**Gap to #1:** -10.9 weighted points. That's significant but closeable — the top 10 gaps are concentrated in a few fixable categories.

---

## Full 30-Category Scorecard

### Core CRM

| # | Category | Wt | SupraCRM | CRMChat | Entergram | Respond.io | Notes |
|---|----------|-----|----------|---------|-----------|------------|-------|
| 1 | Kanban Pipeline | 5 | **85** | 90 | 75 | 80 | Dual-view, drag-drop, 3 boards, saved views, AI sentiment overlay, bulk actions. Mature. Missing forecasting visualization. |
| 2 | Contact/Lead Mgmt | 5 | **78** | 80 | 78 | 90 | Lifecycle stages, engagement scoring, company linkage, TG identity. Missing: unified activity timeline, smart lists, enrichment from external sources. |
| 3 | Deal Tracking | 4 | **86** | 88 | 72 | 82 | Full detail panel (965 lines), stage history, custom fields, AI sentiment, notes, docs. Missing: probability-weighted forecasting. |
| 4 | Task Assignment | 4 | **68** | 85 | 65 | 78 | Tasks in TMA + deal detail. Daily digest cron. Missing: priority levels, recurring tasks, SLA tracking, completion metrics. Significant gap vs CRMChat. |
| 5 | Custom Fields | 3 | **82** | 75 | 85 | 80 | Deals + contacts + groups all have custom fields. 6+ field types, position ordering, required flag. Ahead of CRMChat here. |
| 6 | Duplicate Detection | 2 | **75** | 78 | 60 | 70 | Multi-signal algorithm (email, TG, phone, name fuzzy), confidence scoring, merge preview. Solid. |

### Telegram-Native

| # | Category | Wt | SupraCRM | CRMChat | Entergram | Respond.io | Notes |
|---|----------|-----|----------|---------|-----------|------------|-------|
| 7 | TG Integration Depth | 5 | **90** | 95 | 92 | 65 | GramJS + Grammy + Bot API. Conversation timeline in deals with reply. Zero-knowledge sessions. Multi-bot. Near best-in-class. |
| 8 | Multi-Account Mgmt | 5 | **70** | 80 | 95 | 55 | Multi-bot registry (10+ bots) with encrypted tokens. Missing: cross-bot unified dashboard, per-account switching UI, multi-personal-account orchestration. |
| 9 | TG Folder Sync | 4 | **15** | 90 | 70 | 30 | **Not implemented.** MTProto client exists but folder API not wired. This is a 300-point weighted gap vs CRMChat — the single biggest drag on our score. |
| 10 | Personal Account | 4 | **78** | 85 | 95 | 30 | GramJS personal auth with QR + phone code + 2FA. Zero-knowledge encryption. Missing: multi-device sync. |
| 11 | Group Monitoring | 3 | **80** | 75 | 80 | 45 | Health classification, engagement tiers, member stats, slug tagging, AI summaries. Ahead of CRMChat. |
| 12 | Mini-App / TMA | 4 | **78** | 92 | 65 | 35 | 10 pages: deals, contacts, tasks, AI chat, broadcasts, inbox, apply. Push notifications. Missing: offline, gestures, native TG keyboard integration. |

### Outreach & Marketing

| # | Category | Wt | SupraCRM | CRMChat | Entergram | Respond.io | Notes |
|---|----------|-----|----------|---------|-----------|------------|-------|
| 13 | Broadcast Messaging | 4 | **80** | 82 | 88 | 85 | Slug targeting with AND/OR, scheduling, merge variables, A/B analytics, delivery tracking. Near parity with CRMChat. |
| 14 | Outreach Sequences | 4 | **78** | 88 | 60 | 75 | Multi-step with branching, drip triggers, workers. Two systems (/outreach + /drip) create confusion. No visual sequence builder. |
| 15 | Personalization | 3 | **74** | 80 | 78 | 82 | `{{var}}` substitution with `{{var|default}}` fallbacks. Missing: conditional blocks, dynamic content, loops. |
| 16 | QR Code Lead Capture | 2 | **20** | 85 | 55 | 70 | Only QR for TG auth login. No lead capture QR generation, no tracking, no event deep links. |
| 17 | Campaign Analytics | 3 | **68** | 70 | 65 | 85 | Broadcast delivery + sequence completion tracking. Missing: multi-touch attribution, ROI calculation, funnel visualization. |

### AI & Automation

| # | Category | Wt | SupraCRM | CRMChat | Entergram | Respond.io | Notes |
|---|----------|-----|----------|---------|-----------|------------|-------|
| 18 | AI Agent / Chatbot | 4 | **65** | 78 | 40 | 90 | Claude-powered on every page, per-page context, qualification extraction. No decision trees, no intent classification, no structured flows. |
| 19 | AI Lead Qualification | 3 | **58** | 75 | 35 | 85 | Engagement scoring + sentiment analysis. Auto-qualify config exists but auto-deal creation incomplete. No BANT/CHAMP scoring, no ML model. |
| 20 | Workflow Automation | 4 | **80** | 60 | 50 | 92 | React Flow with 18+ triggers, 18+ actions, templates, execution history. **Best-in-class vs CRMChat** (+80 weighted advantage). |
| 21 | Voice-to-Data | 2 | **5** | 80 | 30 | 75 | Not implemented. CRMChat has voice note transcription to CRM fields. |
| 22 | AI Summaries | 3 | **82** | 65 | 35 | 82 | Claude-powered deal + group summaries, sentiment analysis, health scores, momentum tracking. **Ahead of CRMChat** (+51 weighted). |

### Integrations

| # | Category | Wt | SupraCRM | CRMChat | Entergram | Respond.io | Notes |
|---|----------|-----|----------|---------|-----------|------------|-------|
| 23 | 3rd-Party CRM Sync | 3 | **10** | 82 | 40 | 85 | Not implemented. No HubSpot, Salesforce, or Pipedrive connectors. Webhooks exist but no bidirectional sync. |
| 24 | Zapier / API Access | 3 | **65** | 85 | 50 | 90 | API key management exists. Webhook system exists. Missing: v1 REST endpoints, rate limiting, API docs, Zapier native connector. |
| 25 | Omnichannel | 2 | **48** | 30 | 25 | 95 | TG + Gmail + Slack + Google Calendar. Ahead of CRMChat (who is TG-only). But behind Respond.io's full channel coverage. |

### Privacy, Security & UX

| # | Category | Wt | SupraCRM | CRMChat | Entergram | Respond.io | Notes |
|---|----------|-----|----------|---------|-----------|------------|-------|
| 26 | Privacy | 3 | **85** | 70 | 95 | 45 | Zero-knowledge TG sessions, AES-256-GCM, device-bound keys, retention policies, auto-purge. **Ahead of CRMChat** (+45 weighted). |
| 27 | GDPR / Compliance | 2 | **78** | 65 | 90 | 80 | Data deletion cascade, scope control, audit logging, admin approval. **Ahead of CRMChat** (+26 weighted). |
| 28 | UI/UX Quality | 4 | **80** | 82 | 75 | 85 | Consistent Tailwind + shadcn/ui, dark mode, toast notifications, keyboard nav. Near parity. |
| 29 | Mobile Experience | 3 | **76** | 88 | 70 | 80 | TMA with 10 pages. Missing: offline, gestures, native TG features. CRMChat runs natively as mini-app — hard to beat. |
| 30 | Onboarding Speed | 3 | **72** | 90 | 80 | 60 | QR login, setup wizard, sample data. CRMChat's folder sync means instant pipeline — we can't match that without folder sync. |

---

## The Math: How to Close the 10.9-Point Gap

### Top 10 Gaps by Weighted Impact

| Rank | Category | Our Score | CRMChat | Wt | Weighted Gap | Achievable? |
|------|----------|-----------|---------|-----|-------------|-------------|
| 1 | **TG Folder Sync** | 15 | 90 | 4 | -300 | Yes — MTProto client exists, need folder API |
| 2 | 3rd-Party CRM Sync | 10 | 82 | 3 | -216 | Partial — webhook outbound is 80% of value |
| 3 | Voice-to-Data | 5 | 80 | 2 | -150 | Skip — low value for text-based BD workflows |
| 4 | QR Code Lead Capture | 20 | 85 | 2 | -130 | Yes — small feature, high signal |
| 5 | Task Assignment | 68 | 85 | 4 | -68 | Yes — add priorities, recurring, completion tracking |
| 6 | Zapier/API Access | 65 | 85 | 3 | -60 | Yes — ship v1 REST endpoints |
| 7 | Mini-App / TMA | 78 | 92 | 4 | -56 | Partial — offline + gestures close half the gap |
| 8 | Onboarding Speed | 72 | 90 | 3 | -54 | Yes — folder sync IS onboarding (linked to #1) |
| 9 | AI Chatbot | 65 | 78 | 4 | -52 | Yes — chatbot decision trees |
| 10 | AI Lead Qual | 58 | 75 | 3 | -51 | Yes — complete auto-deal creation + scoring |

### Our Advantages (Defend These)

| Category | Our Score | CRMChat | Wt | Weighted Advantage |
|----------|-----------|---------|-----|-------------------|
| **Workflow Automation** | 80 | 60 | 4 | +80 |
| **AI Summaries/Sentiment** | 82 | 65 | 3 | +51 |
| **Privacy** | 85 | 70 | 3 | +45 |
| Omnichannel | 48 | 30 | 2 | +36 |
| GDPR/Compliance | 78 | 65 | 2 | +26 |
| Custom Fields | 82 | 75 | 3 | +21 |
| Group Monitoring | 80 | 75 | 3 | +15 |

**Total advantage: +274 weighted points. Total gap: -1,137 weighted points.**

---

## What Changed Since v3 Review (2026-03-30)

**Built since v3:**
- Full Gmail client (compose, threads, groups, sequences, side-by-side reply)
- Zero-knowledge TG sessions (client-side encryption, device-bound keys)
- Company records with contact linkage
- Email groups/folders with auto-routing
- TG chat groups for conversation organization
- Multiple security hardening passes
- Encryption key versioning

**What DIDN'T improve:**
- TG Folder Sync (still 15/100 — biggest single gap)
- Public API (still no v1 routes — API keys exist but nothing to call)
- Chatbot decision trees (still free-form only)
- Voice-to-Data (still 0, intentionally skipped)
- 3rd-party CRM sync (still 0)

**The honest truth:** We shipped a lot of email features that don't move the Telegram CRM competitive score. Gmail integration is table stakes for CRM, not a differentiator in this niche. The categories that matter most (TG Folder Sync wt=4, Multi-Account wt=5, Mini-App wt=4) didn't improve.

---

## CPO Directive: The 5 Moves That Close the Gap

### Move 1: TG Folder Sync (15 -> 75 = +240 weighted impact)

The single highest-ROI feature. MTProto client exists. Folder API is a few method calls. Map slugs to folders, sync on change. This alone is worth +2.3 weighted points on the total score.

### Move 2: Public API + Webhooks (65 -> 80 = +45 weighted impact)

Ship 10 v1 REST endpoints. API keys already exist. Internal routes already handle all logic. This is thin wrapper work. Add rate limiting and a docs page. Unlocks Zapier/Make.

### Move 3: Chatbot Decision Trees (65 -> 80 = +60 weighted impact)

Add `chatbot_turn` node to workflow builder. Wire `bot_dm_received` trigger. Stateful conversation engine. Gets us from "helpful chatbot" to "revenue-generating automation."

### Move 4: QR Code Lead Capture (20 -> 70 = +100 weighted impact)

Generate trackable QR codes that deep-link to bot DM with pre-filled context. Scan at events -> auto-create contact + deal. Small feature, high competitive signal.

### Move 5: Task System Hardening (68 -> 82 = +56 weighted impact)

Add priority levels, recurring tasks, SLA tracking, completion metrics. The task system exists but is thin compared to CRMChat's one-click reminders + daily digest.

**Combined impact of all 5 moves: +501 weighted / 103 total weight = +4.9 weighted score -> 74.4**

To reach 80+, also need: TMA polish (+1), onboarding improvement (+0.5), lead qualification completion (+0.5), campaign analytics (+0.5), and sequence consolidation (+0.5).

---

## Score Projection (Rigorous)

| Milestone | Score | Delivers | Gap to #1 |
|-----------|-------|----------|-----------|
| Current | 69.5 | — | -10.9 |
| + Folder Sync + QR | 73.2 | TG folders, QR lead capture | -7.2 |
| + API + Chatbot | 76.2 | v1 REST, decision trees | -4.2 |
| + Tasks + TMA + Lead Qual | 79.0 | Task system, offline TMA, auto-scoring | -1.4 |
| + Campaign Attribution + Onboarding | 80.5 | ROI tracking, folder-based onboarding | **Tied #1** |

---

## Bottom Line

Previous reviews overestimated our score by ~5 points. We're at 69.5, not 75. The gap to #1 is 10.9 points, not 5.5.

But the math shows a clear path. TG Folder Sync alone is worth +2.3 points. The top 5 moves together are worth +4.9 points. With focused execution on the highest-weighted gaps (folder sync, API, chatbot, QR, tasks), reaching 80+ is achievable.

**Stop building email features.** They don't move the score. Every hour spent on Gmail is an hour not spent on folder sync, which is worth 5x more in competitive terms. The email track is good enough — park it and win the Telegram war.
