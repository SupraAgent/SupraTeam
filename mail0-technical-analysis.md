# Mail-0 (Zero) -- Comprehensive Technical Analysis
**Research Report | March 2026**

---

## 1. Architecture & Stack

**Monorepo structure** managed by pnpm workspaces + Turborepo.

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + React Router (NOT Next.js -- uses Vite + react-router) |
| Backend | Hono (lightweight HTTP framework) + tRPC |
| Database | PostgreSQL via Drizzle ORM |
| Auth | Better Auth (with Google, Microsoft, GitHub OAuth) |
| AI | Vercel AI SDK (`ai` package) with multi-provider support |
| Deployment target | Cloudflare Workers (wrangler.jsonc in both apps) |
| Package manager | pnpm v10 |
| Build orchestrator | Turborepo |
| Styling | Tailwind CSS + shadcn/ui |
| Rich text editor | TipTap |
| State management | Jotai (atoms) + TanStack React Query |
| Client-side DB | Dexie (IndexedDB wrapper) |

**Two apps in the monorepo:**
- `apps/mail` -- The frontend (React SPA, deployed to Cloudflare Workers/Pages via Wrangler)
- `apps/server` -- The backend API (Hono on Cloudflare Workers with Durable Objects)

**Four shared packages:**
- `packages/cli` -- CLI tool
- `packages/eslint-config` -- Shared lint config
- `packages/testing` -- Test utilities
- `packages/tsconfig` -- Shared TS config

**Important note for CRM integration:** Despite early docs mentioning Next.js, the app has migrated to **React Router + Vite** for the frontend and **Hono** for the backend. The `wrangler.jsonc` files confirm Cloudflare Workers as the deployment target, not Vercel/Node.js.

---

## 2. API Surface

The server exposes APIs via **tRPC** (type-safe RPC). The tRPC routes at `apps/server/src/trpc/routes/` are:

| Router | Procedures |
|--------|-----------|
| `mail` | `get`, `count`, `listThreads`, `getMessageAttachments`, `markAsRead/Unread`, `toggleStar`, `modifyLabels`, `send`, `delete`, `bulkDelete`, `bulkArchive`, `bulkMute`, `snoozeThreads`, `unsnoozeThreads`, `deleteAllSpam`, `getEmailAliases` |
| `ai/` | `generateSearchQuery`, `compose`, `generateEmailSubject`, `webSearch` |
| `brain` | `enableBrain`, `disableBrain`, `generateSummary`, `getPrompts`, `updateLabels`, `getLabels` |
| `connections` | `list`, `setDefault`, `delete`, `getDefault` |
| `drafts` | Draft CRUD operations |
| `label` | Label CRUD |
| `categories` | Category management |
| `notes` | Thread note management |
| `settings` | User settings CRUD |
| `shortcut` | Hotkey management |
| `templates` | Email template CRUD |
| `user` | User profile operations |
| `bimi` | Brand Indicators for Message Identification |
| `cookies` | Cookie management |

Additionally, there are **REST routes** at `apps/server/src/routes/`:
- `auth.ts` -- Better Auth endpoints
- `ai.ts` -- Voice/phone AI endpoint (Twilio + ElevenLabs + OpenAI)
- `autumn.ts` -- Billing/subscription
- `agent/` -- Agent-related endpoints

All tRPC procedures use `activeDriverProcedure` middleware that ensures the user is authenticated and has an active email connection.

---

## 3. AI Features

**Multi-provider support** via Vercel AI SDK. Supported providers:

| Provider | Env Variable | Usage |
|----------|-------------|-------|
| OpenAI | `OPENAI_API_KEY` | Primary: compose, search query gen, subject gen, voice calls (gpt-4o, gpt-4o-mini) |
| Anthropic | `ANTHROPIC_API_KEY` | Available as provider |
| Google Gemini | `GOOGLE_GENERATIVE_AI_API_KEY` | Available as provider |
| Groq | `GROQ_API_KEY` | Available as provider |
| Perplexity | `PERPLEXITY_API_KEY` | Web search integration |
| Cloudflare AI | Built-in | `@cf/facebook/bart-large-cnn` for summarization |

