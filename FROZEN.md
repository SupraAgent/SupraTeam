# Feature Surface Freeze

**Effective:** 2026-04-04
**Status:** Active — maintenance-only for everything not listed below

## What This Means

No new API routes, no new pages, no new integrations, no new database tables.
Bug fixes and security patches are always allowed.

## Active Development (unfrozen)

These features are actively being built or enhanced:

| # | Feature | Scope |
|---|---------|-------|
| 1 | Pipeline urgency sort + badges | `components/pipeline/kanban-board.tsx`, `kanban-column.tsx` |
| 2 | Inbox deal context sidebar | `components/inbox/deal-context-sidebar.tsx`, `app/inbox/page.tsx` |
| 3 | TMA inline reply | `app/tma/deals/[id]/page.tsx`, `app/tma/inbox/page.tsx` |
| 4 | Conversation-triggered automations | `bot/handlers/messages.ts`, `bot/handlers/sla-poller.ts`, `lib/workflow-engine.ts`, `lib/loop-workflow-engine.ts` |

## Frozen (maintenance-only)

Everything else, including but not limited to:

- Email integration (`app/email/`, `app/api/email/`)
- Calendar integration (`app/calendar/`, `app/api/calendar/`)
- Broadcasts (`app/broadcasts/`, `app/api/broadcasts/`)
- Companies (`app/companies/`)
- Reports (`app/reports/`)
- Settings (all subsections except integrations needed for active features)
- Automations visual builder UI (`app/automations/` — engine changes allowed per Feature 4)
- Contacts list UI (`app/contacts/`)
- Outreach sequences (`app/outreach/`)
- Conversations AI page (`app/conversations/`)

## Rules

1. **No new dependencies** unless required by an active feature
2. **No new API routes** outside active feature scope
3. **No schema migrations** unless required by an active feature
4. **Bug fixes** in frozen areas are allowed but should be minimal
5. **Security patches** are always allowed everywhere
6. Review this document when active features are shipped — unfreeze the next priority
