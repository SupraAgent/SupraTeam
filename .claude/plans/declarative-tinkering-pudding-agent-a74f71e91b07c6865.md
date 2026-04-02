# Client-Side Telegram (GramJS) with Zero-Knowledge Encryption

## Architecture Overview

Move GramJS from Next.js API routes to the browser. The server never sees plaintext Telegram data. Session strings are encrypted client-side with a device-bound AES-256 key stored in IndexedDB. The server stores only encrypted blobs and plaintext metadata (phone_last4, telegram_user_id, is_active).

### Data Flow (Before vs After)

**Before:** Browser -> API Route -> decrypt session (server key) -> GramJS -> Telegram servers
**After:** Browser -> GramJS (in-browser via WSS) -> Telegram servers. Session encrypted/decrypted entirely in browser.

### What Stays Server-Side
- `lib/telegram-send.ts` (Bot API notifications) -- unaffected, uses BOT_TOKEN not user sessions
- `lib/telegram-auth.ts` (WebApp initData validation) -- unaffected
- `lib/telegram-templates.ts` -- unaffected, pure functions
- `tg_group_messages` sync-to-DB -- becomes client-initiated direct Supabase insert (explicit share)
- `tg_private_contacts` import -- becomes client-initiated direct Supabase insert
- Audit log inserts -- direct Supabase insert from browser client

---

## Phase 1: Client-Side Crypto Layer

### New File: `lib/client/telegram-crypto.ts`

Browser-only module using Web Crypto API. Pattern based on existing `packages/supra-loop-builder/src/lib/credential-store.ts` (device-bound key with PBKDF2).

**Key design:**
- On first use, generate a random 256-bit AES-GCM key via `crypto.subtle.generateKey()`
- Store the CryptoKey in IndexedDB (database: `supra-tg`, store: `keys`, key: `session-key`)
- IndexedDB chosen over localStorage because CryptoKey objects with `extractable: false` can be stored directly -- raw key material never exists as a string in JS memory
- Key marked `extractable: false` so it cannot be exported even by page scripts

**Functions to implement:**
- `generateSessionKey(): Promise<void>` -- create + store if not exists
- `getSessionKey(): Promise<CryptoKey|null>` -- retrieve from IndexedDB
- `encryptSession(plaintext: string): Promise<string>` -- AES-256-GCM, returns base64(iv + ciphertext + tag)
- `decryptSession(encrypted: string): Promise<string>` -- inverse
- `hasSessionKey(): Promise<boolean>` -- check if key exists
- `destroySessionKey(): Promise<void>` -- delete key from IndexedDB (on disconnect)

**Why device-bound key (not passphrase-derived):**
- Internal CRM for a small team
- If user switches devices, they re-authenticate with Telegram (scan QR or enter phone code)
- No passphrase to forget, no key derivation latency, simpler UX
- `extractable: false` means key literally cannot leave the device

### New File: `lib/client/indexed-db.ts`

Thin IndexedDB wrapper. Codebase does not currently use IndexedDB. Needed for:
1. CryptoKey storage (non-extractable keys cannot go in localStorage)
2. Optional: cached conversation list for instant load

**Functions:**
- `openDB(name, version, upgrade)` -- open/upgrade IndexedDB
- `getItem<T>(db, store, key)` -- read
- `setItem<T>(db, store, key, value)` -- write
- `deleteItem(db, store, key)` -- remove

---

## Phase 2: Client-Side GramJS Service

### New File: `lib/client/telegram-client-browser.ts`

Browser equivalent of `lib/telegram-client.ts`. Core of the migration.

**Key facts enabling this:**
- GramJS v2.26+ auto-detects browser, uses `PromisedWebSockets` for WSS transport
- `StringSession` is base64 string with no file I/O -- works identically in browser
- API_ID/API_HASH become `NEXT_PUBLIC_TELEGRAM_API_ID` / `NEXT_PUBLIC_TELEGRAM_API_HASH`
- Telegram's own web clients expose these in source; they are app-level identifiers, not secrets

**Singleton class `TelegramBrowserClient`:**
- `initialize(encryptedSession?)` -- decrypt session from Supabase blob, create GramJS client
- `connect()` / `disconnect()`
- Auth: `sendPhoneCode()`, `verifyCode()`, `verify2FA()`, `requestQRLogin()`, `onQRLoginConfirmed()`
- Data: `getDialogs()`, `getMessages()`, `sendMessage()`, `getContacts()`
- Session: `getEncryptedSession()` -- encrypt current session with browser key
- `isConnected()`

**CSP change required in `next.config.ts`:**
Current `connect-src` allows `https://*.supabase.co wss://*.supabase.co https://api.anthropic.com`.
Must add: `wss://*.web.telegram.org`

