# Open Source Superhuman Alternatives
**Research Report | March 2026**
*Productivity email clients with keyboard-driven workflows, AI features, and inbox-zero focus*

---

## 1. What Superhuman Does (Benchmark)

Superhuman is a premium email client ($30/month) layered on top of Gmail and Outlook. Core value: speed and keyboard-driven workflow — every action under 100ms, full inbox without touching the mouse. Claimed benefit: 4 hours saved per person per week.

**Key features to replicate:**
- Comprehensive keyboard shortcut system (vim-like navigation)
- AI-drafted replies written in the user's voice
- Inbox splits and triage workflow toward inbox zero
- Read receipts and email tracking
- Snooze, send later, follow-up reminders
- Natural language AI search across full email history
- Thread summaries
- Team shared comments on email threads

---

## 2. Open Source Projects

### 2.1 Mailspring
**GitHub:** github.com/Foundry376/Mailspring | **License:** GPLv3 | **Stars:** 16k+

The most mature open source Superhuman alternative. Forked from Nylas Mail in 2017. C++ sync engine (Mailcore2) + TypeScript/Electron/React UI. Email credentials never leave the machine. Free tier is genuinely usable; Pro ($8/month) adds read receipts, send-later, link tracking, and mailbox analytics.

**Strengths:**
- Unified inbox: Gmail, Outlook, iCloud, Yahoo, IMAP/SMTP
- Plugin architecture — themes, plugins, Discourse community
- Active maintenance: latest release July 2025 (Electron 37, Chromium 138, Wayland on Linux)
- Advanced Gmail-style search across all accounts
- Thunderbird-style autoconfiguration as of v1.16

**Weaknesses:**
- No native AI drafting or thread summarization
- Performance can lag with 100k+ message mailboxes
- Electron-based — not quite native speed

---

### 2.2 Inbox Zero
**GitHub:** github.com/elie222/inbox-zero | **License:** AGPL-3.0 | **Stars:** 14k+

AI-first email utility layered on Gmail. Not a full standalone client — primary purpose is bulk unsubscribing, AI-automated email rules, and triage automation. Best compared to Fyxer, Cora, or SaneBox rather than a direct Superhuman client replacement.

**Standout features:**
- Bulk newsletter unsubscribe with percentage-read analytics
- AI agents that automatically act on incoming email (label, forward, reply, archive)
- AI drafts replies in your writing voice based on prior history
- Cold email blocking
- Self-hostable via Docker

**Weaknesses:**
- Gmail-only — no Outlook, IMAP, or multi-provider support
- Basic email client (beta) — not for daily primary use
- No keyboard-shortcut power workflow comparable to Superhuman

---

### 2.3 Mail-0 / Zero (0.email)
**GitHub:** github.com/Mail-0/Zero | **License:** MIT | **Stars:** 10k+

Modern AI-native, self-hostable email client. Stack: Next.js, React, TypeScript, TailwindCSS, Shadcn UI. Uses Cloudflare Durable Objects and R2 buckets for email storage. Early stage but fast-moving with strong developer community (active Discord).

**Core value propositions:**
- Full self-hosting — your emails, your infrastructure
- AI agent integration via LLMs for email automation
- Unified inbox: Gmail, Outlook, and more
- Privacy-first: no tracking, no data selling
- Developer-friendly architecture with extensibility built in

**Weaknesses:**
- Still early stage — roadmap features not yet shipped
- Requires technical setup (PostgreSQL, Redis, Google API credentials)
- Not yet a daily-driver replacement for non-developers

---

### 2.4 Velo
**GitHub:** github.com/avihaymenahem/velo | **License:** Open Source | **Status:** Early/Active

The project most directly inspired by Superhuman. Desktop client built on Tauri v2 (Rust backend) for native performance. Small binary, low memory, instant startup. Explicitly Superhuman-inspired keyboard shortcuts as a core design goal.

**Why it stands out:**
- Rust backend via Tauri = genuine native performance (not Electron)
- Explicitly Superhuman-inspired keyboard navigation
- AI: thread summaries, smart replies, AI compose, NL inbox search, text transform (improve/shorten/formalize)
- Privacy by default: remote images blocked, HTML sanitized, sandboxed iframes, local data
- Google Calendar sync with month/week/day views
- Multi-account: Gmail API + IMAP/SMTP (Outlook, Yahoo, iCloud, Fastmail)

**Weaknesses:**
- Early stage — smaller community vs. Mailspring or Inbox Zero
- Desktop only — no web or mobile

---

### 2.5 Mozilla Thunderbird
**GitHub:** github.com/mozilla/releases-comm-central | **License:** MPL 2.0 | **Status:** Mature

The original open source email client benchmark. Fully free, maintained by Mozilla Foundation. Supports IMAP, POP3, Exchange. Rich add-on ecosystem can replicate many Superhuman features individually. Interface reflects legacy design patterns — not optimized for keyboard-first triage out of the box.

**Best for:**
- Zero cost + maximum protocol compatibility
- S/MIME encryption and OpenPGP
- Linux users (Wayland support)

**Weaknesses:**
- Legacy UI paradigm — not designed for Superhuman-style speed
- AI features require third-party add-ons
- Slower development pace

---

### 2.6 K-9 Mail (Android)
**GitHub:** github.com/thunderbird/thunderbird-android | **License:** Apache 2.0 | **Stars:** 10k+

De facto standard open source Android email client. Multi-folder sync, strong IMAP, OpenPGP encryption. Now maintained under the Thunderbird umbrella. Best open source option for Android mobile, though not a Superhuman workflow analog.

---

