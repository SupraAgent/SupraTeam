# SupraCRM Remaining Plan: Path to #1 Telegram CRM
**Date:** 2026-03-28 | **Author:** Jon

---

## Current Position (Post Stages 1-4)

| Rank | CRM | Weighted Score |
|------|-----|---------------|
| 1 | CRMChat | 80.5 |
| 2 | Respond.io | 72.3 |
| 3 | Entergram | 66.6 |
| **2-3** | **SupraCRM** | **~74** |
| 5 | NetHunt CRM | 57.8 |
| 6 | Planfix | 55.5 |

**Journey:** 32.5 (v1) -> 64 (v2) -> ~74 (post Stages 1-4). We've passed Entergram. Likely passed Respond.io. Need +7 to beat CRMChat.

### Score Update Rationale

What we shipped in Stages 1-4 and prior P0/P1 work:

| Feature Shipped | Category Impact | Estimated Lift | Status |
|----------------|----------------|----------------|--------|
| TG conversation timeline in deal detail | #7 TG Integration (wt=5) | +5 | Done |
| Full TMA (tasks, AI chat, broadcasts, contacts, deals) | #12 Mini-App (wt=4), #29 Mobile (wt=3) | +4 | Done |
| Outreach sequence branching | #14 Outreach (wt=3) | +2 | Done |
| Bot drip sequences | #14 Outreach (wt=3), #20 Workflows (wt=2) | +2 | Done |
| Unified inbox | #8 Multi-Account (wt=3) | +2 | Done |
| Saved views + URL sync | #1 Kanban (wt=5), #28 UI/UX (wt=2) | +1 | Done |
| Engagement scoring | #19 AI Lead Qual (wt=4) | +1.5 | Done |
| SLA monitoring | #20 Workflows (wt=2) | +0.5 | Done |
| Broadcast A/B + analytics | #14 Outreach (wt=3) | +1 | Done |
| Smart reply suggestions | #22 AI Summaries (wt=3) | +0.5 | Done |
| Highlight auto-triage | #7 TG Integration (wt=5) | +0.5 | Done |
| Forecast analytics | #1 Kanban (wt=5) | +0.5 | Done |
| Send-time optimization | #14 Outreach (wt=3) | +0.5 | Done |
| AI conversation summaries | #22 AI Summaries (wt=3) | +1 | Done |
| Deal health + sentiment | #22 AI Summaries (wt=3) | +0.5 | Done |

**Conservative total lift: +10 over v2 baseline of 64 = ~74.**

Some of these were partially scored at v2 (e.g., basic outreach existed). Counting incremental lift only, not re-scoring from zero.

---

## What's Remaining to Reach #1

### The Gap: ~74 -> 81+

We need approximately +7 weighted points. Some P1 items are now done. Here's what's left, organized by ROI.

---

## Tier 1: High-ROI Remaining Features (Target: +4-5 points)

Ship all of Tier 1 to reach ~78-79.

| # | Feature | What It Is | Category | Lift | Size | Dependencies |
|---|---------|-----------|----------|------|------|-------------|
| 1 | **AI chatbot decision trees** | Configurable per-group/per-bot conversation flows. Not just Claude free-form -- structured decision trees that auto-qualify, auto-route, auto-respond based on user input. | #18 AI Agent (wt=4), #20 Workflows (wt=2) | +2-3 | L | `crm_ai_agent_config`, `crm_workflows`, `lib/workflow-engine.ts`. New "chatbot flow" node type in visual builder. |
| 2 | **Public REST API + API keys** | Authenticated external API for deals, contacts, groups, broadcasts. Foundation for Zapier/Make integrations. | #24 Zapier/API (wt=5) | +2-3 | M | `lib/auth-guard.ts` (add API key auth path), new `crm_api_keys` table, expose subset of existing handlers. |
| 3 | **TG folder sync** | Bidirectional sync between CRM slug tags and Telegram folder structure. Tag a group "bd" in CRM, it appears in the BD folder in Telegram. Requires MTProto folder API. | #9 Folders (wt=3) | +1-2 | M | `lib/telegram-client.ts` (MTProto client exists, folder API not implemented). `tg_group_slugs` for mapping. |