**Environment variables to add:**
```
NEXT_PUBLIC_TELEGRAM_API_ID=36145539
NEXT_PUBLIC_TELEGRAM_API_HASH=974c7d5e58398dda1b943384fa48e600
```

---

## Phase 3: Session Persistence (Supabase as Encrypted Blob Store)

### DB Migration: `supabase/migrations/XXX_client_side_session.sql`

```sql
ALTER TABLE tg_client_sessions
  ADD COLUMN IF NOT EXISTS encryption_method TEXT DEFAULT 'server'
  CHECK (encryption_method IN ('server', 'client'));
```

The `session_encrypted` column remains TEXT -- now stores browser-encrypted blobs. No data migration: old server-encrypted sessions trigger re-auth flow.

### New File: `lib/client/telegram-session-store.ts`

Session round-trip: browser <-> Supabase.

- `saveSession(supabase, userId, encryptedBlob, metadata)` -- upsert to tg_client_sessions
- `loadSession(supabase, userId)` -- returns encrypted blob
- `deleteSession(supabase, userId)` -- marks inactive + clears blob
- `getSessionStatus(supabase, userId)` -- returns metadata only

Uses RLS-scoped browser Supabase client. Policy `auth.uid() = user_id` ensures isolation.

---

## Phase 4: React Context + Hooks

### New File: `lib/client/telegram-context.tsx`

React context managing GramJS client lifecycle.

```
TelegramContextValue {
  status: 'disconnected' | 'connecting' | 'connected' | 'error'
  client: TelegramBrowserClient | null
  error: string | null
  connect(phone), verifyCode(), startQRLogin(), disconnect()
  refreshDialogs(), dialogs, dialogsLoading
}
```

**Lifecycle:**
1. On mount: check if encrypted session exists in Supabase
2. If yes: load blob, decrypt with IndexedDB key, initialize GramJS, connect
3. If decrypt fails (key missing = new device): show re-auth prompt
4. On auth success: encrypt session, save to Supabase, update context

### New File: `lib/client/use-telegram-messages.ts`

Hook for message fetching/sending scoped to a conversation.

### New File: `lib/client/use-telegram-contacts.ts`

Hook for contact fetching + import to DB.

### New File: `lib/client/telegram-types.ts`

Shared TypeScript types for all client-side Telegram modules.

---

## Phase 5: UI Migration

### Modified: `app/settings/integrations/connect/page.tsx`

- Remove all `fetch("/api/telegram-client/...")` calls
- Use `useTelegram()` context
- Phone login: `client.sendPhoneCode()` -> `client.verifyCode()` directly in browser
- QR login: `client.requestQRLogin()` -> event handler (no server polling)
- On success: `client.getEncryptedSession()` -> save to Supabase via browser client
- Audit log: insert directly via Supabase browser client

### Modified: `app/telegram/page.tsx`

- Remove all `fetch("/api/telegram-client/...")` calls
- Wrap in `<TelegramProvider>` (or add to layout)
- Use `useTelegram()` for status + dialogs
- Use `useTelegramMessages()` for message view
- All data flows browser-direct: GramJS -> React state -> UI

### Modified: `app/contacts/telegram/page.tsx`

- Remove fetch calls
- Use `useTelegramContacts()` for live contact list from GramJS
- "Sync from Telegram" fetches directly via GramJS in browser
- "Share with CRM" remains a server write (creates team-visible `crm_contacts`)

### Layout Integration

Add `<TelegramProvider>` via dynamic import with `ssr: false`:
```tsx
const TelegramProvider = dynamic(
  () => import('@/lib/client/telegram-context').then(m => m.TelegramProvider),
  { ssr: false }
);
```
GramJS (~200KB) only loaded when Telegram pages are visited.

---

## Phase 6: CRM Data Sharing (Explicit Opt-in)

### Group Message Sync

Client fetches messages via GramJS, user clicks "Sync to CRM" on CRM-linked group, browser inserts directly to `tg_group_messages` via Supabase client.

**New RLS policy needed:**
```sql
CREATE POLICY "Users insert messages for accessible groups"
  ON tg_group_messages FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM tg_groups g
      JOIN tg_group_slugs gs ON gs.group_id = g.id
      JOIN crm_user_slug_access usa ON usa.slug = gs.slug
      WHERE g.id = tg_group_messages.tg_group_id
        AND usa.user_id = auth.uid()
    )
  );
```

### Contact Sharing

- Contact list fetched live via GramJS (never stored by default)
- "Import contacts" saves to `tg_private_contacts` via Supabase client (RLS: `auth.uid() = user_id`)
- "Share with CRM" keeps thin server endpoint: receives contact data from browser, creates `crm_contacts` + `tg_shared_contacts`