### 2.7 FairEmail (Android)
**GitHub:** github.com/M66B/FairEmail | **License:** GPL-3.0 | **Stars:** 2k+

Privacy-focused Android client with end-to-end encryption (OpenPGP and S/MIME), unified inbox, and phishing-resistant email rendering. Designed for security over productivity speed.

---

## 3. Feature Comparison Matrix

| Feature | Mailspring | Inbox Zero | Mail-0/Zero | Velo | Thunderbird |
|---|---|---|---|---|---|
| Keyboard shortcuts (Superhuman-style) | Yes | Partial | Yes | Yes (core feature) | Yes (customizable) |
| Inbox zero workflow | Yes (Snooze, rules) | Yes (primary focus) | Yes | Yes | Yes (add-ons) |
| AI-powered drafting | No (Pro: send-time) | Yes (in your voice) | Yes (agents) | Yes | Via add-ons |
| Thread summarization | No | No | Planned | Yes | No |
| Read receipts / tracking | Pro only | No | No | No | Via add-ons |
| Snooze / reminders | Free (limited) | No | Planned | No | Via add-ons |
| Send later | Free (limited) | No | Planned | No | Via add-ons |
| Bulk unsubscribe | No | Yes (standout) | No | No | No |
| Self-hostable | No | Yes | Yes (core feature) | No | N/A (desktop) |
| Plugin/extension system | Yes (JS plugins) | No | No (but open) | No | Yes (broad) |
| Multi-account unified inbox | Yes | Gmail only | Yes | Yes | Yes |
| Privacy / local-first | Partial | Partial | Yes | Yes (Rust, local) | Yes |

---

## 4. Project Overview Summary

| Project | Type | License | Platforms | Email Providers | AI Features | GitHub Stars |
|---|---|---|---|---|---|---|
| Mailspring | Full Client | GPLv3 | Mac/Win/Linux | Gmail, Outlook, IMAP/SMTP, iCloud, Yahoo | Send-time optimization (Pro) | 16k+ |
| Inbox Zero | AI Layer/Client | AGPL-3.0 | Web | Gmail | Auto-replies, AI triage, bulk unsub | 14k+ |
| Mail-0 / Zero | Full Client + Self-host | MIT | Web (self-host) | Gmail, Outlook, more | AI agents, LLM-powered actions | 10k+ |
| Velo | Full Client | Open Source | Desktop (Tauri) | Gmail API, IMAP/SMTP | Thread summary, AI compose, NL search | Early stage |
| Mozilla Thunderbird | Full Client | MPL 2.0 | Mac/Win/Linux | IMAP, POP3, Exchange, Gmail | Basic (add-ons) | Mature |
| K-9 Mail | Mobile Client | Apache 2.0 | Android | IMAP, POP3 | None native | 10k+ |
| FairEmail | Mobile Client | GPL-3.0 | Android | IMAP, POP3, S/MIME, OpenPGP | None native | 2k+ |

---

## 5. Weighted Ratings vs. Superhuman

*Scored against Superhuman's core value props: speed/keyboard workflow, AI depth, UX polish, developer activity, overall parity.*

| Project | Superhuman Parity | AI Depth | Ease of Use | Dev Activity | Overall Score |
|---|---|---|---|---|---|
| Mailspring | 7/10 | 4/10 | 8/10 | 8/10 | 7/10 |
| Inbox Zero | 5/10 | 8/10 | 7/10 | 9/10 | 7/10 |
| Mail-0 / Zero | 6/10 | 7/10 | 6/10 | 7/10 | 6.5/10 |
| Velo | 8/10 | 8/10 | 7/10 | 6/10 | 7.5/10 |
| Thunderbird | 5/10 | 2/10 | 5/10 | 8/10 | 5/10 |
| K-9 Mail | 3/10 | 1/10 | 7/10 | 7/10 | 4/10 |
| FairEmail | 3/10 | 1/10 | 5/10 | 7/10 | 4/10 |

---

## 6. Recommendations

**Best overall open source Superhuman replacement:**
- **Velo** — most directly Superhuman-inspired, Rust-native performance, strongest AI feature set. Best pick if you want the workflow analog. Caveat: early stage.
- **Mailspring** — best mature option. Solid daily driver, plugin ecosystem, active maintenance. Gap is AI features.

**Best for AI-first inbox automation:**
- **Inbox Zero** — best-in-class for AI triage, bulk unsubscribe, and automated email handling. Layer it on top of Gmail alongside any other client.

**Best for developers / self-hosters:**
- **Mail-0 / Zero** — MIT license, modern stack, privacy architecture. Best if you want to own the infrastructure and customize deeply.

**Best for maximum compatibility / legacy:**
- **Thunderbird** — zero cost, proven, broadest protocol support. Not a speed-workflow replacement but unbeatable for reliability and add-on breadth.

**Recommended combination for power users:**
Velo (or Mailspring) as primary client + Inbox Zero as AI automation layer on top of Gmail. Covers the full Superhuman workflow gap at $0/month.

---

## 7. GitHub Repository Links

- Mailspring — https://github.com/Foundry376/Mailspring
- Inbox Zero — https://github.com/elie222/inbox-zero
- Mail-0 / Zero — https://github.com/Mail-0/Zero
- Velo — https://github.com/avihaymenahem/velo
- K-9 Mail — https://github.com/thunderbird/thunderbird-android
- FairEmail — https://github.com/M66B/FairEmail
- Mozilla Thunderbird — https://github.com/mozilla/releases-comm-central

---

*Research compiled March 2026. GitHub star counts approximate. Feature statuses based on latest releases.*