### Feature Details

**1. AI Chatbot Decision Trees**

The biggest remaining gap. The AI agent (`crm_ai_agent_config`) does free-form Claude conversations with escalation. The workflow builder does node-based automation. Neither does what CRMChat's chatbot does: structured conversation flows where each user response branches to a different next message.

Implementation path:
- New workflow node type: `chatbot_turn` -- displays message, waits for reply, branches on keyword/intent
- New trigger type: `bot_dm_received` -- fires when a user DMs the bot
- Connect to existing `crm_ai_conversations` table for history
- Render flows in the existing React Flow builder (already supports custom node types)
- Runtime: extend `bot/handlers/messages.ts` to check if a DM matches an active chatbot flow before falling through to free-form AI

Files to modify:
- `lib/workflow-registry.ts` -- register new node types
- `bot/handlers/messages.ts` -- DM routing to flow engine
- `app/automations/[id]/page.tsx` -- chatbot flow builder UI
- New: `lib/chatbot-flow-engine.ts` -- stateful conversation flow executor

**2. Public REST API**

The internal API routes already handle all CRUD. The work is:
- New table: `crm_api_keys` (hashed key, scopes, rate limit, created_by)
- Middleware: check `Authorization: Bearer sk_...` header, validate against `crm_api_keys`
- Rate limiting: per-key, stored in-memory or Redis
- Expose: `GET/POST /api/v1/deals`, `GET/POST /api/v1/contacts`, `POST /api/v1/broadcasts/send`, `GET /api/v1/groups`
- API docs page (auto-generated from route definitions)

Files to modify:
- `lib/auth-guard.ts` -- add `requireApiKey()` alongside `requireAuth()`
- New: `app/api/v1/` route tree (thin wrappers around existing handlers)
- New: `app/settings/api/page.tsx` -- API key management UI

**3. TG Folder Sync**

The MTProto client (`lib/telegram-client.ts`) already authenticates via GramJS with session caching. Folder operations need:
- `getDialogFilters()` -- list existing folders
- `updateDialogFilter()` -- create/update folders to match slug tags
- Cron or webhook trigger: when a slug is assigned/removed, update the folder

Files to modify:
- `lib/telegram-client.ts` -- add folder API methods
- New: `app/api/telegram-client/folders/route.ts`
- `app/groups/page.tsx` -- folder sync toggle per slug

---

## Tier 2: Medium-ROI Features (Target: +2-3 points)

Ship alongside or after Tier 1 to cross 81.

| # | Feature | What It Is | Category | Lift | Size | Dependencies |
|---|---------|-----------|----------|------|------|-------------|
| 4 | **Payment tracking (blockchain-native)** | Track USDT/USDC transfers linked to deals. Auto-move deals to "First Check Received" on payment confirmation. Query Supra L1 / EVM RPCs for transaction status. | #3 Deals (wt=5), #7 TG Integration (wt=5) | +1-2 | L | New: `crm_payment_tracking` table. Supra L1 RPC integration. Cron polls for confirmations. |
| 5 | **Custom fields on TG groups** | Groups currently have no custom fields. Allow teams to tag groups with structured metadata beyond slugs. | #5 Custom Fields (wt=3) | +0.5-1 | S | Mirror `crm_deal_fields`/`crm_deal_field_values` pattern. |
| 6 | **Auto-assignment rules (enhanced)** | Round-robin, by-tag, by-board, by-capacity. Deal-level auto-assignment on deal creation. | #4 Tasks (wt=3), #20 Workflows (wt=2) | +1 | M | `crm_automation_rules` table exists. New rule type: `deal_auto_assign`. |

### Feature Details

**4. Payment Tracking**

The unique moat feature. No other Telegram CRM tracks blockchain payments.
- New table: `crm_payment_tracking` (deal_id, wallet_address, chain, token, expected_amount, tx_hash, status, confirmed_at)
- Cron job: poll RPC endpoints for pending transactions. On confirmation, fire workflow trigger `payment.confirmed` and auto-move deal stage.
- UI: payment status badge on deal card, transaction history in deal detail.

