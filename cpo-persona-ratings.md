# CPO Persona Competitive Review of SupraCRM
**Date:** 2026-03-20 | **Status:** Best rating analysis to date

---

## Methodology

5 CPO personas were constructed from real product leaders (where identifiable) and product philosophy of each competing Telegram CRM. Each persona independently rated SupraCRM on the same 30-category, weighted scale used in the `telegram_crm_ratings.xlsx` benchmark. Ratings are based on actual codebase audit — not marketing claims.

### Competitor Weighted Scores (from benchmark)

| CRM | Weighted Score | Rank |
|-----|---------------|------|
| CRMChat | 80.5 | 1 |
| Respond.io | 72.3 | 2 |
| Entergram | 66.6 | 3 |
| NetHunt CRM | 57.8 | 4 |
| Planfix | 55.5 | 5 |

---

## CPO Personas

### 1. CRMChat — "Alex K." (CPO/Co-founder)

- **Background:** Ex-BD lead at a Layer 1 blockchain. Built CRMChat because he was tired of switching between Telegram and Pipedrive. Web3-native, lives in Telegram 16 hours a day.
- **Philosophy:** "Telegram IS the CRM. Don't make people leave Telegram to do CRM."
- **Target market:** Web3 BD teams, crypto VCs, token projects managing deal flow through Telegram DMs and groups.
- **Core bias:** Telegram-native depth is everything. If you leave Telegram to do CRM work, you've already lost.
- **Would dismiss:** Tools that treat Telegram as "just another channel."

### 2. Entergram — "Marina V." (Head of Product)

- **Background:** Former ops lead at a digital marketing agency managing 12 client Telegram accounts. Privacy-obsessed — zero message storage policy.
- **Philosophy:** "One operator, many accounts." Product thinking centers on multi-tenant workspace design and delegation.
- **Target market:** Digital marketing agencies, community management firms, anyone running Telegram presence for multiple brands/clients.
- **Core bias:** Multi-account management and privacy are non-negotiable. Single-account tools are toys.
- **Would dismiss:** Single-account CRMs without workspace isolation.

### 3. Respond.io — "Gerardo S." (CEO/Co-founder)

- **Background:** Ex-IBM, ex-Google. Co-chairman of the AI Society of Hong Kong. Founded Respond.io (originally Rocketbots) in 2017. 10,000+ B2C businesses. Meta and TikTok preferred partner.
- **Philosophy:** "Conversation-Led Growth" — every message is a revenue opportunity. Unify all channels, let AI qualify and route, humans close.
- **Target market:** Mid-market to enterprise B2C companies with high message volume across multiple channels.
- **Core bias:** Omnichannel breadth, AI agent sophistication, and enterprise-grade automation. Single-channel tools are dead ends.
- **Would dismiss:** Telegram-only tools as "single channel plays."

### 4. NetHunt CRM — "Andrei P." (CEO/Co-founder)

- **Background:** Ukrainian SaaS founder since 2015. Built NetHunt to live inside Gmail. Won G2 "Highest User Adoption" award. Anti-complexity, pro-simplicity.
- **Philosophy:** "CRM should live where you already work — your inbox." Extreme ease-of-use over feature depth.
- **Target market:** SMBs and growing sales teams already in Google Workspace.
- **Core bias:** Time-to-value and ease of use above everything. If setup takes more than 10 minutes, you've failed.
- **Would dismiss:** Complex setup tools requiring separate apps or bot configuration.

### 5. Planfix — "Dmitry R." (Head of Product)

- **Background:** Enterprise process architect from the CIS market. 15+ years in business process management. 400+ configurable tools.
- **Philosophy:** "One platform that becomes YOUR platform." Extreme configurability is the moat. CRM is just one use case within a broader work management system.
- **Target market:** Mid-market companies needing project management + CRM + support + automation in one system.
- **Core bias:** Customization depth and cross-departmental workflow coverage. Single-purpose tools are tech debt.
- **Would dismiss:** Single-purpose CRMs as "another tool in the stack."

