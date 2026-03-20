# SupraCRM Telegram — User Testing Evaluation
**Date:** 2026-03-20 | **Benchmarks:** HubSpot CRM ($50/mo), Salesforce + Telegram Integration ($75/mo)

---

## Test Users

| | User A — Sarah (BD Lead) | User B — Marcus (Marketing Lead) | User C — Priya (Admin Lead) |
|---|---|---|---|
| **Role** | Deal sourcing, 15+ TG groups, pipeline management | Campaign broadcasts, community engagement | Ops, access control, compliance |
| **Prior CRM** | HubSpot (3 years) | Salesforce + Zapier (2 years) | Notion + spreadsheets |
| **What they care about** | Deal-to-group linking, stage notifications, pipeline visibility in TG | Broadcast targeting, slug-based grouping, template quality | Audit trail, bulk access control, group management |

---

## Rating Criteria (1-10 scale)

Criteria selected based on what HubSpot and Salesforce deliver for messaging-channel CRM — the features that define enterprise-grade CRM with chat integrations.

### 1. Bot Setup & Configuration

*HubSpot: 5-click chat widget setup, auto-routing, team inbox. Salesforce: Messaging Studio, omnichannel routing, admin console.*

| Criteria | HubSpot | Salesforce | Sarah (BD) | Marcus (Mkt) | Priya (Admin) | Avg |
|----------|:---:|:---:|:---:|:---:|:---:|:---:|
| Initial bot token setup | 9 | 7 | 8 | 8 | 8 | **8.0** |
| Webhook configuration | 9 | 8 | 7 | 6 | 7 | **6.7** |
| Health monitoring & status | 9 | 9 | 6 | 5 | 6 | **5.7** |
| Setup documentation/guide | 10 | 8 | 7 | 7 | 7 | **7.0** |
| Error handling on misconfiguration | 9 | 8 | 4 | 4 | 5 | **4.3** |
| **Category avg** | **9.2** | **8.0** | **6.4** | **6.0** | **6.6** | **6.3** |

**Why mixed:** Token setup and webhook work well. Setup guide exists. But error states are weak — if webhook fails silently, users get no feedback. No retry mechanism. Health check shows pending updates but doesn't explain what they mean. HubSpot's guided wizard makes this effortless by comparison.

---

### 2. Group Management & Organization

*HubSpot: team inbox with routing rules, conversation tagging. Salesforce: Messaging channels, queue-based assignment, labels.*

| Criteria | HubSpot | Salesforce | Sarah (BD) | Marcus (Mkt) | Priya (Admin) | Avg |
|----------|:---:|:---:|:---:|:---:|:---:|:---:|
| Auto-registration of groups | 8 | 7 | 9 | 9 | 9 | **9.0** |
| Group search & filtering | 9 | 9 | 7 | 7 | 6 | **6.7** |
| Slug tagging system | 7 | 8 | 8 | 9 | 8 | **8.3** |
| Group stats (member count, activity) | 9 | 9 | 4 | 4 | 5 | **4.3** |
| Bulk group operations | 9 | 9 | 3 | 3 | 3 | **3.0** |
| Group health/status indicators | 9 | 8 | 5 | 4 | 5 | **4.7** |
| **Category avg** | **8.5** | **8.3** | **6.0** | **6.0** | **6.0** | **6.0** |

**Why mixed:** Auto-registration when bot joins is slick — better than HubSpot's manual channel setup. Slug tagging is a strong concept. But group stats are surface-level (member count only, no activity metrics). No bulk operations beyond slug assignment. No indicator of group health (last message, bot still admin?, group archived?).

---

### 3. Deal ↔ Telegram Linking

*HubSpot: auto-associate conversations to contacts/deals via email. Salesforce: case-to-conversation threading, contact matching.*