L-sized because it requires external RPC integration, error handling for chain reorgs, and multi-chain support.

**5. Custom Fields on Groups**

The pattern exists twice already (`crm_deal_fields`, `crm_contact_fields`). Copy the migration, add fields management UI, render in group detail. Half-day work.

**6. Enhanced Auto-Assignment**

The auto-assign for group access exists but is slug-scoped. Deal auto-assignment doesn't exist. Implementation:
- Settings page: define assignment rules per board (round-robin among selected users, with capacity limit)
- On deal creation: check rules, assign, log
- Integrate with existing `crm_automation_rules` table

---

## Tier 3: Polish & Defensibility (Target: +1-2 points)

| # | Feature | What It Is | Lift | Size |
|---|---------|-----------|------|------|
| 7 | **Multi-workspace / white-label** | Separate data by workspace. If SupraCRM works for Supra BD, other L1/L2 teams want their own instance. | +0.5 | L |
| 8 | **Calendar timeline view** | Calendar page exists. Missing: Gantt-style deal timeline, drag-to-reschedule close dates. | +0.5 | M |
| 9 | **QR code deep-link lead capture** | QR codes that deep-link to bot DM with pre-filled context. Scan at events -> auto-create contact + deal. | +0.5 | S |
| 10 | **Group-level scheduled summaries** | Auto-generated daily/weekly group summaries pushed to a digest channel. Extend existing deal summary to group-level with cron. | +0.5 | S |
| 11 | **Advanced reporting** | Reports page exists. Missing: exportable PDF reports, custom metric builder, scheduled email reports. | +0.5 | M |

---

## Quick Wins (<1 day each, measurable impact)

Minimal code because infrastructure already exists. Just wiring or UI work.

| # | Quick Win | What to Do | Why It Matters | Hours |
|---|-----------|-----------|----------------|-------|
| Q1 | **Group custom fields** | Copy `crm_contact_fields` migration -> `crm_group_fields`. Add 3 UI components to group detail. | Closes "custom fields everywhere" gap. #5 Custom Fields (wt=3). | 4h |
| Q2 | **API key generation UI** | Add `crm_api_keys` table + `/settings/api/page.tsx` with key CRUD. Even before v1 API routes exist, key management signals API readiness. | Unblocks Tier 1 item #2. #24 Zapier/API (wt=5). | 4h |
| Q3 | **Chatbot flow trigger** | Add `bot_dm_received` trigger type to `lib/workflow-registry.ts`. Wire into `bot/handlers/messages.ts`. Existing workflow engine handles execution. | Gets 60% of chatbot value with 20% of effort. Auto-respond to DMs via existing workflow nodes. | 6h |
| Q4 | **Group conversation summaries** | Deal summary route exists. Create `/api/groups/[id]/summary` that queries `tg_group_messages` and summarizes via Claude. Add "Summarize" button to group detail. | Cheap AI feature that differentiates. Every CPO reviewer noticed this gap. | 3h |
| Q5 | **Webhook event expansion** | `crm_webhooks` supports 8 event types. Add: `broadcast.sent`, `sequence.completed`, `sla.breached`, `drip.enrolled`, `highlight.created`. Events already fire internally -- just emit to webhook subscribers. | Makes webhooks useful for integration. Bridges gap until public API ships. | 4h |
| Q6 | **TMA offline deal cache** | Service worker + localStorage cache for last-viewed deals in TMA. When offline, show cached data with "Offline" badge. | Mobile CRM must work in spotty connectivity. #29 Mobile (wt=3). | 4h |
| Q7 | **Inbox bot filter** | Unified inbox exists but shows all bots. Add bot selector dropdown from `crm_bots`. One filter, one query param. | Completes "unified inbox across bots" story. | 2h |

---

## Score Projection

