# CLAUDE.md — SupraCRM

## What This Project Is

SupraCRM is a **multi-channel engagement CRM** built for BD, Marketing, and Admin teams. It unifies Telegram, Gmail, and Google Calendar into a single deal pipeline with visual automations and AI-powered assistance.

**Core channels:**
- **Telegram** — Bot-managed groups, broadcasts, TMA mobile app, zero-knowledge client sessions (GramJS + MTProto)
- **Email** — Gmail sync, compose (side-by-side), threads, labels, email groups/folders, sequences
- **Calendar** — Google Calendar sync with webhook-based real-time updates

**Core CRM:**
- 7-stage configurable deal pipeline (Kanban) with BD/Marketing/Admin board views
- Contact management with Telegram identities, company associations, enrichment
- Slug-based Telegram group access control (bulk add/remove, audit log)
- Visual workflow builder (React Flow) with templates and execution history
- AI chat assistant (Claude) on every page with per-page context

**It is NOT:**
- An omnichannel platform (no WhatsApp, Instagram, SMS — Telegram-first by design)
- A project management tool
- A general-purpose chatbot

### Database Conventions

SupraCRM may share its Supabase project with other apps. To avoid collisions:
- CRM-specific tables are prefixed with `crm_` or `tg_`
- Shared tables (`auth.users`, `profiles`, `user_tokens`) must not be restructured
- `profiles` is extended with a `crm_role` column

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16, React 19 |
| Styling | Tailwind CSS v3, dark-mode-only, HSL CSS variables |
| Database | Supabase (PostgreSQL) |
| Auth | GitHub OAuth via Supabase Auth |
| Encryption | AES-256-GCM (server), device-bound keys (browser, zero-knowledge TG sessions) |
| Telegram Bot | grammy — separate Node.js process, NOT an API route |
| Telegram Client | GramJS (browser-side MTProto) |
| Email | Google APIs (Gmail), nodemailer, imapflow, mailparser |
| Calendar | Google Calendar API + webhooks |
| Workflows | React Flow (@xyflow/react) |
| Rich Text | Tiptap (email compose, drafts) |
| AI | Anthropic SDK (@anthropic-ai/sdk) — drafts, summaries, sentiment, chat |
| Package manager | npm |
| Port | 3002 (`npm run dev:app`) |

---

## File Structure

```
app/
├── _components/shell/     # App shell (sidebar, topbar, mobile, theme, context)
├── api/
│   ├── deals/             # Deals CRUD
│   ├── contacts/          # Contacts CRUD
│   ├── groups/            # TG groups
│   ├── tokens/            # Token CRUD
│   ├── pipeline/          # Pipeline config
│   ├── email/             # Gmail sync, compose, threads, labels, groups, sequences, webhooks
│   ├── calendar/          # Google Calendar sync, events, webhooks
│   ├── telegram/          # TG client auth, sessions, messages
│   ├── automations/       # Workflow CRUD + execution
│   └── broadcasts/        # TG broadcast send + scheduling
├── auth/callback/         # GitHub OAuth callback
├── login/                 # Login page
├── pipeline/              # Kanban board (main CRM view)
├── contacts/              # Contact list + TG identity lookup
├── companies/             # Company master data
├── email/                 # Gmail inbox, thread view, compose
├── inbox/                 # Unified Telegram conversation view
├── telegram/              # TG connect, integration hub
├── groups/                # TG group management
├── broadcasts/            # Broadcast compose + scheduling
├── automations/           # Visual workflow builder, runs, analytics
├── outreach/              # Outreach sequences
├── calendar/              # Google Calendar sync
├── conversations/         # AI-driven conversation management
├── reports/               # Analytics and reporting
├── settings/              # 11 subsections (integrations, pipeline, team, privacy, AI, etc.)
├── tma/                   # Telegram Mini App (mobile CRM: deals, tasks, inbox, AI chat)
├── layout.tsx             # Root layout
├── page.tsx               # Dashboard home
└── globals.css            # Global styles + CSS variables

components/ui/             # Base components (button, badge, card, input, textarea)

lib/
├── supabase/              # SSR-compatible Supabase clients
│   ├── client.ts          # Browser client
│   ├── server.ts          # Server client (cookies)
│   └── middleware.ts       # Session refresh
├── supabase.ts            # createSupabaseAdmin() (service role)
├── auth.ts                # AuthProvider + useAuth hook
├── crypto.ts              # AES-256-GCM token encryption + key versioning
└── utils.ts               # cn() utility, timeAgo()

bot/                       # Telegram bot (separate Node.js process)

supabase/migrations/       # 100+ SQL migrations
```