---

## SupraCRM Feature Audit Summary (Codebase Reality)

| Feature | Status | Internal Rating |
|---------|--------|----------------|
| Kanban Pipeline | Full | 84 |
| Contact Management | Full | 72 |
| Deal Tracking | Full | 77 |
| Task Assignment | Schema only | 17 |
| Custom Fields | Schema only | 15 |
| Telegram Integration | Partial | 59 |
| Multi-Account | Partial | 65 |
| Broadcasting | Full | 77 |
| Sequences | Partial | 50 |
| AI Features | Stub | 22 |
| Workflow Automation | Partial | 55 |
| Third-Party APIs | Minimal | 40 |
| Security/Privacy | Mixed | 62 |
| UI/UX | Good | 78 |
| Onboarding | Full | 81 |
| Analytics | Full | 79 |
| Notifications | Partial | 65 |
| Templates | Full | 82 |

---

## CPO Ratings of SupraCRM (30-Category Breakdown)

### Rating Key
- 90+ = Best-in-class
- 70-89 = Strong
- 50-69 = Adequate
- <50 = Weak/Missing

### CRMChat — Alex K.'s Review

> "Pipeline and dashboard analytics are solid. But Telegram integration is half-baked — stage-change notifications aren't wired, TMA has a React hook violation, no inline deal updates. Outreach game is nonexistent. AI is vaporware — database columns exist but nothing populates them. Security gaps (unguarded endpoints, no rate limiting) are a red flag."

| # | Category | Wt | Score | Reasoning |
|---|----------|-----|-------|-----------|
| 1 | Kanban Pipeline Management | 5 | 78 | Working drag-drop, 7 stages, board views. No inline TG updates. |
| 2 | Contact/Lead Management | 5 | 62 | Basic CRUD, no enrichment, no duplicate detection. |
| 3 | Deal Tracking & Stages | 4 | 72 | Stage history works, outcomes tracked. No smart filters. |
| 4 | Task Assignment & Reminders | 4 | 15 | Schema only. No reminder delivery, no daily digest. |
| 5 | Custom Fields & Properties | 3 | 12 | Database table exists, zero UI. |
| 6 | Duplicate Detection | 2 | 10 | Completely absent. |
| 7 | Native TG Integration Depth | 5 | 52 | Bot runs, groups monitored, but notifications unwired. Half-built. |
| 8 | Multi-Account Management | 5 | 25 | Single bot token. No multi-account TG. Email multi-connect exists. |
| 9 | TG Folder Sync | 4 | 0 | Not implemented. |
| 10 | Personal Account Support | 4 | 30 | MTProto client sessions table exists, minimal UI. |
| 11 | Group/Channel Monitoring | 3 | 65 | Group health (active/quiet/stale/dead), message counts. Decent. |
| 12 | Mini-App / In-TG UX | 4 | 20 | TMA exists but has a React hook violation. Not production-ready. |
| 13 | Broadcast Messaging | 4 | 72 | Rich editor, scheduling, slug filter, delivery tracking. Solid. |
| 14 | Outreach Sequence Automation | 4 | 15 | Email sequence schema only. No TG outreach. |
| 15 | Personalization / Merge Variables | 3 | 55 | Template variables work ({{deal_name}} etc). No A/B testing. |
| 16 | QR Code Lead Capture | 2 | 0 | Not implemented. |
| 17 | Campaign Analytics | 3 | 40 | Broadcast history with delivery stats. No conversion attribution. |
| 18 | AI Agent / Chatbot | 4 | 5 | Nothing implemented. Columns exist, no logic. |
| 19 | AI Lead Qualification | 3 | 5 | Not implemented. |
| 20 | Workflow Automation Builder | 4 | 35 | Engine file exists, automation rules table, partial UI. Not executing. |
| 21 | Voice-to-Data / NLP | 2 | 0 | Not implemented. |
| 22 | AI Summaries & Sentiment | 3 | 5 | Database columns only. No AI connected. |
| 23 | Third-Party CRM Sync | 3 | 10 | No HubSpot, Pipedrive, Salesforce sync. |
| 24 | Zapier / API Access | 3 | 5 | No public API, no Zapier, no webhooks out. |
| 25 | Omnichannel | 2 | 20 | Telegram + Email only. No WhatsApp, IG, etc. |
| 26 | Privacy (No Message Storage) | 3 | 60 | AES-256-GCM for tokens. But auth gaps undermine it. |
| 27 | GDPR / Compliance | 2 | 30 | No GDPR tooling, no data export/deletion workflows. |
| 28 | UI/UX Quality & Design | 4 | 72 | Clean dark-mode design, good components. No accessibility. |
| 29 | Mobile Experience | 3 | 55 | Responsive grid layouts. No dedicated mobile experience. TMA broken. |
| 30 | Onboarding Speed / Time-to-Value | 3 | 68 | Setup checklist exists. But no folder sync = manual setup. |

