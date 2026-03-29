# Sherlock Audit Report -- SupraCRM

**Date:** 2026-03-28
**Scope:** Full codebase audit for bugs, cheats, lazy code, and security vulnerabilities
**Auditors:** 4 parallel Sherlock agents covering Pipeline/Deals, Contacts/TG, Auth/AI/Bot, Settings/Outreach/Inbox

---

## Totals

| Severity | Count |
|----------|-------|
| Critical | 10 |
| High | 12 |
| Medium | 20 |
| Low | 19 |
| **Total** | **61** |

---

## CRITICAL FINDINGS

### C1. Dev Auth Bypass Active Without Production Guard
**File:** `lib/auth.ts:31-33`, `lib/supabase/middleware.ts:44-45`
**Issue:** Client-side `AuthProvider` and middleware check for a `dev-auth=true` cookie with **no `NODE_ENV !== "production"` guard**. If `DEV_ACCESS_PASSWORD` is set in production (even accidentally), anyone who sets this cookie bypasses auth entirely. The server-side `auth-guard.ts` checks NODE_ENV, but client and middleware do not.
**Fix:** Add `NODE_ENV !== "production"` checks to all three locations, or remove dev auth from client entirely.

### C2. Deterministic Password for Telegram Users
**File:** `app/api/auth/telegram/route.ts:72`
**Issue:** Supabase account passwords are `tg_{telegramId}_{botToken.slice(0,16)}`. Anyone who obtains the bot token can compute passwords for ALL Telegram users and call `signInWithPassword` to impersonate them.
**Fix:** Use HMAC-derived secrets keyed on a separate server-side secret, or use custom JWT flow.

### C3. PostgREST Filter Injection via `.or()` Strings
**File:** `app/api/contacts/route.ts:20`, `app/api/contacts/duplicates/route.ts:71-74`
**Issue:** User-supplied search strings interpolated directly into PostgREST `.or()` filter expressions with zero sanitization. Injecting `,` and `.` lets attackers append arbitrary filter clauses.
**Fix:** Sanitize PostgREST metacharacters or switch to parameterized `.ilike()` calls.

### C4. No Authorization on Destructive Contact/Group Operations
**File:** `app/api/contacts/[id]/route.ts` (DELETE), `app/api/contacts/merge/route.ts`, `app/api/contacts/bulk-update/route.ts`, `app/api/groups/bulk/route.ts`
**Issue:** All use `requireAuth()` (logged-in check only). Any authenticated user can delete contacts, merge contacts, bulk-update, and archive groups. Compare with `kick/route.ts` which correctly uses `requireLeadRole()`.
**Fix:** Add `requireLeadRole()` on all destructive endpoints.

### C5. CSV Export Formula Injection (Deals + Contacts)
**File:** `app/api/deals/export/route.ts:34`, `app/api/contacts/export/route.ts:19-30`
**Issue:** Values wrapped in double quotes but never escaped. Fields starting with `=`, `+`, `-`, `@` become formula injection when opened in Excel/Google Sheets.
**Fix:** Escape `"` by doubling, prefix formula-dangerous characters with `'` or tab.

### C6. Unauthenticated Self-Fetch in Health Endpoint
**File:** `app/api/deals/health/route.ts:72-76`
**Issue:** GET handler calls `fetch()` to POST to itself before checking auth. The fetch carries no cookies, so POST runs without auth context. If `requireAuth()` has any fallback path, health recalculation runs unauthenticated.
**Fix:** Call recalculation logic directly as a shared function after auth.

### C7. Webhook PUT: Unvalidated Spread Allows Arbitrary Column Writes
**File:** `app/api/webhooks/route.ts:99`
**Issue:** `const { id, ...updates } = body` then `supabase.update(updates)`. Attacker controls all columns on `crm_webhooks`.
**Fix:** Explicit allowlist of updatable fields.

### C8. Webhook Secrets Stored in Plaintext
**File:** `app/api/webhooks/route.ts:79`
**Issue:** HMAC signing secrets stored as-is in DB. All other secrets use AES-256-GCM encryption.
**Fix:** Encrypt with `encryptToken()` before storing.

