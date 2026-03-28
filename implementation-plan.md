# Implementation Plan: SupraCRM Remaining Features
**Date:** 2026-03-28 | **Status:** Draft for CPO Review

---

## Week 1: Quick Wins Sprint (7 items, ~27h total)

### Q1: Group Custom Fields (4h)

**What:** Add custom fields to TG groups, mirroring the existing deal/contact field pattern.

**Migration** (`061_group_custom_fields.sql`):
```sql
-- tg_group_fields: field definitions
-- tg_group_field_values: per-group values (group_id, field_id, value)
-- RLS + indexes on group_id
```

**API Routes:**
- `GET /api/groups/fields` → return all field definitions, ordered by position
- `PUT /api/groups/fields` → bulk upsert (same diff-and-reconcile pattern as `app/api/pipeline/fields/route.ts`)

**Integration Points:**
- `PATCH /api/groups/[id]` — accept `custom_fields: Record<fieldId, value>`, upsert to `tg_group_field_values`
- `GET /api/groups/[id]` — include `custom_fields` in response (same join pattern as `app/api/deals/[id]/route.ts:35-46`)

**UI:**
- Add custom fields section to `components/groups/group-detail-panel.tsx` — render based on field_type (text/number/select/date/url/textarea)
- Add field management to `app/settings/pipeline/page.tsx` or new `app/settings/groups/page.tsx` — same drag-reorder UI as deal fields

**Pattern Source:** Copy from `supabase/migrations/024_contact_custom_fields.sql` + `app/api/contacts/fields/route.ts`. Contacts are the simpler pattern (no board_type filtering).

---

### Q2: API Key Generation UI (4h)

**What:** Create `crm_api_keys` table and management UI. Unblocks Tier 1 Public API.

**Migration** (`062_api_keys.sql`):
```sql
create table crm_api_keys (
  id uuid primary key default gen_random_uuid(),
  name text not null,                              -- "Zapier Integration"
  key_prefix text not null,                        -- "sk_live_abc..." (first 8 chars, for display)
  key_hash text not null,                          -- SHA-256 hash of full key
  scopes text[] not null default '{"read"}',       -- read, write, admin
  rate_limit int not null default 100,             -- requests per minute
  last_used_at timestamptz,
  request_count bigint default 0,
  created_by uuid references auth.users(id),
  created_at timestamptz default now(),
  revoked_at timestamptz                           -- soft delete
);
```

**API Routes:**
- `GET /api/settings/api-keys` — list keys (show prefix only, never full key)
- `POST /api/settings/api-keys` — generate new key, return full key ONCE in response
- `DELETE /api/settings/api-keys` — soft-revoke (set `revoked_at`)
- Key generation: `crypto.randomBytes(32).toString('hex')` → prefix `sk_live_` + store SHA-256 hash

**UI:** New page `app/settings/api/page.tsx`:
- Table of existing keys: name, prefix, scopes, last used, request count
- "Generate Key" button → modal with name + scope checkboxes → show full key with copy button + "This will only be shown once" warning
- Revoke button per key

**Auth Guard Extension:** Add to `lib/auth-guard.ts`:
```typescript
export async function requireApiKey(): Promise<ApiKeyAuth | { error: NextResponse }> {
  // Check Authorization: Bearer sk_live_... header
  // Hash the key, query crm_api_keys WHERE key_hash = hash AND revoked_at IS NULL
  // Check rate limit (in-memory counter per key_prefix)
  // Update last_used_at, increment request_count
  // Return { keyId, userId: created_by, scopes }
}
```
This function is written now but only wired into v1 routes in Tier 1.

---

### Q3: Chatbot Flow Trigger in Workflow Builder (6h)

**What:** Add `bot_dm_received` trigger type so existing workflow engine can respond to DMs. Gets 60% of chatbot value.