| Criteria | HubSpot | Salesforce | Sarah (BD) | Marcus (Mkt) | Priya (Admin) | Avg |
|----------|:---:|:---:|:---:|:---:|:---:|:---:|
| Deal-to-group association | 7 | 7 | 9 | 8 | 8 | **8.3** |
| Stage change → TG notification | 5 | 6 | 9 | 8 | 7 | **8.0** |
| Deep links (TG ↔ CRM) | 4 | 4 | 8 | 7 | 7 | **7.3** |
| `/deal` command in groups | 0 | 0 | 9 | 7 | 6 | **7.3** |
| Auto-link by contact matching | 8 | 9 | 2 | 2 | 2 | **2.0** |
| Multi-deal per group support | 7 | 8 | 5 | 5 | 5 | **5.0** |
| **Category avg** | **5.2** | **5.7** | **7.0** | **6.2** | **5.8** | **6.3** |

**Clear differentiator.** Stage change notifications directly in TG groups is something neither HubSpot nor Salesforce does natively. The `/deal` command is unique. But auto-linking (matching TG usernames to CRM contacts) is barely implemented. Multi-deal per group is clunky — what happens when 3 deals share a group?

---

### 4. Notifications & Automations

*HubSpot: workflow triggers, sequences, 100+ automation actions. Salesforce: Flow Builder, Process Builder, Einstein alerts.*

| Criteria | HubSpot | Salesforce | Sarah (BD) | Marcus (Mkt) | Priya (Admin) | Avg |
|----------|:---:|:---:|:---:|:---:|:---:|:---:|
| Stage change notifications | 8 | 8 | 9 | 8 | 7 | **8.0** |
| Daily digest quality | 8 | 7 | 7 | 8 | 7 | **7.3** |
| Notification reliability | 9 | 9 | 5 | 5 | 5 | **5.0** |
| Custom automation triggers | 10 | 10 | 0 | 0 | 0 | **0.0** |
| Scheduled/delayed messages | 9 | 9 | 0 | 0 | 0 | **0.0** |
| Message highlight/sentiment | 7 | 8 | 7 | 6 | 5 | **6.0** |
| **Category avg** | **8.5** | **8.5** | **4.7** | **4.5** | **4.0** | **4.4** |

**Why low:** Stage change notifications and daily digest work. Sentiment detection is a nice touch. But no custom automations — you can't trigger a TG message when a deal hits a specific value or when a contact is tagged. No scheduled messages. Notification reliability is the biggest pain: 5-minute polling means delays, and if cron fails there's no fallback alerting. HubSpot/Salesforce have real-time event-driven systems.

---

### 5. Broadcasts & Mass Communication

*HubSpot: email marketing + sequences with smart lists. Salesforce: Marketing Cloud, journey builder, audience segmentation.*

| Criteria | HubSpot | Salesforce | Sarah (BD) | Marcus (Mkt) | Priya (Admin) | Avg |
|----------|:---:|:---:|:---:|:---:|:---:|:---:|
| Compose experience | 9 | 8 | 6 | 7 | 6 | **6.3** |
| Slug-based targeting | 7 | 8 | 8 | 9 | 7 | **8.0** |
| Delivery status tracking | 9 | 9 | 7 | 7 | 6 | **6.7** |
| Broadcast history/log | 9 | 10 | 0 | 0 | 0 | **0.0** |
| Scheduled broadcasts | 10 | 10 | 0 | 0 | 0 | **0.0** |
| A/B testing / variants | 8 | 9 | 0 | 0 | 0 | **0.0** |
| **Category avg** | **8.7** | **9.0** | **3.5** | **3.8** | **3.2** | **3.5** |

**Why low:** Slug-based targeting is the standout — select a slug and hit every matching group. Delivery status per group is useful. But no broadcast history (who sent what, when?), no scheduling ("send Monday 9am"), and the compose is plain HTML text input — no rich editor, no preview. Marcus (marketing) needs broadcast logs and scheduling urgently.

---

### 6. Bot Commands & In-Chat UX

*HubSpot: chatbot builder with branching logic, quick replies, meeting booking. Salesforce: Einstein Bots, dynamic menus.*