### C9. Webhook URL Not Validated (SSRF Vector)
**File:** `app/api/webhooks/route.ts:67-68`
**Issue:** No URL validation. Users can set webhook URL to `http://169.254.169.254/latest/meta-data/` or internal network addresses.
**Fix:** Validate HTTPS, reject private/reserved IP ranges and metadata endpoints.

### C10. Open Cron Endpoints When CRON_SECRET Unset
**File:** `app/api/broadcasts/process-scheduled/route.ts:11`, `lib/cron-auth.ts:18-19`
**Issue:** If `CRON_SECRET` is not set, cron endpoints accept unauthenticated requests. Anyone can trigger broadcast sends and retries.
**Fix:** Default to deny when `CRON_SECRET` is unset.

---

## HIGH FINDINGS

### H1. `updateDeal` Workflow Action Allows Writing ANY Column
**File:** `lib/workflow-actions.ts:205-249`
**Issue:** No field allowlist (unlike `executeUpdateContact` which has `ALLOWED_FIELDS`). A misconfigured workflow can overwrite `created_by`, `outcome`, `stage_id`, etc.
**Fix:** Add `ALLOWED_FIELDS` allowlist matching the contact pattern.

### H2. Prompt Injection in AI Summary/Sentiment Endpoints
**File:** `app/api/deals/[id]/summary/route.ts:30-34`, `app/api/deals/[id]/sentiment/route.ts:27-43`
**Issue:** Deal notes and contact names interpolated directly into Claude prompts with zero sanitization. Compare with `suggest-replies/route.ts` which correctly uses `sanitizeForPrompt()`.
**Fix:** Use `sanitizeForPrompt()` consistently across all AI endpoints.

### H3. Race Condition in Deal PATCH (Two Reads Before One Write)
**File:** `app/api/deals/[id]/route.ts:62-88`
**Issue:** Reads `stage_id` and `value` in separate queries, then writes. Another request between reads and write causes stale stage history and wrong value change detection.
**Fix:** Combine reads into single query or use DB transaction.

### H4. Duplicate Stage History: PATCH vs /move Endpoint
**File:** `app/api/deals/[id]/route.ts:62-78` vs `app/api/deals/[id]/move/route.ts:34-41`
**Issue:** Both insert stage history, but PATCH skips all side effects (TG notification, webhooks, automation rules, sequence completion). Deals silently move without business logic.
**Fix:** Remove stage-change from PATCH; force all moves through `/move`.

### H5. Anthropic API Error Details Leaked to Client
**File:** `app/api/ai-chat/route.ts:77-79`
**Issue:** Raw Claude API error body returned to the client via thrown exception. Could expose API internals.
**Fix:** Log raw error server-side, return generic message to client.

### H6. AI Agent Config PUT: Mass Assignment
**File:** `app/api/ai-agent/config/route.ts:63-69`
**Issue:** Entire request body (minus `id`) spread into Supabase update. Attacker can set any column.
**Fix:** Define explicit allowlist of updatable fields.

### H7. Reply Hour Stats Race Condition (Read-Modify-Write)
**File:** `bot/handlers/messages.ts:895-914`
**Issue:** Two concurrent messages in same group/hour both read same `reply_count`, write `count + 1`, losing one increment.
**Fix:** Use RPC for atomic increment (pattern already exists elsewhere: `increment_enrollment_reply`).

### H8. Bot Token Leaked in URL Query Strings
**File:** `app/api/contacts/import-telegram/route.ts:19-23`
**Issue:** GET requests with bot token in URL path logged in request/proxy/CDN logs. Some routes correctly use POST with JSON body.
**Fix:** Consistently use POST with JSON body for all Telegram API calls.

### H9. Inbox Reply: Bot Token Fetched Without Bot Scoping
**File:** `app/api/inbox/reply/route.ts:80-84`
**Issue:** Fetches first `telegram_bot` token globally with no user/org filter. Wrong bot token used if multiple exist.
**Fix:** Use `crm_bots` registry, join on the group's `bot_id`.

### H10. SLA Config PUT: No Role Check
**File:** `app/api/sla/route.ts:21-42`
**Issue:** Any authenticated user can modify SLA thresholds and escalation roles.
**Fix:** Restrict to `admin_lead` role.

