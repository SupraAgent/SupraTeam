# Product Reviews & Scoring

All CPO persona reviews, competitive scores, and product audits go here.

## Naming Convention

`{type}-{date}.md` where type is one of:
- `cpo-review` — CPO persona ratings of features/functions
- `competitive-audit` — Scoring against competitors
- `security-audit` — Security review
- `ux-review` — UX/design review

## Current Reviews (newest first)

| File | Date | Type | Score | Notes |
|------|------|------|-------|-------|
| `cpo-review-2026-04-03.md` | 2026-04-03 | CPO Review | **69.5/100** | 30 categories, weighted scoring matching `telegram_crm_ratings.xlsx` |
| `cpo-review-v3.md` | 2026-03-30 | CPO Review | 73.4/100 | 3 personas, 20 functions rated 1-100 |
| `cpo-review-2026-03-28.md` | 2026-03-28 | CPO Review | 8.3/10 | Feature maturity table, 50+ line items |
| `cpo-review-post-4c.md` | 2026-03-28 | CPO Directive | N/A | Sarah Chen persona, "3 things that matter" |
| `action-plan-2026-03-30.md` | 2026-03-30 | Action Plan | N/A | 3 Telegram CRM moats, execution blocks |

## Score Trajectory

| Version | Date | Score | Methodology |
|---------|------|-------|-------------|
| v1 | 2026-03-20 | 32.5/100 | 5 CPO personas, self-assessed |
| v2 | 2026-03-20 | 64/100 | Post-improvement consensus |
| v3 | 2026-03-30 | 73.4/100 | 3 personas, 20 functions (estimated lifts) |
| **v4** | **2026-04-03** | **69.5/100** | **30 categories, weighted, evidence-based (same framework as competitive benchmark)** |

> **Note on v3 -> v4 drop:** v3 used estimated lifts on a self-assessed baseline. v4 uses the same 30-category weighted framework as `telegram_crm_ratings.xlsx` with evidence-based scoring. The drop reflects honest measurement, not regression.

Target: 80.5 (CRMChat #1 position)

## Related Docs (parent directory)

| File | Purpose |
|------|---------|
| `crm-north-star.md` | CPO north star — competitive position, gaps, 5 moves to #1 |
| `implementation-plan.md` | Tiered execution plan with sprint breakdown |
| `cpo-change-list-2026-04-03.md` | Current P0-P2 issues and architecture debt |
| `cpo-change-list-2026-03-28.md` | Previous change list (superseded) |

## For Future Agents

When adding a new review:
1. Save the file here as `{type}-{date}.md`
2. Update the table above
3. Update the Score Trajectory if it includes an overall score
4. Update `../crm-north-star.md` if it affects overall product direction
