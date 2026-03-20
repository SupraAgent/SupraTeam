# AI Persona-Driven App Improvement Loop
**Research & Methodology | 2026-03-20**
**Applies to:** Any app built with Claude Code + [Persona-Builder](https://github.com/SupraAgent/Persona-Builder)

---

## The 5-Step Loop

```
┌─────────────────────────────────────────────────────────┐
│  1. TEAM        → 5 AI personas (roles + expertise)     │
│  2. APP         → Define what you're building           │
│  3. BENCHMARK   → 3 reference apps, scored 1-100       │
│  4. SELF-SCORE  → Rate your app on same criteria        │
│  5. IMPROVE     → [Button] Team makes changes → rescore │
│       ↑                                                 │
│       └──────── repeat until gap < 10 ──────────────────┘
└─────────────────────────────────────────────────────────┘
```

---

## Step 1: Create a Team of 5

Each persona is modeled after a real role at a real company. The team covers product, engineering, design, growth, and QA.

### Team Template

```yaml
team:
  name: "[Your App] Improvement Squad"
  goal: "Close the gap between [Your App] and industry leaders"
  members:

    - id: product_lead
      name: "Alex Chen"
      role: "Head of Product"
      modeled_after: "VP Product at [Reference App 1]"
      expertise: ["Feature prioritization", "User research", "Roadmap strategy"]
      personality: "Data-driven, user-obsessed, kills scope creep"
      reviews: ["Feature completeness", "User flows", "Value proposition"]
      vote_weight: 1.2

    - id: eng_lead
      name: "Sam Okafor"
      role: "Engineering Lead"
      modeled_after: "Staff Engineer at [Reference App 2]"
      expertise: ["Architecture", "Performance", "API design", "Reliability"]
      personality: "Pragmatic, hates over-engineering, ships fast"
      reviews: ["Technical implementation", "Performance", "Error handling"]
      vote_weight: 1.0

    - id: design_lead
      name: "Maya Torres"
      role: "Design Lead"
      modeled_after: "Head of Design at [Reference App 3]"
      expertise: ["UI/UX", "Design systems", "Accessibility", "Motion"]
      personality: "Opinionated on craft, pushes for polish, user empathy"
      reviews: ["UI quality", "UX flows", "Visual consistency", "Responsiveness"]
      vote_weight: 1.0

    - id: growth_lead
      name: "Raj Patel"
      role: "Growth & Analytics"
      modeled_after: "Head of Growth at [Reference App 1]"
      expertise: ["Onboarding", "Retention", "Analytics", "A/B testing"]
      personality: "Metric-obsessed, challenges assumptions, loves experiments"
      reviews: ["Onboarding flow", "Retention hooks", "Analytics coverage"]
      vote_weight: 0.8

    - id: qa_lead
      name: "Lena Kim"
      role: "QA & Reliability"
      modeled_after: "QA Director at [Reference App 2]"
      expertise: ["Testing", "Edge cases", "Error states", "Security"]
      personality: "Finds every bug, thinks in failure modes, blocks sloppy releases"
      reviews: ["Error handling", "Edge cases", "Security", "Auth flows"]
      vote_weight: 0.8
```

### How Personas Interact

| When... | Who leads | Who challenges |
|---------|-----------|----------------|
| New feature decision | Product Lead | Design Lead (UX), Growth (value) |
| Implementation approach | Eng Lead | QA Lead (reliability), Product (scope) |
| UI/UX changes | Design Lead | Product (priority), Growth (conversion) |
| Scoring disagreement | All vote | Weighted consensus (67%+ = pass) |
| Deadlock | Product Lead decides | With written justification |

---

## Step 2: Define the App

Simple brief that anchors the team:

```yaml
app:
  name: "Your App Name"
  description: "One-line description"
  target_users: "Who uses it"
  core_value: "Why they use it vs alternatives"
  tech_stack: "Framework, DB, hosting"
  current_state: "MVP / Beta / Production"
```

---

## Step 3: Benchmark Against 3 Reference Apps

Pick 3 apps that represent the best in your category. Rate THEM first — they set the ceiling.

### Rating Criteria (1-100 scale)

8 categories, each with 5 sub-criteria. Total possible: 800 points.

```
CATEGORY                    WEIGHT    SUB-CRITERIA
─────────────────────────────────────────────────────────────
1. Core Features            20%       Completeness, depth, reliability,
                                      differentiation, API/integrations

2. UI/UX Quality            15%       Visual design, consistency, responsiveness,
                                      navigation clarity, loading states

3. Onboarding & Setup       10%       Time to value, guided setup, documentation,
                                      first-run experience, config complexity

4. Performance              10%       Load time, interaction speed, search speed,
                                      real-time updates, offline/cache

5. Auth & Security          10%       Auth methods, session mgmt, encryption,
                                      role-based access, audit logging

6. Reliability              10%       Error handling, retry logic, data integrity,
                                      monitoring/alerts, graceful degradation

7. Customization            10%       Templates, settings, themes, workflows,
                                      extensibility/plugins

8. Team & Collaboration     15%       Multi-user support, permissions, shared views,
                                      notifications, activity feed
─────────────────────────────────────────────────────────────
TOTAL                       100%
```

### Reference App Scoring Template

```
┌──────────────────────────┬────────┬────────┬────────┐
│ Category (sub-criteria)  │ App A  │ App B  │ App C  │
├──────────────────────────┼────────┼────────┼────────┤
│ 1. CORE FEATURES         │        │        │        │
│   Completeness           │   /100 │   /100 │   /100 │
│   Depth                  │   /100 │   /100 │   /100 │
│   Reliability            │   /100 │   /100 │   /100 │
│   Differentiation        │   /100 │   /100 │   /100 │
│   API/Integrations       │   /100 │   /100 │   /100 │
│   Category avg           │   /100 │   /100 │   /100 │
├──────────────────────────┼────────┼────────┼────────┤
│ 2. UI/UX QUALITY         │        │        │        │
│   Visual design          │   /100 │   /100 │   /100 │
│   Consistency            │   /100 │   /100 │   /100 │
│   Responsiveness         │   /100 │   /100 │   /100 │
│   Navigation clarity     │   /100 │   /100 │   /100 │
│   Loading states         │   /100 │   /100 │   /100 │
│   Category avg           │   /100 │   /100 │   /100 │
├──────────────────────────┼────────┼────────┼────────┤
│ ... (repeat for all 8)   │        │        │        │
├──────────────────────────┼────────┼────────┼────────┤
│ WEIGHTED OVERALL         │   /100 │   /100 │   /100 │
└──────────────────────────┴────────┴────────┴────────┘
```

---

## Step 4: Score Your App

Same criteria, same scale. Each persona scores independently, then consensus:

```
┌──────────────────────────┬────────┬────────┬────────┬────────┬────────┬────────┐
│ Category                 │Product │ Eng    │Design  │Growth  │  QA    │Consensus│
├──────────────────────────┼────────┼────────┼────────┼────────┼────────┼────────┤
│ 1. Core Features         │   /100 │   /100 │   /100 │   /100 │   /100 │   /100 │
│ 2. UI/UX Quality         │   /100 │   /100 │   /100 │   /100 │   /100 │   /100 │
│ 3. Onboarding & Setup    │   /100 │   /100 │   /100 │   /100 │   /100 │   /100 │
│ 4. Performance           │   /100 │   /100 │   /100 │   /100 │   /100 │   /100 │
│ 5. Auth & Security       │   /100 │   /100 │   /100 │   /100 │   /100 │   /100 │
│ 6. Reliability           │   /100 │   /100 │   /100 │   /100 │   /100 │   /100 │
│ 7. Customization         │   /100 │   /100 │   /100 │   /100 │   /100 │   /100 │
│ 8. Team & Collaboration  │   /100 │   /100 │   /100 │   /100 │   /100 │   /100 │
├──────────────────────────┼────────┼────────┼────────┼────────┼────────┼────────┤
│ WEIGHTED OVERALL         │   /100 │   /100 │   /100 │   /100 │   /100 │   /100 │
└──────────────────────────┴────────┴────────┴────────┴────────┴────────┴────────┘

Consensus = weighted average (Product 1.2x, Eng 1.0x, Design 1.0x, Growth 0.8x, QA 0.8x)
```

### Gap Analysis (auto-generated)

```
Category           Your App    Best Ref    Gap     Priority
────────────────────────────────────────────────────────────
Core Features         45          92       -47     ██████████ HIGH
UI/UX Quality         60          88       -28     ██████ MED
Onboarding            30          85       -55     ████████████ CRITICAL
Performance           55          90       -35     ████████ HIGH
Auth & Security       40          95       -55     ████████████ CRITICAL
Reliability           35          90       -55     ████████████ CRITICAL
Customization         50          80       -30     ██████ MED
Team & Collab         45          85       -40     █████████ HIGH
────────────────────────────────────────────────────────────
OVERALL               45          88       -43
```

Priority tiers:
- **CRITICAL** (gap > 50): Fix first. Blocks adoption.
- **HIGH** (gap 30-50): Fix second. Noticeable weakness.
- **MED** (gap 10-30): Polish. Nice to have.
- **LOW** (gap < 10): Maintain. Already competitive.

---

## Step 5: Press the Button — Iterative Improvement

This is where the AI team takes over. Each "round" follows this cycle:

### Round Cycle

```
[BUTTON PRESS]
     │
     ▼
┌─ ANALYZE ────────────────────────────────────────┐
│  Each persona reviews the gap analysis           │
│  Identifies the SINGLE highest-impact change     │
│  in their domain                                 │
└──────────────────────────────────────────────────┘
     │
     ▼
┌─ PRIORITIZE ─────────────────────────────────────┐
│  Team votes on which change to make this round   │
│  Weighted consensus (67%+ = go)                  │
│  Deadlock → Product Lead decides                 │
│  Output: ONE improvement task                    │
└──────────────────────────────────────────────────┘
     │
     ▼
┌─ IMPLEMENT ──────────────────────────────────────┐
│  Eng Lead + Design Lead make the code change     │
│  QA Lead reviews for regressions                 │
│  Max scope: what can ship in ONE round           │
└──────────────────────────────────────────────────┘
     │
     ▼
┌─ RE-SCORE ───────────────────────────────────────┐
│  All 5 personas re-score the affected category   │
│  New consensus score calculated                  │
│  Gap analysis updated                            │
│  If score went DOWN → revert, try next priority  │
└──────────────────────────────────────────────────┘
     │
     ▼
┌─ REPORT ─────────────────────────────────────────┐
│  Round summary:                                  │
│  - What changed                                  │
│  - Category score before/after                   │
│  - Overall score before/after                    │
│  - Next round's top candidate                    │
│  - Projected rounds to target                    │
└──────────────────────────────────────────────────┘
     │
     ▼
  gap < 10 from target?
     │
    YES → DONE 🎯
    NO  → NEXT ROUND (back to ANALYZE)
```

### Rules Per Round

1. **ONE change per round.** No batching. Isolates impact.
2. **Score can't go down.** If it does, revert and pick next priority.
3. **No persona can be overruled 3 rounds in a row.** Forces diversity.
4. **Every 5 rounds: full team retro.** Are we converging? Swap personas if not.
5. **Max 20 rounds per session.** Prevents infinite loops.

### Round Log Template

```
┌─ ROUND 1 ────────────────────────────────────────┐
│ Decision: Add auth with GitHub OAuth             │
│ Proposed by: QA Lead (Auth gap = 55)             │
│ Vote: 4/5 agree (Growth abstained)               │
│                                                  │
│ Changes made:                                    │
│  - Added Supabase Auth with GitHub provider      │
│  - Login page with redirect                      │
│  - Session middleware                            │
│  - Protected routes                              │
│                                                  │
│ Score impact:                                    │
│  Auth & Security: 40 → 68 (+28)                  │
│  Overall: 45 → 49 (+4)                           │
│                                                  │
│ Gap remaining: 39 (was 43)                       │
│ Projected rounds to 80: ~12                      │
└──────────────────────────────────────────────────┘
```

---

## How This Maps to Persona-Builder

| This Framework | Persona-Builder Equivalent |
|---------------|---------------------------|
| 5-member team | `docs/personas/*.md` + `team.md` manifest |
| Weighted voting | `CONSENSUS_PROTOCOL.md` (67% threshold) |
| Round cycle | Autoresearch loop (`skills/autoresearch/SKILL.md`) |
| Score-only-up rule | Autoresearch "keep only improvements" |
| Category scoring | `FEATURE_RATING_AUDIT.md` 8-dimension matrix |
| Gap analysis | Enhancement plan with dual-agent re-scoring |
| Max rounds | Autoresearch `maxRounds` config |
| Persona swap at retro | Phase 5 persona evolution |

### Integration Points

To use Persona-Builder with this methodology:

1. **Init**: Run Persona-Builder's Phase 0-1 to generate your team
2. **Score**: Use the `/consult` page for per-persona scoring with gap analysis
3. **Improve**: Use Claude Code with the team's `CLAUDE.md` — each round is a conversation
4. **Re-score**: Run `/consult` again or use autoresearch for automated scoring
5. **Track**: Scores persist in Supabase, round logs in `docs/rounds/`

---

## Example: Applying to SupraCRM Telegram

### Team

| Persona | Modeled After | Focus |
|---------|--------------|-------|
| Product Lead | VP Product @ HubSpot | Feature completeness, CRM workflows |
| Eng Lead | Staff Eng @ Telegram | Bot architecture, API reliability |
| Design Lead | Head of Design @ Linear | Dark-mode UI, keyboard-first UX |
| Growth Lead | Head of Growth @ Pipedrive | Onboarding, team adoption |
| QA Lead | QA Director @ Salesforce | Security, audit trails, permissions |

### Reference Apps

| # | App | Why |
|---|-----|-----|
| 1 | HubSpot CRM | Full-featured CRM with chat integrations |
| 2 | Salesforce + Telegram | Enterprise CRM with messaging channels |
| 3 | Pipedrive | Lightweight CRM focused on pipeline management |

### Scores Before Improvement Rounds

```
Category              HubSpot  Salesforce  Pipedrive  SupraCRM  Gap
──────────────────────────────────────────────────────────────────────
Core Features            92        90         78        50      -42
UI/UX Quality            85        75         88        60      -28
Onboarding               90        70         85        35      -55
Performance              80        75         85        55      -30
Auth & Security          88        95         70        45      -50
Reliability              85        92         75        40      -52
Customization            80        85         65        50      -30
Team & Collaboration     82        88         72        45      -43
──────────────────────────────────────────────────────────────────────
WEIGHTED OVERALL         86        85         77        48      -38
```

### Projected Improvement Path

```
Round  Change                           Category Impact    Overall
─────────────────────────────────────────────────────────────────────
  1    Notification reliability          Reliability +20    48 → 52
  2    Custom automations                Core Features +15  52 → 55
  3    Broadcast history + scheduling    Core Features +10  55 → 58
  4    Bulk access control               Auth +15           58 → 61
  5    Audit logging                     Auth +10           61 → 64
  ── RETRO: On track, keep team ──
  6    Template editor + preview         Customization +15  64 → 66
  7    Onboarding wizard                 Onboarding +20     66 → 69
  8    Real-time notifications           Performance +10    69 → 71
  9    Group activity dashboard          UI/UX +10          71 → 73
 10    Role-based permissions            Auth +8            73 → 75
  ── RETRO: Converging, swap Growth → Scale persona ──
 11    Scheduled messages UI             Core Features +5   75 → 76
 12    Bot command builder               Customization +8   76 → 78
 13    Team activity feed                Collaboration +10  78 → 80
  ── TARGET 80 REACHED ──
```

---

## Summary

The methodology is:
1. **Team** — 5 AI personas with weighted voting
2. **App** — define what you're building
3. **Benchmark** — score 3 reference apps on 8 categories (40 sub-criteria)
4. **Self-score** — rate your app, generate gap analysis
5. **Improve** — one change per round, score must go up or revert, repeat until gap < 10

This turns the Persona-Builder framework into a **continuous improvement engine** where AI team members iteratively close the gap between your app and the best in class.