**Weighted Score: 35.3**

---

### Entergram — Marina V.'s Review

> "Clearly built for one team managing their own pipeline. Multi-account? Single bot token. Privacy posture undermined by auth gaps on critical endpoints. Slug-based access control is clever. Broadcast tool with slug filtering is well-designed. No GDPR compliance tooling."

| # | Category | Wt | Score | Reasoning |
|---|----------|-----|-------|-----------|
| 1 | Kanban Pipeline | 5 | 76 | Functional board. No per-account pipeline isolation. |
| 2 | Contact/Lead Management | 5 | 60 | Basic. No cross-account contact merge. |
| 3 | Deal Tracking | 4 | 70 | Works for single team. No multi-tenant views. |
| 4 | Task Assignment | 4 | 15 | Schema only. |
| 5 | Custom Fields | 3 | 12 | No UI. |
| 6 | Duplicate Detection | 2 | 8 | Absent. |
| 7 | Native TG Integration | 5 | 48 | Single bot. No personal account workflow. |
| 8 | Multi-Account Management | 5 | 20 | Single bot token architecture. Infrastructure for MTProto but unused. |
| 9 | TG Folder Sync | 4 | 0 | Missing. |
| 10 | Personal Account Support | 4 | 25 | Table exists, no working flow. |
| 11 | Group/Channel Monitoring | 3 | 62 | Health tracking works. No member engagement analysis. |
| 12 | Mini-App / In-TG UX | 4 | 18 | Broken TMA. |
| 13 | Broadcast Messaging | 4 | 70 | Good slug-based filtering. Single-account only. |
| 14 | Outreach Sequences | 4 | 12 | Stubbed. |
| 15 | Personalization | 3 | 50 | Template variables work. |
| 16 | QR Code Lead Capture | 2 | 0 | Missing. |
| 17 | Campaign Analytics | 3 | 38 | Basic delivery stats only. |
| 18 | AI Agent | 4 | 5 | Not built. |
| 19 | AI Lead Qualification | 3 | 5 | Not built. |
| 20 | Workflow Automation | 4 | 32 | Partially designed, not executing. |
| 21 | Voice-to-Data | 2 | 0 | Missing. |
| 22 | AI Summaries | 3 | 5 | Columns only. |
| 23 | Third-Party CRM Sync | 3 | 10 | None. |
| 24 | Zapier / API | 3 | 5 | None. |
| 25 | Omnichannel | 2 | 22 | TG + Email. |
| 26 | Privacy | 3 | 50 | Encryption good, auth gaps bad. No zero-storage policy. |
| 27 | GDPR | 2 | 25 | No compliance tooling. |
| 28 | UI/UX Quality | 4 | 70 | Clean but no accessibility. |
| 29 | Mobile Experience | 3 | 50 | Responsive but no native mobile. |
| 30 | Onboarding | 3 | 65 | Checklist is nice. Still requires manual setup. |