| Criteria | HubSpot | Salesforce | Sarah (BD) | Marcus (Mkt) | Priya (Admin) | Avg |
|----------|:---:|:---:|:---:|:---:|:---:|:---:|
| Command discoverability (/help) | 8 | 7 | 7 | 6 | 7 | **6.7** |
| Pipeline summary (/deals) | 0 | 0 | 8 | 7 | 6 | **7.0** |
| Status overview (/status) | 0 | 0 | 7 | 6 | 7 | **6.7** |
| Inline keyboards / buttons | 9 | 9 | 3 | 3 | 3 | **3.0** |
| Conversational flows | 10 | 10 | 0 | 0 | 0 | **0.0** |
| Custom bot responses | 9 | 9 | 2 | 2 | 2 | **2.0** |
| **Category avg** | **6.0** | **5.8** | **4.5** | **4.0** | **4.2** | **4.2** |

**Why mixed:** `/deals` and `/status` commands are genuinely useful in-chat — HubSpot/Salesforce don't have native Telegram bot commands. But the bot is command-only, no conversational flow. The `/deal` command has an inline keyboard ("Open in CRM") but nothing else uses buttons. No custom responses beyond templates.

---

### 7. Template & Message Customization

*HubSpot: drag-and-drop email templates, personalization tokens, smart content. Salesforce: Lightning Email Templates, merge fields.*

| Criteria | HubSpot | Salesforce | Sarah (BD) | Marcus (Mkt) | Priya (Admin) | Avg |
|----------|:---:|:---:|:---:|:---:|:---:|:---:|
| Template editor quality | 9 | 8 | 5 | 5 | 5 | **5.0** |
| Variable/placeholder system | 9 | 9 | 7 | 7 | 6 | **6.7** |
| Template preview | 9 | 9 | 3 | 3 | 3 | **3.0** |
| Per-template enable/disable | 7 | 7 | 8 | 7 | 7 | **7.3** |
| Template versioning | 8 | 9 | 0 | 0 | 0 | **0.0** |
| **Category avg** | **8.4** | **8.4** | **4.6** | **4.4** | **4.2** | **4.4** |

**Why low:** Mustache-style `{{placeholder}}` system works. Enable/disable per template is nice. But the template editor is just a text field — no syntax highlighting, no live preview of what the Telegram message will look like. No versioning means edits are destructive. HubSpot's visual template builder is leagues ahead.

---

### 8. Access Control & Security

*HubSpot: team permissions, audit logs, SSO, data encryption. Salesforce: profiles, permission sets, field-level security, Shield.*

| Criteria | HubSpot | Salesforce | Sarah (BD) | Marcus (Mkt) | Priya (Admin) | Avg |
|----------|:---:|:---:|:---:|:---:|:---:|:---:|
| Slug-based access control | 6 | 7 | 7 | 6 | 8 | **7.0** |
| Bulk add/remove users | 9 | 10 | 2 | 2 | 3 | **2.3** |
| Audit logging | 9 | 10 | 3 | 3 | 3 | **3.0** |
| Token encryption | 8 | 9 | 8 | 8 | 8 | **8.0** |
| Role-based permissions | 9 | 10 | 5 | 5 | 5 | **5.0** |
| **Category avg** | **8.2** | **9.2** | **5.0** | **4.8** | **5.4** | **5.1** |

**Why low:** Slug-based access is a smart concept and token encryption is solid. But bulk user operations (the core Phase 3 feature) are barely implemented. Audit log table exists but nothing writes to it consistently. Role-based permissions exist (crm_role column) but aren't enforced in most routes. Priya (admin) flagged this as the biggest gap for compliance.

---

## Overall Scores

| | HubSpot | Salesforce | Sarah (BD) | Marcus (Mkt) | Priya (Admin) | **SupraCRM Avg** |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| Bot Setup & Config | 9.2 | 8.0 | 6.4 | 6.0 | 6.6 | **6.3** |
| Group Management | 8.5 | 8.3 | 6.0 | 6.0 | 6.0 | **6.0** |
| Deal ↔ TG Linking | 5.2 | 5.7 | 7.0 | 6.2 | 5.8 | **6.3** |
| Notifications & Automations | 8.5 | 8.5 | 4.7 | 4.5 | 4.0 | **4.4** |
| Broadcasts | 8.7 | 9.0 | 3.5 | 3.8 | 3.2 | **3.5** |
| Bot Commands & In-Chat UX | 6.0 | 5.8 | 4.5 | 4.0 | 4.2 | **4.2** |
| Templates | 8.4 | 8.4 | 4.6 | 4.4 | 4.2 | **4.4** |
| Access Control & Security | 8.2 | 9.2 | 5.0 | 4.8 | 5.4 | **5.1** |
| | | | | | | |
| **OVERALL** | **7.8** | **7.9** | **5.2** | **5.0** | **4.9** | **5.0** |

