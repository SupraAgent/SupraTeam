# CLAUDE.md -- SupraCRM

## Who You're Working With

Jon, co-founder of Supra (L1 blockchain). Australian, lives in Taipei. Communication style: no fluff, short paragraphs (max 3 sentences). Tables for comparisons, bullets for lists. Separate facts from conclusions from speculation. Fast iteration preferred. Don't over-explain.

---

## What This Project Is

SupraCRM is a Telegram-native CRM for Supra's BD, Marketing, and Admin teams. It manages deal pipelines, contacts with Telegram identities, and Telegram group access control via slug-based bulk operations. A Telegram bot acts as group admin, sending automated messages on pipeline stage changes, daily digests, and broadcasts filtered by slug tags.

**It is NOT:**
- A code editor or IDE
- A deployment dashboard (that's SupraVibe)
- A project management tool
- A general-purpose chatbot

### Relationship to SupraVibe

SupraCRM shares the **same Supabase project** as SupraVibe (SupraAgent/Coder). They share:
- `auth.users` (same GitHub OAuth login)
- `profiles` table (extended with `crm_role` column)
- `user_tokens` table (CRM adds `telegram_bot` provider)
- Same Supabase URL, anon key, service role key, and encryption key

They do NOT share:
- Code (separate repos, separate deployments)
- CRM-specific tables (prefixed `crm_`, `tg_`, `pipeline_stages`)
- UI components (copied at init, will diverge)

### Core User Flow

1. Team member logs in with GitHub (same Supabase Auth as SupraVibe)
2. Admin connects Telegram bot token in Settings > Integrations
3. Bot is added as admin to Telegram groups
4. Groups appear in TG Groups page, tagged with slugs
5. Deals are created and moved through the 7-stage pipeline
6. Stage changes trigger bot messages to linked Telegram chats
7. Slug-based access control: 1-click add/remove users to all groups with a given slug

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16, React 19 |
| Styling | Tailwind CSS v3, dark-mode-only, HSL CSS variables |
| Database | Supabase (PostgreSQL), shared with SupraVibe |
| Auth | GitHub OAuth via Supabase Auth |
| Encryption | AES-256-GCM for stored tokens |
| Bot | grammy (Node.js Telegram Bot API) -- separate process |
| Package manager | npm |
| Port | 3002 (`npm run dev:app`) |

---

## Pipeline Stages (Default)

| Position | Stage | Meaning |
|----------|-------|---------|
| 1 | Potential Client | Initial contact identified |
| 2 | Outreach | Active outreach in progress |
| 3 | Calendly Sent | Calendly link sent to prospect |
| 4 | Video Call | Call scheduled or occurred |
| 5 | Follow Up | Post-call follow-up phase |
| 6 | MOU Signed | Legal agreement signed |
| 7 | First Check Received | Payment/first transaction completed |

### Board Views

- **BD Board** -- deals where `board_type = 'BD'`
- **Marketing Board** -- deals where `board_type = 'Marketing'`
- **Admin Board** -- deals where `board_type = 'Admin'`

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
│   └── pipeline/          # Pipeline config
├── auth/callback/         # GitHub OAuth callback
├── login/                 # Login page
├── pipeline/              # Kanban board (main CRM view)
├── contacts/              # Contact list
├── groups/                # TG group management
├── broadcasts/            # Broadcast tool
├── settings/              # Settings (general, integrations, pipeline, team)
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
├── crypto.ts              # AES-256-GCM token encryption
└── utils.ts               # cn() utility, timeAgo()

bot/                       # Telegram bot (Phase 2, separate Node.js process)

supabase/migrations/       # SQL migrations for CRM tables
```

---

## Database Tables (CRM-specific)

| Table | Purpose |
|-------|---------|
| `pipeline_stages` | Configurable 7-stage pipeline |
| `crm_contacts` | Contacts with Telegram identities |
| `crm_deals` | Deals linked to contacts, stages, boards, and TG chats |
| `crm_deal_stage_history` | Stage change log for automation triggers |
| `tg_groups` | Telegram groups where bot is admin |
| `tg_group_slugs` | Slug tags on TG groups (junction) |
| `crm_user_slug_access` | Which users can access which slug-tagged groups |
| `crm_slug_access_log` | Audit log for bulk access changes |
| `crm_workflows` | Visual automation workflows (React Flow nodes/edges as JSONB) |
| `crm_workflow_runs` | Workflow execution history |
| `crm_workflow_templates` | Reusable workflow templates (built-in + user-saved) |
| `crm_ai_agent_config` | AI chatbot configuration (role prompt, escalation) |
| `crm_ai_conversations` | AI conversation log with qualification data |
| `crm_bots` | Multi-bot registry with encrypted tokens |

Shared table extension: `profiles.crm_role` (bd_lead, marketing_lead, admin_lead)

---

## Key Design Patterns

- **Same as SupraVibe**: `{ data, source }` API responses, null-safe clients, admin client for cross-user queries, dark-mode-only, no external component libraries.
- **Auth middleware redirects** to /login for unauthenticated users (unlike SupraVibe which shows empty states).
- **CRM tables prefixed** with `crm_` or `tg_` to avoid collisions with SupraVibe tables in the same database.
- **Bot runs as separate process** (not API route) for persistent connections and scheduled jobs.

---

## Environment Variables

```env
NEXT_PUBLIC_SUPABASE_URL=        # Same as SupraVibe
NEXT_PUBLIC_SUPABASE_ANON_KEY=   # Same as SupraVibe
SUPABASE_SERVICE_ROLE_KEY=       # Same as SupraVibe
TOKEN_ENCRYPTION_KEY=            # Same as SupraVibe
TELEGRAM_BOT_TOKEN=              # Phase 2
ANTHROPIC_API_KEY=               # Claude AI features (chat widget, sentiment, summaries)
```

---

## Build Phases

| Phase | Status | Scope |
|-------|--------|-------|
| Phase 0: Foundation | Done | Repo, scaffold, auth, app shell, migration, page stubs |
| Phase 1: CRM Core | Done | Kanban drag-drop, deals/contacts CRUD, board views, deal detail, custom fields, duplicate detection, pipeline summary bar, collapsible columns, WIP limits, task priorities & assignment |
| Phase 2: Telegram Bot | Done | grammy bot, group registration, stage-change messages, bot templates, multi-bot registry, merge variables, broadcast personalization |
| Phase 3: Access Control | Done | Slugs, matrix UI, bulk add/remove, audit log, automations, broadcasts, outreach sequences, workflows |
| Phase 4: Polish | Done | Mobile TMA, view density, animations, onboarding wizard, privacy/GDPR, competitive scoring improvements |
| Phase 5: AI & Automation | Done | Visual workflow builder (React Flow), AI agent, sentiment analysis, global AI chat assistant |
| Phase 6: AI Chat & Templates | Done | Global Claude-powered chat widget on every page, per-page context, workflow templates (built-in + user-saved), AI template suggestions |
| **P0: TG Moat** | **Next** | TG conversation timeline in deal detail, full TMA (tasks, AI chat, broadcasts), outreach sequence branching |
| P1: Scale | Pending | Bot drip sequences, auto-assignment rules, engagement scoring, unified inbox, saved views |
| P2: #1 | Pending | Payment tracking, AI chatbot flows, public REST API, TG folder sync, custom fields on deals/groups |
| P3: Polish | Pending | AI summaries, multi-workspace, QR capture, calendar/timeline views |

**Target:** CRMChat (#1 at 80.5). Current score: ~64. See `strategic-roadmap.md` for full competitive analysis.

---

## What NOT to Do

- Don't install large component libraries (Material UI, Chakra, Ant Design)
- Don't change the dark mode design system -- extend it
- Don't restructure the shared Supabase tables (profiles, user_tokens, auth.users)
- Don't add SupraVibe features (deployments, GitHub activity, fork-and-compare)
- Don't build the bot inside Next.js API routes -- it runs as a separate process
- Don't over-architect -- this is an internal tool for a small team
