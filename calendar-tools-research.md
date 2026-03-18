# Open Source Calendar & Scheduling Tools
**Research Report | March 2026**
*For integration into SupraCRM — replacing the "Calendly Sent" pipeline stage with native scheduling*

---

## Tier 1: Strongest Candidates

### 1. Cal.com (formerly Calendso)

| Field | Detail |
|---|---|
| GitHub | [calcom/cal.com](https://github.com/calcom/cal.com) |
| Stars | ~40,600 |
| License | **AGPLv3** (core). Some components MIT. Commercial license for "Multiplayer APIs." Enterprise features require a paid license key. |
| Tech stack | Next.js, React, TypeScript, Prisma, PostgreSQL, tRPC, Tailwind CSS |
| Self-hostable | Yes (Docker, or manual) |
| Active development | Very active. Largest project in this space. |

**Key features:**
- Google Calendar, Outlook/O365, Apple Calendar sync (bidirectional)
- Scheduling links (direct Calendly replacement)
- Round-robin, collective, and group scheduling
- Automated reminders (email, SMS)
- Booking via API: `POST /v2/bookings` with attendee + guest emails
- React embed: `@calcom/embed-react` (inline, popup, floating button)
- Cal Atoms: individual React components (`Booker`, `AvailabilitySettings`, etc.) for pixel-level integration
- Webhooks on booking creation/cancellation
- Workflows (automated sequences on events)

**API surface:**
- Full REST API v2 at `/v2/` -- create event types, create bookings programmatically, manage availability, query freebusy
- JS SDK, React embed, webhooks
- Can programmatically create bookings that send calendar invites to attendees

**AI features:** None built-in.

**Maturity:** Production-ready. Used by thousands of companies. The dominant open-source scheduling tool.

**CRM integration relevance:** HIGH. You could embed Cal.com booking pages directly in your deal detail view. When a deal moves to "Calendly Sent," auto-generate a Cal.com scheduling link via API. Webhook on booking confirmation could advance the deal to "Video Call" stage.

**License caveat:** AGPLv3 means if you modify and serve Cal.com, you must open-source your modifications. For embedding via API/iframe/atoms this is likely fine -- you are not modifying Cal.com itself. But check with legal if you plan to fork it deeply.

---

### 2. FluidCalendar

| Field | Detail |
|---|---|
| GitHub | [dotnetfactory/fluid-calendar](https://github.com/dotnetfactory/fluid-calendar) |
| Stars | ~2,000+ (growing) |
| License | **MIT** |
| Tech stack | Next.js 15, TypeScript, Prisma, PostgreSQL, FullCalendar, NextAuth.js, Tailwind CSS |
| Self-hostable | Yes (Docker) |
| Active development | Very active. V2 development ongoing (Jan 2026 update). |

**Key features:**
- Google Calendar, Outlook/O365, CalDAV sync
- AI-powered task auto-scheduling (matches tasks to available time slots based on priority, energy, deadlines)
- Booking links (new in V2)
- Calendar merging from multiple sources
- Conflict detection

**API surface:**
- Public API on the roadmap (planned 2026)
- Currently internal Next.js API routes

**AI features:** Yes -- intelligent task scheduling. Matches high-focus tasks to peak hours, reserves low-energy times for admin work. ML-based energy/focus prediction planned.

**Maturity:** Early/alpha. The author explicitly warns it "contains many bugs and incomplete features" and is "not yet recommended for production use."

**CRM integration relevance:** MEDIUM. The MIT license and identical tech stack (Next.js, Prisma, PostgreSQL, Tailwind) make it the easiest to fork or borrow code from. The booking links feature in V2 could replace Calendly. But it is not production-ready yet.

---

### 3. CloudMeet

| Field | Detail |
|---|---|
| GitHub | [dennisklappe/CloudMeet](https://github.com/dennisklappe/CloudMeet) |
| Stars | ~300 |
| License | **MIT** |
| Tech stack | SvelteKit, Svelte 5, TypeScript, Cloudflare Pages/Workers/D1, Tailwind CSS |
| Self-hostable | Yes (Cloudflare free tier) |
| Active development | Active (2025-2026 commits) |

**Key features:**
- Google Calendar + Outlook sync (checks availability across both)
- Scheduling links (Calendly-style booking pages)
- Automatic email reminders (24h and 1h before)
- Runs entirely on Cloudflare free tier (zero hosting cost)

**API surface:** Minimal. No documented public API for programmatic booking creation.

**AI features:** None.

**Maturity:** Early but functional. Good for simple use cases.

**CRM integration relevance:** LOW-MEDIUM. MIT license is great, but SvelteKit stack means no code reuse with your Next.js/React CRM. Would work as a standalone deployment with links generated manually.

---

## Tier 2: Specialized / Partial Fit

### 4. Nettu Scheduler

| Field | Detail |
|---|---|
| GitHub | [fmeringdal/nettu-scheduler](https://github.com/fmeringdal/nettu-scheduler) |
| Stars | ~560 |
| License | **MIT** |
| Tech stack | Rust (server), PostgreSQL, JS SDK, REST API |
| Self-hostable | Yes (Docker or Cargo build) |
| Active development | **Inactive since ~2021-2022.** |

**Key features:**
- Calendar events with recurrence rules
- Freebusy queries
- Booking system (register users on a Service to make them bookable)
- Google + Outlook calendar integration
- Multi-tenancy, metadata queries, webhooks
- JS SDK: `@nettu/sdk-scheduler`

**API surface:** Excellent for programmatic use. Pure API server -- no UI. REST endpoints for calendars, events, bookings, freebusy. JWT + API key auth.

**CRM integration relevance:** The architecture (API-only calendar/booking server) is exactly what you would want as a backend. But the project is dead. Useful as a reference for building your own.

---

### 5. Someday

| Field | Detail |
|---|---|
| GitHub | [rbbydotdev/someday](https://github.com/rbbydotdev/someday) |
| Stars | ~3,200 |
| License | **MIT** |
| Tech stack | React, TypeScript, Vite, Shadcn/UI, Google Apps Script |
| Self-hostable | Yes (free via Google Apps Script) |

**Key features:**
- Google Calendar integration (read availability, create events)
- Scheduling links for Gmail users
- Customizable work hours, timezone support
- Zero hosting cost (runs on Google Apps Script)

**CRM integration relevance:** LOW. Gmail-only, no Outlook support, no general API. The React/TypeScript/Shadcn UI code could be a reference for building your own scheduling UI.

---

### 6. Rallly

| Field | Detail |
|---|---|
| GitHub | [lukevella/rallly](https://github.com/lukevella/rallly) |
| Stars | ~5,000 |
| License | **AGPLv3** |
| Tech stack | Next.js, Prisma, tRPC, PostgreSQL, Tailwind CSS |

Poll-based scheduling (Doodle alternative, not Calendly alternative). Wrong tool for the "Calendly Sent" use case.

---

### 7. Huly

| Field | Detail |
|---|---|
| GitHub | [hcengineering/platform](https://github.com/hcengineering/platform) |
| Stars | ~25,000 |
| License | **EPL-2.0** (Eclipse Public License) |
| Tech stack | Svelte, TypeScript, custom framework |

Full project management platform with built-in CRM and calendar. Interesting but adopting it means replacing SupraCRM entirely. Worth monitoring.

---

### 8. Easy!Appointments

| Field | Detail |
|---|---|
| GitHub | [alextselegidis/easyappointments](https://github.com/alextselegidis/easyappointments) |
| Stars | ~3,000 |
| License | **GPL v3.0** |
| Tech stack | PHP, MySQL, jQuery |

Battle-tested appointment booking with Google Calendar sync and REST API. PHP/MySQL stack and GPL license make it a poor fit for SupraCRM integration.

---

## Tier 3: Libraries for Building Your Own

If you choose to build scheduling directly into SupraCRM rather than deploying a separate tool:

| Library | npm | License | Purpose |
|---|---|---|---|
| [ical-generator](https://github.com/sebbo2002/ical-generator) | `ical-generator` | MIT | Generate .ics calendar files/invites programmatically |
| [ics](https://github.com/adamgibbons/ics) | `ics` | MIT | Simpler .ics file generation (single events) |
| [node-ical](https://github.com/jens-maus/node-ical) | `node-ical` | MIT | Parse incoming .ics files |

These let you create calendar invites (.ics attachments) that you send via email from your CRM. When the recipient accepts, the event appears in their Google/Outlook calendar. No external scheduling service needed.

---

## Comparison Matrix

| Project | License | Stars | Tech Stack Match | Gmail/Outlook Sync | Scheduling Links | Programmatic Invite API | Self-Host | AI | Maturity | CRM Fit |
|---|---|---|---|---|---|---|---|---|---|---|
| **Cal.com** | AGPL-3.0 | 40.6k | High (Next.js/React/TS) | Yes/Yes | Yes | Yes (REST API) | Yes | No | Production | **Best** |
| **FluidCalendar** | **MIT** | ~2k | **Exact match** (Next.js/Prisma/PG) | Yes/Yes | Yes (V2) | Planned | Yes | Yes | Alpha | High potential |
| **CloudMeet** | **MIT** | 300 | Low (SvelteKit) | Yes/Yes | Yes | No | Yes | No | Early | Medium |
| **Nettu Scheduler** | **MIT** | 560 | Medium (Rust+JS SDK) | Yes/Yes | Via API | Yes (REST) | Yes | No | **Abandoned** | Reference only |
| **Someday** | **MIT** | 3.2k | Medium (React/TS) | Yes/No | Yes | No | Yes | No | Stable | Low |
| **Rallly** | AGPL-3.0 | 5k | High (Next.js/Prisma) | No | No (polls) | No | Yes | No | Production | Wrong tool |
| **Huly** | EPL-2.0 | 25k | Low (Svelte) | Yes/No | No | No | Yes | No | Production | Overkill |
| **Easy!Appointments** | GPL-3.0 | 3k | None (PHP) | Yes/No | Yes | Yes (REST) | Yes | No | Production | Low |

---

## Recommendations for SupraCRM

### Option A -- Deploy Cal.com alongside SupraCRM (fastest, most complete)

- Self-host Cal.com (Docker). It uses PostgreSQL, but keep it on a separate database.
- Use Cal.com API to programmatically create scheduling links when a deal enters "Calendly Sent" stage.
- Embed Cal.com booking widget in deal detail pages using `@calcom/embed-react`.
- Use Cal.com webhooks to detect completed bookings and auto-advance deals to "Video Call" stage.
- License concern: AGPL-3.0 applies to Cal.com itself, not to your CRM that calls its API. If you only use it via API/embed, your CRM code stays private.

### Option B -- Build lightweight scheduling into SupraCRM (more control, more work)

- Use `ical-generator` (MIT) to create .ics invite files programmatically.
- Build a simple availability page (borrow patterns from FluidCalendar or Someday, both MIT).
- Store availability rules in Supabase. Expose a public booking endpoint.
- On booking, create a calendar event via Google Calendar API / Microsoft Graph API and send .ics invite via email.
- No external service dependency. Full control. But significant engineering effort.

### Option C -- Wait for FluidCalendar to mature

- Identical tech stack (Next.js, Prisma, PostgreSQL, Tailwind). MIT license.
- V2 is adding booking links.
- Could fork and adapt to SupraCRM's needs.
- Risk: project is early/alpha with acknowledged bugs. Timeline uncertain.

**Assessment:** Option A (Cal.com) is the pragmatic choice for a small internal team that wants to ship fast. The API is mature, the React embed works, and the scheduling link generation covers the "Calendly Sent" stage perfectly. Option B makes sense only if you need very tight integration and want zero external dependencies.

---

*Sources: [Cal.com GitHub](https://github.com/calcom/cal.com) | [Cal.com API Docs](https://cal.com/docs/api-reference/v2/bookings/create-a-booking) | [Cal.com Embed React](https://www.npmjs.com/package/@calcom/embed-react) | [FluidCalendar GitHub](https://github.com/dotnetfactory/fluid-calendar) | [CloudMeet GitHub](https://github.com/dennisklappe/CloudMeet) | [Nettu Scheduler GitHub](https://github.com/fmeringdal/nettu-scheduler) | [Someday GitHub](https://github.com/rbbydotdev/someday) | [Rallly GitHub](https://github.com/lukevella/rallly) | [Huly GitHub](https://github.com/hcengineering/platform) | [Easy!Appointments GitHub](https://github.com/alextselegidis/easyappointments)*