### H11. Outreach Enrollment: No Duplicate Guard
**File:** `app/api/outreach/enroll/route.ts:67-79`
**Issue:** Same contact can be enrolled multiple times in same sequence, receiving duplicate messages.
**Fix:** Check for existing active enrollment before inserting.

### H12. Race Condition in Broadcast Retry Counter
**File:** `app/api/broadcasts/retry/route.ts:83-95`
**Issue:** Read-then-write on `sent_count`/`failed_count`. Concurrent retries lose increments.
**Fix:** Use SQL atomic increment via RPC.

---

## CHEATS FOUND

### CHEAT 1. Email Sequence Worker is Completely Fake
**File:** `bot/sequence-worker.ts:107-110, 189-198`
**Issue:** The entire email sequence worker is a stub. It fetches enrollments, does variable substitution, then **logs "Would send"** and marks steps as executed. No email is ever sent. The UI shows sequences as working (enrollments created, steps advance, audit logs written). Comment says: *"Note: In production, this would use the GmailDriver to send."*

### CHEAT 2. Scheduled Broadcasts Drop A/B Variants and Media
**File:** `app/api/broadcasts/process-scheduled/route.ts:22-23`
**Issue:** Only selects `id` and `message_html`. All A/B variants, media attachments, and inline buttons silently dropped when schedule fires. Feature looks complete in UI.

### CHEAT 3. `phoneCodeHash` Returned to Client
**File:** `app/api/auth/telegram-phone/route.ts:42-44`
**Issue:** Telegram auth `phoneCodeHash` sent to client in JSON response. Should be kept server-side only (already stored in `pendingPhoneLogins`).

---

## MEDIUM FINDINGS

| # | Issue | File | Summary |
|---|-------|------|---------|
| M1 | Fire-and-forget async in move endpoint | `app/api/deals/[id]/move/route.ts:101-144` | Unhandled promise, response already sent |
| M2 | Custom field values not validated | `app/api/deals/route.ts:105-117` | Arbitrary field IDs accepted, no type checking |
| M3 | N+1 queries in unread counts + health | `app/api/deals/unread-counts/route.ts:41-51` | One query per deal with TG chat link |
| M4 | Pipeline stages PUT deletes without board filter | `app/api/pipeline/stages/route.ts:17-21` | Can accidentally delete all stages across boards |
| M5 | Optimistic UI doesn't revert correctly | `app/pipeline/page.tsx:284-303` | Failed fetch leaves deal in wrong column |
| M6 | Sample deals trigger real API calls | `app/pipeline/page.tsx:43-68` | Dragging sample deals fires `/api/deals/sample-1/move` |
| M7 | Custom field insert errors silently swallowed | `app/api/contacts/route.ts:84` | Insert failure not checked, user gets success response |
| M8 | Merge deletes contacts without verifying deal reassignment | `app/api/contacts/merge/route.ts:17-95` | If deal update fails, contacts still deleted |
| M9 | Scheduled broadcast drops A/B + media | `app/api/broadcasts/process-scheduled/route.ts` | See CHEAT 2 |
| M10 | Rate limiter module-level state (broken in serverless) | `lib/telegram-send.ts:19-21` | Cold starts get fresh token buckets |
| M11 | QR login entries never cleaned up | `app/api/auth/telegram-qr/route.ts` | TelegramClient connections leak in memory |
| M12 | Phone login entries also leak | `app/api/auth/telegram-phone/route.ts` | Same issue as QR |
| M13 | Missing `is_private_dm` on API-created conversations | `app/api/ai-agent/conversations/route.ts:39` | DM conversations may leak to non-admins |
| M14 | AI chat sends unlimited conversation history | `app/api/ai-chat/route.ts:70-73` | No cap on messages array or token count |
| M15 | `user_name` injection into AI system prompt | `app/api/ai-agent/respond/route.ts:81` | Prompt injection via Telegram display name |
| M16 | Engagement route: any user can trigger expensive recalc | `app/api/contacts/engagement/route.ts:15-28` | N+1 query for all contacts, no role check |
| M17 | N+1 queries across multiple routes | `app/api/contacts/import-telegram/route.ts:80-111` | Per-record DB queries in loops |
| M18 | Outreach status: no transition validation | `app/api/outreach/enroll/route.ts:88-110` | Accepts any string for status field |
| M19 | SLA poller: 2-hour dedup = infinite re-notification | `bot/handlers/sla-poller.ts:46-48` | Breached deals get notifications every 2 hours |
| M20 | `dangerouslySetInnerHTML` with regex escaping | `app/settings/automations/templates/page.tsx:467-479` | Fragile XSS prevention, should use DOMPurify |

