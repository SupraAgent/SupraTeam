# SupraCRM Email — Roadmap
**Created:** 2026-03-18

---

## v1: Personal Email (Current Build)

All phases E0–E6 from `email-integration-plan.md`.

| Phase | Scope | Status |
|-------|-------|--------|
| E0 | Gmail OAuth + connections | Planned |
| E1 | Inbox view + keyboard shortcuts | Planned |
| E2 | Compose/reply with TipTap | Planned |
| E3 | CRM ↔ email auto-linking | Planned |
| E4 | AI features (Claude via Anthropic) | Planned |
| E5 | Snooze, send later, reminders | Planned |
| E6 | Templates & BD sequences | Planned |

**Provider:** Gmail only. Personal inboxes. Each user connects their own account.

---

## v2: Shared Inboxes + Outlook

### v2.1: Shared Team Inboxes

**Goal:** Team-level email addresses (bd@supra.com, marketing@supra.com, admin@supra.com) accessible to multiple CRM users simultaneously.

**How it works with Google Workspace:**

| Approach | How | Pros | Cons |
|----------|-----|------|------|
| **A. Google Groups as collaborative inbox** | Create bd@supra.com as a Google Group with "Collaborative Inbox" enabled. Members see shared email in CRM. | No extra licenses. Built into Workspace. Simple. | No individual sent-from. Limited granularity. |
| **B. Shared mailbox via delegation** | Create bd@supra.com as a regular Workspace user. Grant delegate access to team members. CRM uses OAuth on behalf of delegates. | Full send-as support. Familiar Gmail behavior. | Requires extra Workspace license per shared address. |
| **C. Domain-wide delegation (service account)** | Google Cloud service account with domain-wide delegation. CRM backend impersonates bd@supra.com directly. | No user OAuth needed for shared box. Backend-driven. | Requires Workspace admin. Broader security surface. |

**Recommended: Option B** — simplest, most intuitive, and each team member can send as bd@supra.com while keeping personal inbox separate.

**Database additions:**

```sql
CREATE TABLE crm_shared_inboxes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,           -- bd@supra.com
  display_name TEXT NOT NULL,           -- "BD Team"
  board_type TEXT,                      -- links to BD/Marketing/Admin board
  connection_id UUID REFERENCES crm_email_connections(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE crm_shared_inbox_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inbox_id UUID REFERENCES crm_shared_inboxes(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  can_send BOOLEAN DEFAULT true,
  UNIQUE(inbox_id, user_id)
);

-- Thread assignment within shared inbox
CREATE TABLE crm_shared_inbox_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inbox_id UUID REFERENCES crm_shared_inboxes(id) ON DELETE CASCADE,
  thread_id TEXT NOT NULL,
  assigned_to UUID REFERENCES auth.users(id),
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'assigned', 'done', 'snoozed')),
  assigned_at TIMESTAMPTZ DEFAULT now()
);
```

**UI changes for shared inboxes:**

```
┌──────────────────────────────────────────────────────┐
│  Inbox Switcher                                       │
│  ┌─────────────────────┐                             │
│  │ 📧 jon@supra.com    │  ← personal (default)      │
│  │ 👥 BD Team          │  ← bd@supra.com (shared)   │
│  │ 👥 Admin            │  ← admin@supra.com (shared) │
│  └─────────────────────┘                             │
├──────────────────────────────────────────────────────┤
│ Shared inbox features:                                │
│ - Thread assignment (claim / assign to teammate)      │
│ - Status: Open → Assigned → Done                     │
│ - Internal notes on threads (visible to team only)    │
│ - Collision detection (see who's typing a reply)      │
│ - @mention teammates in thread notes                  │
│ - Filter: My assigned | Unassigned | All              │
└──────────────────────────────────────────────────────┘
```

**Shared inbox workflow:**
1. Email arrives at bd@supra.com → appears in shared inbox for all BD members
2. Team member claims thread ("Assign to me") or lead assigns it
3. Assignee drafts reply — other members see "Jon is replying..." indicator
4. Reply sent from bd@supra.com (not personal address)
5. Thread marked "Done" → moves out of active queue
6. All activity logged to deal timeline if thread is linked to a deal

**Key differences from personal inbox:**

| Feature | Personal | Shared |
|---------|----------|--------|
| Visibility | Only you | All members |
| Send-as | your@email.com | shared@supra.com |
| Assignment | N/A | Claim or assign |
| Thread status | Read/unread | Open/assigned/done |
| Collision detection | N/A | Yes (typing indicators) |
| Internal notes | N/A | Yes (team-only comments) |

### v2.2: Outlook Support

**Scope:** Add Microsoft Graph API driver alongside Gmail.

**What's needed:**
- `lib/email/outlook.ts` — Outlook driver implementing `MailDriver` interface
- `@microsoft/microsoft-graph-client` + `@azure/msal-node` dependencies
- Azure app registration (OAuth credentials)
- `POST /api/email/connections/outlook` + callback route
- Provider selector in connection UI

**The driver abstraction from v1 (`lib/email/driver.ts`) is designed to make this a clean addition.** The `MailDriver` interface is provider-agnostic — Outlook just implements the same methods.

---

## v3: Advanced Features

| Feature | Description | Priority |
|---------|-------------|----------|
| **Email analytics** | Open rates, reply rates, response time per team member | Medium |
| **Meeting scheduler** | Cal.com integration (see `calendar-tools-research.md`) — auto-generate scheduling links in "Calendly Sent" stage | High |
| **Email-to-deal automation** | Rules: "If email from @company.com, auto-create deal in BD board" | Medium |
| **Thread sentiment analysis** | AI flags threads with negative sentiment for attention | Low |
| **Email signatures** | Team-consistent signatures managed centrally | Medium |
| **Attachment management** | CRM-wide attachment search, link attachments to deals | Low |
| **Mobile email** | Responsive email UI for mobile CRM access | High |
| **Push notifications** | Gmail Pub/Sub for real-time inbox updates (no polling) | High |
| **Offline mode** | Dexie/IndexedDB for reading cached threads offline | Low |

---

## Timeline Estimate

| Version | Scope | Estimate |
|---------|-------|----------|
| **v1** (E0–E6) | Personal Gmail + full feature set | ~24-32 days |
| **v2.1** | Shared inboxes | ~8-10 days |
| **v2.2** | Outlook support | ~5-7 days |
| **v3** | Advanced features (pick and choose) | Ongoing |

---

*This roadmap lives in the repo and will be updated as decisions are made.*