**AI features implemented:**

1. **Email Composition** (`ai/compose.ts`) -- Uses `generateText()` from Vercel AI SDK with writing style personalization. Temperature 0.35, max 2000 tokens. Pulls user's `writingStyleMatrix` from DB.
2. **Subject Line Generation** (`ai/compose.ts`) -- Separate procedure, conservative temperature (0.3).
3. **Search Query Generation** (`ai/search.ts`) -- Converts natural language to Gmail/Outlook-specific search syntax using provider-aware system prompts.
4. **Web Search** (`ai/webSearch.ts`) -- Perplexity-powered web search from within email.
5. **Thread Summarization** (`brain.ts`) -- Uses Cloudflare AI + vector database for email thread summaries.
6. **Brain System** -- Subscription-based pipeline that auto-processes email connections, with enable/disable controls per connection.
7. **Voice AI** (`routes/ai.ts`) -- Twilio + ElevenLabs + OpenAI for phone-based email interaction with tool calling (`maxSteps: 10`).
8. **Sequential Thinking** (`lib/sequential-thinking.ts`) -- Multi-step reasoning for complex tasks.
9. **Writing Style Analysis** -- Stores per-connection style matrices to personalize AI output.

---

## 4. Email Provider Integration

**API-based, not IMAP/SMTP.** Two drivers implemented:

**Google/Gmail** (`apps/server/src/lib/driver/google.ts`):
- Uses `googleapis` npm package (official Google API client)
- OAuth2Client with refresh tokens
- Gmail API v1 (`gmail({ version: 'v1', auth })`)
- Scopes: mail read/write, profile, aliases
- Push notifications via Gmail Pub/Sub (history sync pipeline)
- Rate limiting via dedicated `gmail-rate-limit.ts`

**Microsoft/Outlook** (`apps/server/src/lib/driver/microsoft.ts`):
- Uses `@microsoft/microsoft-graph-client`
- Microsoft Graph API (`/me/messages/{id}`, `/me/mailFolders`, etc.)
- Middleware-based auth provider
- Batch operations for bulk modifications

**Driver pattern:** Both implement the `MailManager` interface (`driver/types.ts`) with methods: `get`, `create`, `list`, `count`, `sendDraft`, `createDraft`, `getDraft`, `listDrafts`, `createLabel`, `updateLabel`, `deleteLabel`, `getUserLabels`, `markAsRead`, `markAsUnread`, `modifyLabels`, `getTokens`, `getUserInfo`, `getScope`, `revokeToken`, `getMessageAttachments`, `getAttachment`.

The `ManagerConfig` type standardizes credentials: `userId`, `accessToken`, `refreshToken`, `email`.

**History sync:** The `pipelines.ts` system processes Gmail Pub/Sub messages via Cloudflare Durable Objects and queues, with atomic locking (1-hour TTL) to prevent duplicate processing.

---

## 5. Authentication & Security

**Better Auth** is the auth framework (not NextAuth/Auth.js).

- **OAuth providers:** Google, Microsoft, GitHub
- **Plugins:** JWT, Bearer tokens, Phone number auth (Twilio OTP), MCP, analytics
- **Session:** Cookie-based with 30-day expiry, refresh every 3 days
- **Redis caching:** Sessions cached in Redis (Valkey) with TTL
- **Account linking:** Google and Microsoft as trusted providers, allows different emails across linked accounts
- **Cross-domain cookies:** Configurable domain for multi-subdomain support
- **Trusted origins:** Whitelisted (app.0.email, localhost:3000)
- **IP tracking:** Disabled
- **Token management:** OAuth access/refresh tokens stored in `connection` table. Tokens are refreshed automatically via the driver constructors.
- **JWT:** `jose` library for JWT operations, separate `JWT_SECRET` env var
- **Security headers:** Non-root Docker user, Sentry source maps