**Weighted Score: 32.4**

---

### Respond.io — Gerardo S.'s Review

> "SupraCRM is a Telegram-only internal tool for a small team. That's not a CRM — that's a project-specific pipeline tracker. No omnichannel, AI is empty PostgreSQL columns, no visual workflow builder, no public API. The pipeline UX is clean and the analytics dashboard is genuinely useful. But the security gaps are unacceptable even for internal use."

| # | Category | Wt | Score | Reasoning |
|---|----------|-----|-------|-----------|
| 1 | Kanban Pipeline | 5 | 75 | Functional. No cross-channel deal attribution. |
| 2 | Contact/Lead Management | 5 | 55 | No auto-merge, no lifecycle stages, no enrichment. |
| 3 | Deal Tracking | 4 | 68 | Stage history works. No AI scoring. |
| 4 | Task Assignment | 4 | 12 | Basically non-functional. |
| 5 | Custom Fields | 3 | 10 | Schema only. |
| 6 | Duplicate Detection | 2 | 8 | None. |
| 7 | Native TG Integration | 5 | 55 | Decent for TG-specific tool. Incomplete notifications. |
| 8 | Multi-Account | 5 | 22 | Irrelevant single-bot design. |
| 9 | TG Folder Sync | 4 | 0 | N/A. |
| 10 | Personal Account Support | 4 | 28 | MTProto infrastructure, not functional. |
| 11 | Group/Channel Monitoring | 3 | 60 | Basic health metrics. No engagement analytics. |
| 12 | Mini-App | 4 | 15 | Broken. |
| 13 | Broadcast | 4 | 68 | Works but single-channel. No cross-channel broadcast. |
| 14 | Outreach Sequences | 4 | 10 | Not functional. |
| 15 | Personalization | 3 | 48 | Basic merge variables. No A/B, no conditional blocks. |
| 16 | QR Code | 2 | 0 | None. |
| 17 | Campaign Analytics | 3 | 35 | Delivery stats only. No conversion attribution or benchmarks. |
| 18 | AI Agent | 4 | 3 | Nothing. |
| 19 | AI Lead Qualification | 3 | 3 | Nothing. |
| 20 | Workflow Automation | 4 | 20 | Skeleton. No visual builder, no branching. |
| 21 | Voice-to-Data | 2 | 0 | None. |
| 22 | AI Summaries | 3 | 3 | Empty columns. |
| 23 | Third-Party CRM Sync | 3 | 8 | No integrations. |
| 24 | Zapier / API | 3 | 5 | Nothing exposed. |
| 25 | Omnichannel | 2 | 12 | TG + Email. Catastrophically narrow. |
| 26 | Privacy | 3 | 55 | Token encryption good. Auth gaps critical. |
| 27 | GDPR | 2 | 28 | No compliance tooling. |
| 28 | UI/UX Quality | 4 | 74 | Clean design. No accessibility. No widget customization. |
| 29 | Mobile Experience | 3 | 50 | Responsive CSS. No native mobile. |
| 30 | Onboarding | 3 | 62 | Checklist works. Still manual process. |

**Weighted Score: 30.8**

---

### NetHunt CRM — Andrei P.'s Review

> "I appreciate the 'live where you work' philosophy. Setup checklist is a nice touch. But contact management is bare — no auto-enrichment, no duplicate detection, no lifecycle stages. Custom fields migration with no UI is a blocker. Email integration is well-architected. 6 high-severity security issues are negligence, not tech debt. Analytics dashboard is surprisingly good."