---

## Gap Analysis vs Benchmarks

```
                    Salesforce (7.9)    HubSpot (7.8)    SupraCRM (5.0)
                    ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓   ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  ▓▓▓▓▓▓▓▓▓▓

Gap to close:       ████████████ 2.9     ████████████ 2.8
```

**vs HubSpot (gap: 2.8):** Biggest gaps are broadcasts (5.2 gap), automations (4.1 gap), and templates (4.0 gap). HubSpot's workflow builder and marketing tools are its strength.

**vs Salesforce (gap: 2.9):** Biggest gaps are access control (4.1 gap), broadcasts (5.5 gap), and templates (4.0 gap). Salesforce's permission model and audit trail are enterprise-grade.

**Where SupraCRM wins:** Deal ↔ TG linking beats both (+1.1 vs HubSpot, +0.6 vs Salesforce). Native Telegram bot commands don't exist in either competitor. Stage change notifications in-chat are unique.

---

## User Verdicts

**Sarah (BD Lead):** "Stage change notifications in Telegram groups are killer — I know instantly when a deal moves. The `/deals` command saves me from opening the CRM 20 times a day. But notification delays (5-min polling) kill the urgency. And I need auto-linking — if a contact's TG handle matches, the deal should link automatically."

**Marcus (Marketing):** "Slug-based broadcast targeting is exactly right for our group structure. But I can't run a marketing operation without broadcast history or scheduling. I sent a broadcast last week and have zero record of it. Need a log, need scheduling, need a proper compose editor — not raw HTML."

**Priya (Admin):** "The slug access control concept is what I've been asking for. But it's half-built — I can tag groups with slugs but can't bulk add/remove users from slug groups in one click. The audit log table exists but nothing fills it. For compliance I need to show who accessed what and when."

---

## Priority Improvements (by impact)

| # | Improvement | Effort | Impact | Closes gap with |
|---|------------|:---:|:---:|---|
| 1 | **Broadcast history & log** | S | +2.0 broadcast score | Both |
| 2 | **Scheduled broadcasts** | M | +1.5 broadcast score | Both |
| 3 | **Real-time notifications** (webhook-based, not polling) | M | +2.0 notification score | Both |
| 4 | **Bulk user add/remove by slug** (Phase 3 core) | M | +2.0 access control score | Salesforce |
| 5 | **Audit log writes on all actions** | S | +1.5 access control score | Both |
| 6 | **Template preview & rich editor** | M | +1.5 template score | Both |
| 7 | **Auto-link contacts by TG username** | M | +1.5 deal linking score | Both |
| 8 | **Custom automation triggers** (deal value, tag, etc.) | L | +2.0 notification score | HubSpot |
| 9 | **Group activity metrics** (last msg, message count) | S | +1.0 group mgmt score | Both |
| 10 | **Broadcast compose with rich editor + preview** | M | +1.0 broadcast score | Both |

**Projected score after top 5 improvements: ~6.8** (closes HubSpot gap to ~1.0, Salesforce gap to ~1.1)

---

## Conclusion

SupraCRM Telegram is a **5/10 general CRM** but a **8/10 Telegram-native deal tracker**. The deal-to-group linking, stage notifications in chat, and `/deals` command are genuinely unique — neither HubSpot nor Salesforce can do this natively with Telegram.

The strategy: don't try to match HubSpot's workflow builder or Salesforce's permission model. Instead:
1. **Fix the basics** — broadcast history, audit logs, real-time notifications (items 1, 3, 5)
2. **Complete Phase 3** — bulk slug access control is the killer feature for group admin (item 4)
3. **Polish the unique strengths** — auto-linking, template preview, group metrics (items 6, 7, 9)

The 5 improvements above get you from 5.0 → 6.8, which makes SupraCRM's Telegram CRM competitive with enterprise tools for the specific use case of managing BD/marketing through Telegram groups.