**Workflow Registry** (`lib/workflow-registry.ts`):
```typescript
// Add to CRM_TRIGGERS array:
{
  subType: "bot_dm_received",
  label: "Bot DM Received",
  description: "Fires when a user sends a direct message to the bot",
  icon: "MessageCircle",
  configFields: [
    { key: "keyword_filter", label: "Keyword filter (optional)", type: "text" },
    { key: "bot_id", label: "Bot", type: "async_select", optionsUrl: "/api/bots" },
  ]
}
```

**Bot Handler** (`bot/handlers/messages.ts`):
- In the existing DM handling block (where `isDM` is detected), before calling `handleAIResponse()`:
```typescript
// Check for workflow triggers first
const triggered = await fireWorkflowTriggers("bot_dm_received", {
  chat_id: chatId,
  user_id: userId,
  user_name: userName,
  message_text: messageText,
  is_dm: true,
});
// If a workflow handled it, skip AI response
if (triggered > 0) return;
```

**Workflow Engine** (`lib/workflow-engine.ts`):
- In `triggerWorkflowsByEvent()`, the matching logic already handles generic trigger types. `bot_dm_received` works out of the box if registered.
- Keyword filter matching: add to trigger evaluation in engine's `evaluateTriggerMatch()`.

**No new tables needed.** Workflows already have trigger_type stored in `crm_workflows.trigger_type`. The React Flow builder already renders trigger nodes with config fields.

---

### Q4: Group Conversation Summaries (3h)

**What:** Claude-powered summary endpoint for group messages. Add "Summarize" button to group detail.

**API Route** — new `app/api/groups/[id]/summary/route.ts`:
```typescript
POST /api/groups/[id]/summary
// 1. Fetch last 50 messages from tg_group_messages WHERE tg_group_id = groupId
// 2. Call callClaudeForJson() or callClaudeForText() with:
//    "Summarize this Telegram group conversation. Key topics, decisions, action items."
// 3. Return { summary: string, message_count: number, timespan: { from, to } }
```

**Reuse:** Import `callClaudeForJson` from `lib/claude-api.ts`. Add a `callClaudeForText()` variant that returns raw text instead of JSON array.