---

## LOW FINDINGS

| # | Issue | File | Summary |
|---|-------|------|---------|
| L1 | Probability not validated 0-100 on API | `app/api/deals/route.ts:89` | Values of 500 or -50 accepted |
| L2 | Swallowed errors (`.catch(() => {})`) x4 | `app/api/deals/route.ts:121,137` | Silent webhook/audit failures |
| L3 | Conversation summary not cached | `app/api/deals/[id]/conversation/summary/route.ts` | Burns API credits on every click |
| L4 | Anthropic API version outdated (2023-06-01) x5 | Multiple files | 3 years old, not using centralized helper |
| L5 | `pollNewMessages` restarts interval on every message | `components/pipeline/conversation-timeline.tsx:69-103` | Stale closure, timer resets constantly |
| L6 | Deal delete doesn't cascade custom field values | `app/api/deals/[id]/route.ts:137-151` | Depends on FK cascade existing |
| L7 | `canRespondInGroup` side-effect on check | `bot/handlers/messages.ts:120-125` | Cooldown consumed even if response fails |
| L8 | `groupResponseCooldowns` grows unbounded | `bot/handlers/messages.ts:117` | Memory leak over months |
| L9 | Drip sequence cache: 60s invalidation lag | `bot/handlers/drip-triggers.ts:43-58` | Deactivated sequence still enrolls for 60s |
| L10 | Hardcoded "Follow Up" stage name | `bot/handlers/callback-actions.ts:63` | Breaks if stage renamed |
| L11 | `console.warn` for normal log messages x4 | Multiple bot files | False positives in log monitoring |
| L12 | Duplicate utility functions (normalize, levenshtein) | `app/api/contacts/scan-duplicates/` vs `duplicates/` | Full copy-paste between files |
| L13 | Bulk delete: N sequential HTTP requests from client | `app/contacts/page.tsx:169-181` | 100 contacts = 100 requests |
| L14 | O(n^2) duplicate scan on every page load | `app/api/contacts/scan-duplicates/route.ts:102-205` | 5k contacts = 12.5M comparisons |
| L15 | Contact detail delete: no confirmation | `components/contacts/contact-detail-panel.tsx:136-149` | One click permanently destroys |
| L16 | `quality_score` falsy check treats 0 as null | `app/contacts/page.tsx:104` | `\|\|` instead of `??` |
| L17 | `import-telegram` sets `created_by: null` | `app/api/contacts/import-telegram/route.ts:103` | Breaks audit trail |
| L18 | Contact fields `moveField` doesn't update position numbers | `app/settings/pipeline/contacts/page.tsx:64-72` | Stale positions saved |
| L19 | Outreach steps PUT: delete-then-insert not atomic | `app/api/outreach/steps/route.ts:41-68` | Failed insert leaves zero steps |

---

## Top 10 Fix-Now List

| Priority | Finding | Why |
|----------|---------|-----|
| 1 | **C1** Dev auth bypass | Anyone can bypass auth in production with a cookie |
| 2 | **C2** Deterministic TG passwords | Bot token leak = all accounts compromised |
| 3 | **C3** PostgREST filter injection | Data exfiltration risk |
| 4 | **C4** Missing RBAC on destructive ops | Any user can delete/merge everything |
| 5 | **C7** Webhook PUT mass assignment | Arbitrary column writes |
| 6 | **C9** Webhook SSRF | Internal network scanning |
| 7 | **C5** CSV formula injection | Malicious data execution in Excel |
| 8 | **H1** Workflow `updateDeal` no allowlist | Automated column overwrite |
| 9 | **H2** Prompt injection in AI endpoints | Sentiment/summary manipulation |
| 10 | **CHEAT 1** Email sequence worker is fake | Feature sold but not delivered |