---

## Database Tables

| Table | Purpose |
|-------|---------|
| `pipeline_stages` | Configurable 7-stage pipeline |
| `crm_contacts` | Contacts with Telegram identities |
| `crm_deals` | Deals linked to contacts, stages, boards, and TG chats |
| `crm_deal_stage_history` | Stage change log for automation triggers |
| `crm_companies` | Company master data linked to contacts and groups |
| `tg_groups` | Telegram groups where bot is admin |
| `tg_group_slugs` | Slug tags on TG groups (junction) |
| `tg_client_sessions` | Zero-knowledge encrypted Telegram sessions |
| `crm_tg_chat_groups` | User-organized Telegram conversation folders |
| `crm_user_slug_access` | Which users can access which slug-tagged groups |
| `crm_slug_access_log` | Audit log for bulk access changes |
| `crm_email_groups` | User-created email folders per connection |
| `crm_email_group_threads` | Email thread ↔ group junction |
| `crm_email_group_contacts` | Auto-routing rules by sender |
| `crm_workflows` | Visual automation workflows (React Flow JSONB) |
| `crm_workflow_runs` | Workflow execution history |
| `crm_workflow_templates` | Reusable workflow templates |
| `crm_ai_agent_config` | AI chatbot configuration |
| `crm_ai_conversations` | AI conversation log with qualification data |
| `crm_bots` | Multi-bot registry with encrypted tokens |

Shared table extension: `profiles.crm_role` (bd_lead, marketing_lead, admin_lead)

---

## Pipeline Stages (Default)

| Position | Stage |
|----------|-------|
| 1 | Potential Client |
| 2 | Outreach |
| 3 | Calendly Sent |
| 4 | Video Call |
| 5 | Follow Up |
| 6 | MOU Signed |
| 7 | First Check Received |

Board views: **BD**, **Marketing**, **Admin** (filtered by `board_type`).

---

## Key Design Patterns

- `{ data, source }` API response format. Null-safe clients. Admin client for cross-user queries.
- Dark-mode-only. No external component libraries.
- Auth middleware redirects to `/login` for unauthenticated users.
- CRM tables prefixed with `crm_` or `tg_` to avoid collisions if sharing a Supabase project.
- Telegram bot runs as a **separate process** (not API route) for persistent connections.
- Zero-knowledge Telegram sessions: client-side encryption with device-bound keys, server never sees plaintext.
- Encryption key versioning for safe key rotation.

---

## Environment Variables

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
TOKEN_ENCRYPTION_KEY=

# App
NEXT_PUBLIC_APP_URL=http://localhost:3002

# Telegram Bot
TELEGRAM_BOT_TOKEN=

# Telegram Client (browser-side GramJS)
NEXT_PUBLIC_TELEGRAM_API_ID=
NEXT_PUBLIC_TELEGRAM_API_HASH=

# Google (Gmail + Calendar)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_PUBSUB_TOPIC=              # Optional: enables real-time email push (vs 120s polling)

# AI
ANTHROPIC_API_KEY=
```

---

## Roadmap

| Priority | Target | Key Deliverables |
|----------|--------|-----------------|
| **P0: TG Moat** | ~73 pts | TG conversation timeline in deal detail, full TMA mobile CRM, outreach sequence branching |
| P1: Scale | ~78 pts | Bot drip sequences, auto-assignment rules, engagement scoring, unified inbox, saved views |
| P2: #1 | ~84 pts | Blockchain payment tracking, AI chatbot flows, public REST API, TG folder sync, custom fields |
| P3: Polish | — | AI summaries, multi-workspace, QR capture, calendar/timeline views |

Strategic thesis: win by being **the CRM that lives inside Telegram**, not another CRM with a Telegram plugin. See `strategic-roadmap.md` for competitive analysis and scoring methodology.

---

## What NOT to Do

- Don't install large component libraries (Material UI, Chakra, Ant Design)
- Don't change the dark mode design system — extend it
- Don't restructure base Supabase tables (profiles, user_tokens, auth.users)
- Don't build the bot inside Next.js API routes — it runs as a separate process
- Don't chase omnichannel (WhatsApp, SMS) — Telegram-first is the strategy
- Don't over-architect — this is an internal tool for a small team
