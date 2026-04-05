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

Display the agents grouped by role:

### Product & Strategy
| Agent | Description |
|---|---|
| (CPO agents listed here) |

### Code Quality
| Agent | Description |
|---|---|
| (Code review agents listed here) |

### Security
| Agent | Description |
|---|---|
| (Security agents listed here) |

### Integration Specialists
| Agent | Description |
|---|---|
| (Integration agents listed here) |

## Grouping Rules

- **Product & Strategy**: Agents with "CPO" in name or description
- **Code Quality**: Agents with "code", "reviewer", or "coder" in name (case-insensitive)
- **Security**: Agents with "security", "auditor", "devil", "cypherpunk" in name (case-insensitive)
- **Integration Specialists**: Agents with "integration", "specialist" in name or description (case-insensitive)

After the table, show a summary line: `**{count} agents available** — use them by name when asking Claude to review, audit, or evaluate.`