The `connection` table stores per-provider credentials (access token, refresh token, expiration). The `account` table stores OAuth account data with scopes.

---

## 6. Database & Storage

**PostgreSQL** via **Drizzle ORM**.

Drizzle config (`apps/server/drizzle.config.ts`):
- Schema at `./src/db/schema.ts`
- Migrations at `./src/db/migrations`
- Table prefix: `mail0_*`

**Tables defined in schema.ts:**

| Table | Purpose |
|-------|---------|
| `user` | User profiles (name, email, image, phone, custom prompts, connection prefs) |
| `session` | Session tokens with expiry, IP, user agent |
| `account` | OAuth accounts (multi-provider, tokens, scopes) |
| `connection` | Email provider connections (Google/Microsoft) with access/refresh tokens |
| `summary` | AI-generated thread summaries with tags and suggested replies |
| `note` | User notes on email threads (color, pinned, ordering) |
| `userSettings` | JSON settings per user |
| `userHotkeys` | Custom keyboard shortcuts (JSON) |
| `writingStyleMatrix` | Per-connection writing style analysis for AI personalization |
| `verification` | Email/phone verification tokens |
| `earlyAccess` | Early access program tracking |
| `emailTemplate` | Reusable email templates (subject, body, recipients) |
| `oauthApplication` | OAuth app definitions |
| `oauthAccessToken` | OAuth tokens with refresh support |
| `oauthConsent` | User consent tracking |

**Emails are NOT stored in the database.** Zero reads/writes directly from Gmail/Outlook APIs. The DB stores metadata (summaries, notes, settings, connections) not email content.

**Additional storage:**
- Cloudflare KV: `snoozed_emails`, `gmail_sub_age`, `gmail_history_id`, `connection_labels`, `prompts_storage`
- Cloudflare R2: `THREADS_BUCKET` for thread data
- Cloudflare Vectorize: Vector DB for AI search/summarization
- Redis/Valkey: Session caching, rate limiting
- Dexie (client-side): IndexedDB for offline/cache on the frontend

---

## 7. Self-Hosting

**Docker support is production-ready.**

`docker-compose.prod.yaml` defines 5 services:

| Service | Image/Build | Port |
|---------|-------------|------|
| `zero` | Built from `docker/app/Dockerfile` | 3000 |
| `migrations` | Built from `docker/db/Dockerfile` | -- |
| `db` | `postgres:17-alpine` | 5432 |
| `valkey` | `bitnami/valkey:8.0` (Redis-compatible) | 6379 |
| `upstash-proxy` | `hiett/serverless-redis-http` | -- |

The app Dockerfile uses multi-stage builds: node:22-alpine base, pnpm + turbo for build, wrangler for serving, non-root user for security.

**Required environment variables** (86 total in `env.ts`, key ones):
- Database: `DATABASE_URL`, `REDIS_URL`
- Auth: `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID/SECRET`, `MICROSOFT_CLIENT_ID/SECRET`
- AI (optional): `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GROQ_API_KEY`
- Email: `RESEND_API_KEY` (for transactional emails)
- URLs: `BASE_URL`, `VITE_PUBLIC_APP_URL`, `VITE_PUBLIC_BACKEND_URL`

**Feature flags:** `DISABLE_WORKFLOWS`, `DISABLE_CALLS`, `EARLY_ACCESS_ENABLED`

---

## 8. Key Packages/Libraries

**Backend (`@zero/server`):**
- `hono` -- HTTP framework (Cloudflare Workers native)
- `@trpc/server` -- Type-safe API layer
- `drizzle-orm` + `drizzle-kit` -- Database ORM
- `better-auth` -- Authentication
- `googleapis` -- Gmail API
- `@microsoft/microsoft-graph-client` -- Outlook API
- `ai` + `@ai-sdk/openai` + `@ai-sdk/anthropic` + `@ai-sdk/google` + `@ai-sdk/groq` + `@ai-sdk/perplexity` -- AI providers
- `effect` -- Functional effect system for pipelines
- `resend` -- Transactional email
- `twilio` -- Phone/SMS
- `elevenlabs` -- Voice AI
- `cheerio` -- HTML parsing
- `sanitize-html` -- Security
- `jose` -- JWT
- `zod` -- Schema validation