| Milestone | Target Score | Key Deliverables | Status |
|-----------|-------------|-----------------|--------|
| Post Stages 1-4 | ~74 | Everything above | **Current** |
| + Quick Wins | ~76 | Q1-Q7 (1 week total) | Next |
| + Tier 1 | ~79-81 | AI chatbot flows, public API, folder sync | 3-4 weeks |
| + Tier 2 | ~82-83 | Payment tracking, auto-assign, group fields | 2-3 weeks |
| + Tier 3 | ~84-85 | White-label, calendar, QR, reporting | Ongoing |

**Critical path: Quick Wins (1 week) -> Tier 1 (3-4 weeks) -> ship.**

Tier 1 alone gets us to #1 or within striking distance. Tier 2 creates the sustainable moat. Tier 3 is polish for retention.

---

## Implementation Sequence

**Week 1: Quick Wins sprint**
- Q1 (group custom fields) + Q2 (API key UI) + Q7 (inbox bot filter) -- parallel, no dependencies
- Q3 (chatbot flow trigger) -- depends on workflow registry
- Q4 (group summaries) + Q5 (webhook expansion) -- parallel

**Weeks 2-3: Tier 1a -- Public API**
- Build `crm_api_keys` table + auth middleware
- Expose v1 routes for deals, contacts, groups, broadcasts
- API docs page

**Weeks 3-5: Tier 1b -- AI Chatbot Decision Trees**
- Design chatbot flow node types
- Build `chatbot_turn` workflow node
- Connect to bot DM handler
- Test with real qualification flows for BD team

**Week 5-6: Tier 1c -- TG Folder Sync**
- Implement MTProto folder API in `telegram-client.ts`
- Build sync logic (slug -> folder mapping)
- Add UI toggle

**Weeks 6-8: Tier 2**
- Payment tracking (parallel, needs RPC research)
- Enhanced auto-assignment rules
- Group custom fields (if not done in Quick Wins)

---

## Key Dependencies Map

```
Quick Wins (no deps, parallel)
    |-- Q2 (API key UI) --> Tier 1: Public API
    |-- Q3 (chatbot trigger) --> Tier 1: AI Chatbot Trees

Existing infra that Tier 1 depends on:
    |-- lib/workflow-registry.ts --> Chatbot nodes
    |-- lib/workflow-engine.ts --> Chatbot execution
    |-- lib/auth-guard.ts --> API key auth
    |-- lib/telegram-client.ts --> Folder sync
    |-- crm_webhooks (existing) --> Public API webhooks
    |-- bot/handlers/messages.ts --> Chatbot DM routing

Tier 2 dependencies:
    |-- Supra L1 RPC endpoint --> Payment tracking (external)
    |-- crm_deal_fields pattern --> Group custom fields
    |-- crm_automation_rules --> Auto-assignment
```

---

## Risk Register

| Risk | Impact | Mitigation |
|------|--------|-----------|
| MTProto folder API rate limits | Folder sync fails at scale | Batch operations, exponential backoff, sync queue |
| Claude API latency for chatbot flows | User-facing delay in bot responses | Stream responses, cache common Q&A pairs, fallback to template responses |
| API key security | Leaked keys = data breach | Hash keys at rest, scope-based permissions, key rotation UI, rate limiting |
| Payment tracking chain reorgs | False positive "payment confirmed" | Wait for N confirmations (configurable), idempotent stage transitions |
| Multi-workspace data isolation | Cross-tenant data leakage | RLS policies per workspace_id, test extensively before launch |

---

## What We Intentionally Skip

| Gap | Why We Skip |
|-----|-------------|
| Omnichannel (WhatsApp, IG, SMS) | Telegram-first by design. Not a weakness -- a focus. |
| Voice transcription | Low value for BD text-based workflows |
| HubSpot/Salesforce bidirectional sync | Webhook outbound + public API covers 80% of use cases |
| Full project management (Gantt, time tracking) | Different product for different market. Calendar view is enough. |

---

## Sources

- `strategic-roadmap.md` -- original competitive roadmap (v2 baseline: 64)
- `crm-north-star.md` -- CPO review with implementation stages
- PR #45 session log -- what shipped in Stages 1-4
- Codebase: 60 migrations, 50+ API routes, 8 TMA pages, 2 bot workers