**UI:** Add to `components/groups/group-detail-panel.tsx`:
- "Summarize" button with Sparkles icon
- Loading state → render summary in a card below group info
- Cache summary in component state (don't re-fetch on every render)

---

### Q5: Webhook Event Expansion (4h)

**What:** Add 5 new webhook event types to the existing webhook system. Events already fire internally — just emit to subscribers.

**New Events:**
| Event | Where It Fires | File to Modify |
|-------|---------------|---------------|
| `broadcast.sent` | After broadcast send loop completes | `app/api/broadcasts/send/route.ts` |
| `sequence.completed` | When enrollment status → completed | `bot/outreach-worker.ts` |
| `sla.breached` | When SLA breach detected | `bot/sla-poller.ts` |
| `drip.enrolled` | When contact enrolled in drip | `bot/drip-worker.ts` |
| `highlight.created` | When new highlight inserted | `bot/handlers/messages.ts` |

**Implementation per event:**
1. Add event name to `validEvents` array in `app/api/webhooks/route.ts:11-14`
2. At the fire point, call a shared `emitWebhookEvent(eventType, payload)` function
3. `emitWebhookEvent`: query `crm_webhooks` WHERE `events @> [eventType]` AND `is_active = true`, then POST payload to each URL with optional HMAC signing

**Shared Helper** — new `lib/webhook-emitter.ts`:
```typescript
export async function emitWebhookEvent(
  eventType: string,
  payload: Record<string, unknown>
): Promise<void> {
  // Query active webhooks subscribed to this event
  // For each: POST with JSON payload, log to crm_webhook_deliveries
  // Non-blocking (fire-and-forget, errors logged not thrown)
}
```

---

### Q6: TMA Offline Deal Cache (4h)

**What:** Service worker + localStorage for last-viewed deals in TMA. Show cached data offline.

**Service Worker** — new `public/tma-sw.js`:
- Cache strategy: NetworkFirst for API calls, CacheFirst for static assets
- Intercept `/api/deals/[id]` responses → store in IndexedDB keyed by deal ID
- On network failure → return cached response with `X-From-Cache: true` header

**TMA Deal Page** (`app/tma/deals/[id]/page.tsx`):
- On successful fetch, persist deal data to `localStorage` under `tma_deal_cache_{id}`
- On fetch failure, check localStorage → render cached data with "Offline" badge
- Add `<span className="rounded bg-amber-500/20 px-2 py-0.5 text-[10px] text-amber-400">Offline</span>` badge

**Registration** (`app/tma/layout.tsx`):
- Register service worker on TMA mount: `navigator.serviceWorker.register('/tma-sw.js')`
- Only register if `window.Telegram?.WebApp` exists (TMA context)

---

### Q7: Inbox Bot Filter (2h)

**What:** Add bot selector dropdown to unified inbox. Filter conversations by managing bot.

**API Change** (`app/api/inbox/route.ts`):
- Accept `?bot_id=UUID` query param
- When present: `supabase.from("tg_groups").select(...).eq("bot_id", botId)`
- When absent: return all groups (current behavior)

**UI Change** (`app/inbox/page.tsx`):
- Add state: `const [bots, setBots] = useState<{id: string, label: string}[]>([])`
- Add state: `const [selectedBotId, setSelectedBotId] = useState<string>("")`
- Fetch bots on mount: `fetch("/api/bots")` → setBots
- Add dropdown before search input:
  ```tsx
  <select value={selectedBotId} onChange={...}>
    <option value="">All Bots</option>
    {bots.map(b => <option key={b.id} value={b.id}>{b.label}</option>)}
  </select>
  ```
- Pass `&bot_id=${selectedBotId}` to inbox fetch
- Persist selection in `localStorage.getItem("inbox_bot_filter")`

---

## Weeks 2-3: Tier 1a — Public REST API

### Architecture

**Route structure:** `app/api/v1/{resource}/route.ts`

All v1 routes use `requireApiKey()` instead of `requireAuth()`. Thin wrappers around existing internal handlers with:
- Standard JSON envelope: `{ data: T, meta: { page, per_page, total } }`
- Pagination: `?page=1&per_page=25`
- Rate limiting: per API key, configurable (default 100 req/min)
- Versioned path: `/api/v1/` for future `/api/v2/` compatibility

### Endpoints

| Method | Path | Scopes | Wraps |
|--------|------|--------|-------|
| GET | `/api/v1/deals` | read | `app/api/deals/route.ts` GET |
| POST | `/api/v1/deals` | write | `app/api/deals/route.ts` POST |
| GET | `/api/v1/deals/:id` | read | `app/api/deals/[id]/route.ts` GET |
| PATCH | `/api/v1/deals/:id` | write | `app/api/deals/[id]/route.ts` PATCH |
| GET | `/api/v1/contacts` | read | `app/api/contacts/route.ts` GET |
| POST | `/api/v1/contacts` | write | `app/api/contacts/route.ts` POST |
| GET | `/api/v1/contacts/:id` | read | `app/api/contacts/[id]/route.ts` GET |
| GET | `/api/v1/groups` | read | `app/api/groups/route.ts` GET |
| POST | `/api/v1/broadcasts/send` | write | `app/api/broadcasts/send/route.ts` POST |
| GET | `/api/v1/pipeline/stages` | read | `app/api/pipeline/route.ts` GET |

### Rate Limiter

In-memory Map with sliding window:
```typescript
// lib/rate-limiter.ts
const windows = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(keyPrefix: string, limit: number): boolean {
  const now = Date.now();
  const window = windows.get(keyPrefix);
  if (!window || now > window.resetAt) {
    windows.set(keyPrefix, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (window.count >= limit) return false;
  window.count++;
  return true;
}
```

### API Docs Page

New `app/settings/api/docs/page.tsx`:
- Static page listing all endpoints with request/response examples
- Generated from a route definitions array (not auto-introspection — too complex)
- Include curl examples and code snippets (TypeScript, Python)

---

## Weeks 3-5: Tier 1b — AI Chatbot Decision Trees

### Data Model

**New table** (`063_chatbot_flows.sql`):
```sql
create table crm_chatbot_flows (
  id uuid primary key default gen_random_uuid(),
  bot_id uuid references crm_bots(id),
  name text not null,
  description text,
  trigger_keywords text[],           -- keywords that activate this flow
  nodes jsonb not null default '[]', -- React Flow nodes (same format as crm_workflows)
  edges jsonb not null default '[]', -- React Flow edges
  is_active boolean default false,
  fallback_to_ai boolean default true,  -- if no match, fall through to AI agent
  created_by uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table crm_chatbot_sessions (
  id uuid primary key default gen_random_uuid(),
  flow_id uuid references crm_chatbot_flows(id),
  tg_user_id bigint not null,
  tg_chat_id bigint not null,
  current_node_id text,              -- current position in flow
  context jsonb default '{}',        -- collected data from user responses
  status text default 'active' check (status in ('active', 'completed', 'abandoned', 'escalated')),
  started_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

### Node Types

Extend `lib/workflow-registry.ts` with chatbot-specific nodes:

| Node Type | Purpose | Config Fields |
|-----------|---------|--------------|
| `chatbot_message` | Send a message to the user | `message_template` (text with {{vars}}) |
| `chatbot_question` | Ask a question, wait for reply | `question_text`, `variable_name` (store answer), `timeout_minutes` |
| `chatbot_branch` | Branch on user's answer | `conditions[]` — keyword match, regex, or AI intent classification |
| `chatbot_qualify` | AI-powered qualification | `qualification_prompt`, `output_fields[]` (structured data extraction) |
| `chatbot_handoff` | Escalate to human | `notification_type` (dm/group), `assign_to` (role/user) |
| `chatbot_action` | Trigger CRM action | Reuse existing action nodes: `create_deal`, `update_contact`, `add_tag` |

### Flow Execution Engine

New `lib/chatbot-flow-engine.ts`:
```typescript
export async function processMessage(
  botId: string,
  userId: number,
  chatId: number,
  messageText: string
): Promise<{ handled: boolean; responses: string[] }> {
  // 1. Check for active session → resume at current_node_id
  // 2. If no session, check trigger_keywords across active flows
  // 3. If match, create session, execute first node
  // 4. For chatbot_question nodes: store answer in context, advance to next
  // 5. For chatbot_branch: evaluate conditions against answer, pick edge
  // 6. For chatbot_action: dispatch through crmActionExecutor()
  // 7. Return response messages to send
}
```

### Bot Integration

In `bot/handlers/messages.ts`, before AI response:
```typescript
if (isDM) {
  const flowResult = await processMessage(botId, userId, chatId, messageText);
  if (flowResult.handled) {
    for (const response of flowResult.responses) {
      await ctx.reply(response);
    }
    return;
  }
  // Fall through to AI agent if no flow matched
}
```

### Builder UI

Extend existing `app/automations/` or new `app/chatbot-flows/page.tsx`:
- List active flows with stats (sessions started, completed, escalated)
- React Flow builder (reuse `@supra/automation-builder` package)
- Preview/test mode: simulate conversation in sidebar
- Per-bot assignment: dropdown to select which bot runs this flow

---

## Weeks 5-6: Tier 1c — TG Folder Sync

### MTProto Extension

Add to `lib/telegram-client.ts`:
```typescript
export async function getDialogFilters(client: TelegramClient) {
  return await client.invoke(new Api.messages.GetDialogFilters());
}

export async function updateDialogFilter(
  client: TelegramClient,
  filterId: number,
  title: string,
  includePeers: Api.InputPeer[]
) {
  return await client.invoke(new Api.messages.UpdateDialogFilter({
    id: filterId,
    filter: new Api.DialogFilter({
      id: filterId,
      title,
      includePeers,
      pinnedPeers: [],
      excludePeers: [],
    }),
  }));
}

export async function deleteDialogFilter(client: TelegramClient, filterId: number) {
  return await client.invoke(new Api.messages.UpdateDialogFilter({ id: filterId }));
}
```

### Sync Logic

New `lib/folder-sync.ts`:
```typescript
export async function syncSlugToFolder(
  userId: string,
  slugName: string
): Promise<void> {
  // 1. Get connected MTProto client for user
  // 2. Fetch all groups with this slug from tg_group_slugs JOIN tg_groups
  // 3. Build InputPeer[] from telegram_group_id
  // 4. Check existing folders for one named "CRM: {slug}"
  // 5. If exists: update peers. If not: create with next available filter ID
}
```

### API Routes

- `POST /api/telegram-client/folders/sync` — trigger sync for a slug
- `GET /api/telegram-client/folders` — list user's TG folders (from MTProto)
- `DELETE /api/telegram-client/folders/:id` — remove a CRM-created folder

### UI

In `app/groups/page.tsx`, per slug tag:
- Toggle: "Sync to TG folder" (persisted in `tg_group_slugs.sync_to_folder` boolean column)
- Status indicator: last synced timestamp
- Manual "Sync Now" button

---

## Weeks 6-8: Tier 2

### Payment Tracking (L)

**Migration** (`064_payment_tracking.sql`):
```sql
create table crm_payment_tracking (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid references crm_deals(id),
  wallet_address text not null,
  chain text not null default 'supra',  -- supra, ethereum, bsc
  token text not null default 'USDT',
  expected_amount numeric,
  tx_hash text,
  status text default 'pending' check (status in ('pending', 'confirming', 'confirmed', 'failed')),
  confirmations int default 0,
  required_confirmations int default 6,
  confirmed_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz default now()
);
```

**Cron Worker** — new `bot/payment-poller.ts`:
- Runs every 60s
- Query pending payments
- For each: call chain RPC to check tx status
- On confirmation: update status, fire `payment.confirmed` webhook, auto-move deal stage

**Deal UI Extension:**
- Add "Payment" tab to deal detail panel
- Wallet address input, expected amount, token selector
- Transaction history with confirmation progress bar

### Enhanced Auto-Assignment (M)

**Migration** — add `deal_auto_assign` rule type to `crm_automation_rules`.

**Settings UI** — new section in `app/settings/automations/page.tsx`:
- Per board: select users in round-robin pool
- Capacity limit per user (max open deals)
- Fallback: if all at capacity, assign to board lead

**Integration:** Hook into `POST /api/deals` — after deal creation, before response:
```typescript
const assignee = await resolveAutoAssignment(deal.board_type);
if (assignee) {
  await supabase.from("crm_deals").update({ assigned_to: assignee.id }).eq("id", deal.id);
}
```

### Group Custom Fields (if not done in Q1)

Same spec as Q1 above. Included here as fallback if Week 1 runs over.

---

## Risk Mitigations

| Risk | Feature | Mitigation |
|------|---------|-----------|
| MTProto rate limits | Folder sync | Batch operations, queue with delays, sync at most once per 5 minutes per slug |
| Claude latency in chatbot | Decision trees | Response streaming, 5s timeout with fallback template, cache common paths |
| API key leakage | Public API | Hash at rest, show full key only once, auto-revoke after 90 days inactive |
| Chain reorgs | Payment tracking | Wait for N confirmations, idempotent stage transitions, revert on reorg detection |
| Stale service worker | TMA offline | Version the SW, force update on app load, clear cache on version mismatch |