### Modified: `app/api/telegram-client/contacts/share/route.ts`

- No longer reads `tg_private_contacts` DB row
- Receives contact data directly: `{ firstName, lastName, username, telegramUserId }`
- Creates `crm_contacts` entry + link

---

## Phase 7: Deprecate Server-Side Routes

### Routes to DELETE:
1. `app/api/telegram-client/connect/route.ts`
2. `app/api/telegram-client/verify-code/route.ts`
3. `app/api/telegram-client/qr-login/route.ts`
4. `app/api/telegram-client/conversations/route.ts`
5. `app/api/telegram-client/messages/route.ts`
6. `app/api/telegram-client/contacts/route.ts`
7. `app/api/telegram-client/messages/sync-group/route.ts`

### Routes to KEEP (modified):
8. `app/api/telegram-client/contacts/share/route.ts` -- for creating team-visible CRM contacts
9. `app/api/telegram-client/disconnect/route.ts` -- server-side cleanup, audit log
10. `app/api/telegram-client/status/route.ts` -- may become unnecessary (browser queries Supabase directly), evaluate during implementation

### Server-Side Files to DELETE:
- `lib/telegram-client.ts` -- replaced by browser version
- `lib/telegram-login-store.ts` -- server Maps no longer needed

### Check Before Deleting:
- `lib/crypto.ts` -- verify no other callers besides telegram-client. If others use it, keep but remove telegram imports.

---

## Phase 8: Migration Path for Existing Sessions

Existing sessions encrypted with server `TOKEN_ENCRYPTION_KEY` cannot be decrypted by browser.

**Strategy: Graceful re-auth.**
1. Browser loads session with `encryption_method = 'server'` -> cannot decrypt
2. Show one-time "Security Upgrade" prompt
3. User scans QR or enters phone code
4. New session encrypted with browser key, saved with `encryption_method = 'client'`
5. Old blob overwritten

Acceptable for small internal team. No data loss, just one-time re-login.

---

## Phase 9: Configuration Changes

### `next.config.ts` CSP

Add to `connect-src`: `wss://*.web.telegram.org`

### `.env.example` / `.env.local`

Add `NEXT_PUBLIC_TELEGRAM_API_ID` and `NEXT_PUBLIC_TELEGRAM_API_HASH`.

### `TOKEN_ENCRYPTION_KEY`

Keep during transition. Remove after all sessions migrated to client-side encryption.

---

## Implementation Sequence

| Day | Phase | Work |
|-----|-------|------|
| 1 | 1 | `indexed-db.ts` + `telegram-crypto.ts` (pure utils, testable) |
| 1-2 | 2 | `telegram-client-browser.ts` (core GramJS wrapper, test in console) |
| 2 | 3 | `telegram-session-store.ts` + DB migration |
| 2-3 | 4 | `telegram-context.tsx` + hooks |
| 3-4 | 5 | UI migration (connect, telegram, contacts pages) |
| 4 | 6 | CRM data sharing (RLS policies, contacts/share modification) |
| 4-5 | 7 | Deprecation (delete old routes/files, CSP + env updates) |
| 5 | 8 | Testing + migration handling |

---

## Risk Analysis

| Risk | Mitigation |
|------|-----------|
| GramJS bundle size (~200KB) | Dynamic import with `ssr: false`, only on Telegram pages |
| WSS drops on tab sleep | GramJS has `connectionRetries: 3` + reconnect; StringSession enables instant reconnect |
| IndexedDB unavailable (private browsing) | Detect + warn; fall back to in-memory session (works until reload) |
| Multi-tab GramJS concurrency | v1: detect + warn "use one tab"; v2: BroadcastChannel coordination |
| NEXT_PUBLIC API credentials visible | Expected/safe: Telegram web clients expose these; they identify the app, not the user |

---

## New Files Summary

| File | Purpose |
|------|---------|
| `lib/client/indexed-db.ts` | Thin IndexedDB wrapper |
| `lib/client/telegram-crypto.ts` | Browser AES-256-GCM with device-bound key |
| `lib/client/telegram-client-browser.ts` | GramJS browser wrapper |
| `lib/client/telegram-session-store.ts` | Session blob persistence via Supabase |
| `lib/client/telegram-context.tsx` | React context + provider |
| `lib/client/use-telegram-messages.ts` | Messages hook |
| `lib/client/use-telegram-contacts.ts` | Contacts hook |
| `lib/client/telegram-types.ts` | Shared TypeScript types |
| `supabase/migrations/XXX_client_side_session.sql` | encryption_method column + INSERT RLS policy |