| # | Category | Wt | Score | Reasoning |
|---|----------|-----|-------|-----------|
| 1 | Kanban Pipeline | 5 | 80 | Clean drag-drop. Board type separation is smart. |
| 2 | Contact/Lead Management | 5 | 58 | CRUD only. No enrichment, no lifecycle stages. |
| 3 | Deal Tracking | 4 | 72 | History tracking good. Outcome tracking good. |
| 4 | Task Assignment | 4 | 14 | Not functional. |
| 5 | Custom Fields | 3 | 10 | Migration only, no UI = not shipped. |
| 6 | Duplicate Detection | 2 | 5 | Absent. Critical gap for any CRM. |
| 7 | Native TG Integration | 5 | 58 | Good for TG-specific tool. Bot needs work. |
| 8 | Multi-Account | 5 | 30 | Email multi-connect works. TG is single-bot. |
| 9 | TG Folder Sync | 4 | 0 | Not built. |
| 10 | Personal Account Support | 4 | 28 | Infrastructure only. |
| 11 | Group/Channel Monitoring | 3 | 62 | Health status works. |
| 12 | Mini-App | 4 | 18 | Broken. |
| 13 | Broadcast | 4 | 72 | Well-designed with slug filtering. |
| 14 | Outreach Sequences | 4 | 15 | Schema only. |
| 15 | Personalization | 3 | 52 | Template variables work. |
| 16 | QR Code | 2 | 0 | N/A. |
| 17 | Campaign Analytics | 3 | 42 | Basic stats. |
| 18 | AI Agent | 4 | 5 | Not built. |
| 19 | AI Lead Qualification | 3 | 5 | Not built. |
| 20 | Workflow Automation | 4 | 35 | Rules table + partial UI. Better than nothing. |
| 21 | Voice-to-Data | 2 | 0 | N/A. |
| 22 | AI Summaries | 3 | 5 | Not implemented. |
| 23 | Third-Party CRM Sync | 3 | 8 | None. |
| 24 | Zapier / API | 3 | 5 | None. |
| 25 | Omnichannel | 2 | 22 | TG + Email. Limited but appropriate for scope. |
| 26 | Privacy | 3 | 55 | AES good. Auth gaps unacceptable. |
| 27 | GDPR | 2 | 30 | No tooling. |
| 28 | UI/UX Quality | 4 | 76 | Clean, consistent dark-mode design. Good skeleton loaders. |
| 29 | Mobile Experience | 3 | 55 | Responsive layouts. Not mobile-first. |
| 30 | Onboarding | 3 | 72 | Checklist is above average for internal tools. |

**Weighted Score: 34.5**

---

### Planfix — Dmitry R.'s Review

> "SupraCRM is a single-purpose pipeline tool. Customization is nearly zero. No custom views, reports, dashboards, Gantt, calendar, or timeline. Workflow automation has good schema design but an empty engine. Missing entirely: task management, time tracking, project management, help desk, reporting builder. For what it is, the analytics dashboard punches above its weight."

| # | Category | Wt | Score | Reasoning |
|---|----------|-----|-------|-----------|
| 1 | Kanban Pipeline | 5 | 72 | Basic but functional. No custom views. |
| 2 | Contact/Lead Management | 5 | 55 | Minimal fields. No custom entities. |
| 3 | Deal Tracking | 4 | 65 | Stage history good. No cross-entity linking. |
| 4 | Task Assignment | 4 | 12 | No task system at all. Major gap. |
| 5 | Custom Fields | 3 | 8 | Schema only = not shipped. |
| 6 | Duplicate Detection | 2 | 5 | Missing. |
| 7 | Native TG Integration | 5 | 55 | Decent TG-specific features. |
| 8 | Multi-Account | 5 | 22 | Single-bot. |
| 9 | TG Folder Sync | 4 | 0 | Missing. |
| 10 | Personal Account Support | 4 | 25 | Not functional. |
| 11 | Group/Channel Monitoring | 3 | 58 | Basic health tracking. |
| 12 | Mini-App | 4 | 15 | Broken. |
| 13 | Broadcast | 4 | 68 | Functional, slug-filtered. |
| 14 | Outreach Sequences | 4 | 10 | Not built. |
| 15 | Personalization | 3 | 48 | Basic variables. |
| 16 | QR Code | 2 | 0 | N/A. |
| 17 | Campaign Analytics | 3 | 35 | Minimal. |
| 18 | AI Agent | 4 | 3 | Nothing. |
| 19 | AI Lead Qualification | 3 | 3 | Nothing. |
| 20 | Workflow Automation | 4 | 28 | Good schema, empty engine. Promising but non-functional. |
| 21 | Voice-to-Data | 2 | 0 | N/A. |
| 22 | AI Summaries | 3 | 3 | Empty. |
| 23 | Third-Party CRM Sync | 3 | 8 | None. |
| 24 | Zapier / API | 3 | 5 | None. |
| 25 | Omnichannel | 2 | 18 | TG + Email. |
| 26 | Privacy | 3 | 52 | Encryption OK, auth gaps critical. |
| 27 | GDPR | 2 | 25 | No compliance tooling. |
| 28 | UI/UX Quality | 4 | 70 | Clean but inflexible. No custom dashboards. |
| 29 | Mobile Experience | 3 | 48 | Responsive but not mobile-first. |
| 30 | Onboarding | 3 | 60 | Checklist exists. Manual process. |