**Frontend (`@zero/mail`):**
- `react` + `react-dom` + `react-router` -- UI framework
- `@tanstack/react-query` -- Server state
- `jotai` -- Client state (atoms)
- `@tiptap/*` -- Rich text editor (email composition)
- `@dnd-kit/*` -- Drag and drop
- `@radix-ui/*` -- Headless UI primitives
- `dexie` -- IndexedDB (client-side caching)
- `@react-email/*` -- Email templates
- `motion` -- Animations
- `sonner` -- Toast notifications
- `react-hook-form` + `@hookform/resolvers` -- Forms
- `lz-string` -- Compression
- `date-fns` -- Date utilities

---

## 9. License

**MIT License**, Copyright (c) 2025 Zero Email.

No restrictive dependencies identified. The core dependencies (React, Hono, Drizzle, tRPC, Vercel AI SDK, googleapis, Better Auth) are all MIT or Apache-2.0 licensed.

---

## 10. Integration Points for SupraCRM

**Most reusable patterns:**

1. **Driver abstraction** (`apps/server/src/lib/driver/types.ts`) -- The `MailManager` interface is a clean abstraction over Gmail/Outlook. You could implement this pattern in SupraCRM's API routes to support multiple email providers through a single interface.

2. **tRPC mail procedures** (`apps/server/src/trpc/routes/mail.ts`) -- The CRUD operations (list threads, send, archive, label, search) map well to CRM email features. The procedure signatures could be adapted to Next.js API routes or tRPC if you add it.

3. **React hooks** (`apps/mail/hooks/`) -- Hooks like `use-threads.ts`, `use-compose-editor.ts`, `use-connections.ts`, `use-labels.ts`, `use-optimistic-actions.ts`, and `use-summary.ts` encapsulate reusable client-side email logic. These depend on tRPC client calls but the patterns are portable.

4. **AI composition** (`apps/server/src/trpc/routes/ai/compose.ts`) -- The writing style matrix + Vercel AI SDK pattern for personalized email drafting is directly applicable. SupraCRM could use the same `ai` package with your preferred provider.

5. **OAuth connection management** -- The `connection` table pattern (storing per-provider access/refresh tokens) and the `connections` tRPC router show how to manage multiple email accounts per user.

**What would NOT port easily:**
- The Cloudflare-specific infrastructure (Durable Objects, KV, Queues, R2, Vectorize, Workers) -- you would need to replace these with Supabase equivalents or serverless alternatives.
- The `effect` library pipeline system for Gmail history sync is tightly coupled to Cloudflare.
- Better Auth would need to be swapped for Supabase Auth (which you already use).

**Recommended integration approach for SupraCRM:**
- Use the Gmail API directly (via `googleapis` package) rather than trying to extract Zero's driver wholesale. The driver pattern is the valuable part.
- For AI features, use the Vercel AI SDK (`ai` package) directly -- it's framework-agnostic and works in Next.js API routes.
- For the frontend, TipTap for rich email composition and TanStack Query for data fetching are both excellent choices that work independently.
- Store email connection tokens in your existing `user_tokens` table with `provider = 'gmail'` or `provider = 'outlook'`, encrypted with your AES-256-GCM setup.

---

*Sources: [Mail-0/Zero GitHub](https://github.com/Mail-0/Zero) | [Zero on Y Combinator](https://www.ycombinator.com/companies/zero) | [emailexpert analysis](https://emailexpert.com/blogs-tutorials/insights/examining-zero-an-ai-native-email-client-taking-a-new-approach-to-inbox-management/) | [Zero website](https://0.email/)*
