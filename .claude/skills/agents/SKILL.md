---
name: "agents"
description: "List all available SupraCRM agents with their roles and descriptions."
user_invocable: true
---

# /agents — List All Available Agents

When the user runs `/agents`, read all `.md` files in `.claude/agents/` and display them in a formatted table.

## Steps

1. Read all files in `.claude/agents/` directory
2. Parse the YAML frontmatter from each file to extract `name` and `description`
3. Group them by category and display as a formatted table

## Output Format

Display the agents grouped by role. Number each agent sequentially across all groups (1, 2, 3, ...) so users can reference agents by number:

### Product & Strategy
| # | Agent | Description |
|---|---|---|
| 1 | (first CPO agent) | ... |
| 2 | (second CPO agent) | ... |

### Code Quality
| # | Agent | Description |
|---|---|---|
| 5 | (first code agent) | ... |

### Security
| # | Agent | Description |
|---|---|---|
| 7 | (first security agent) | ... |

### Integration Specialists
| # | Agent | Description |
|---|---|---|
| 10 | (first integration agent) | ... |

Numbers continue sequentially across all groups.

## Grouping Rules

- **Product & Strategy**: Agents with "CPO" in name or description
- **Code Quality**: Agents with "code", "reviewer", or "coder" in name (case-insensitive)
- **Security**: Agents with "security", "auditor", "devil", "cypherpunk" in name (case-insensitive)
- **Integration Specialists**: Agents with "integration", "specialist" in name or description (case-insensitive)

After the table, show a summary line: `**{count} agents available** — use them by name or number (e.g., #3) when asking Claude to review, audit, or evaluate.`