**Weighted Score: 29.7**

---

## Final Comparison

| CRM | Their Own Score | Score They Give SupraCRM | Gap |
|-----|----------------|--------------------------|-----|
| **CRMChat** | 80.5 | 35.3 | -45.2 |
| **Respond.io** | 72.3 | 30.8 | -41.5 |
| **Entergram** | 66.6 | 32.4 | -34.2 |
| **NetHunt CRM** | 57.8 | 34.5 | -23.3 |
| **Planfix** | 55.5 | 29.7 | -25.8 |

**SupraCRM Average Score (across all 5 reviewers): 32.5 / 100**

---

## Consensus: Where SupraCRM Is Strong

| Category | Avg Score | Why |
|----------|-----------|-----|
| Kanban Pipeline | 76.2 | Working drag-drop, board types, clean UX |
| UI/UX Quality | 72.4 | Polished dark-mode design system |
| Broadcast Messaging | 70.0 | Slug filtering, scheduling, delivery tracking |
| Deal Tracking | 69.4 | Stage history, outcomes, weighted value |
| Onboarding | 65.4 | Auto-hiding setup checklist |

## Consensus: Where SupraCRM Gets Destroyed

| Category | Avg Score | Why |
|----------|-----------|-----|
| AI (all categories) | 3-5 | Database columns exist, nothing computes |
| Custom Fields | 10.4 | Migration only, no UI |
| Task Assignment | 13.6 | Schema-only, no delivery |
| Duplicate Detection | 7.2 | Completely absent |
| QR Code Lead Capture | 0 | Not built |
| TG Folder Sync | 0 | Not built |
| Voice-to-Data | 0 | Not built |
| Zapier / API | 5.0 | Nothing exposed |
| Third-Party CRM Sync | 8.8 | No integrations |

---

## Top 5 Quick Wins to Close the Gap

1. **Fix 6 security holes** — auth guards on contact/deal endpoints, rate limiting, webhook validation
2. **Ship custom fields UI** — table exists, just need the frontend builder
3. **Wire stage-change notifications** — bot handler exists, just needs the trigger connection
4. **Build duplicate detection** — flag existing contacts before creating new entries
5. **Connect an LLM** — populate deal summaries, health scores, and sentiment from conversation data

---

## Scoring Methodology

- Scores: 1-100 scale. 90+ = Best-in-class. 70-89 = Strong. 50-69 = Adequate. <50 = Weak/Missing.
- Weights: 1-5 (5 = critical for Telegram-first CRM use case).
- Weighted score = Sum(score x weight) / Sum(weight).
- Ratings based on actual SupraCRM codebase audit (19 migrations, 46 components, 30+ API routes, 20+ lib modules).
- Each CPO persona rated through the lens of their product's competitive strengths and biases.
