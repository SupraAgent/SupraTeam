---
name: "fork"
description: "Reference fork manifests and plan adaptation work for a target host platform."
user_invocable: true
---

# /fork — Fork readiness helper

When the user runs `/fork`, help them understand, plan, or execute fork-related work for SupraCRM.

## Context files

Always read these files first to understand the current fork contract:

1. **`extension.json`** (project root) — Universal manifest. Describes what SupraCRM is, what it needs, and what it exposes. Host-agnostic.
2. **`extensions/`** directory — Host-specific adapter files. Each file maps the universal manifest to a specific host platform's conventions.

Scan `extensions/` for all `.json` files to discover available host adapters.

## Behavior

### `/fork` (no args)
- Read `extension.json` and list all adapter files in `extensions/`.
- Print a summary: extension ID, version, required services, agent count, host adapters available.

### `/fork <host>` (e.g., `/fork vms`)
- Read `extension.json` and `extensions/<host>.json`.
- Summarize what the adapter maps: auth, styles, shell, components, route paths.
- Identify the three seams that need implementation: **auth adapter**, **data adapter**, **shell adapter**.
- List concrete files that would need changes for this host (based on the mapping fields in the adapter).

### `/fork status`
- Check current fork-readiness by scanning the codebase:
  - Are there direct Supabase imports in page components? (should be zero)
  - Are there hardcoded auth references that bypass `useAuth()`?
  - Are there shell/layout wrappers that would conflict with a host shell?
- Report a readiness score and list any violations.

### `/fork diff <host>`
- Compare SupraCRM's current conventions against the host adapter's `replace` mappings.
- List every file that would need changes, grouped by mapping type (auth, style, shell, component).
- Estimate scope as S/M/L per category.

### `/fork plan <host>`
- Generate a step-by-step implementation plan for forking to the target host.
- Use the adapter's mapping fields to identify all replacements.
- Organize into phases: (1) auth swap, (2) shell swap, (3) style migration, (4) component migration, (5) route restructuring.
- Enter plan mode if the plan is non-trivial.

## Rules
- Never modify `extension.json` or adapter files without explicit user request.
- The universal manifest stays host-agnostic — VMS-specific fields belong in `extensions/vms.json`, not in `extension.json`.
- When adding a new host adapter, create `extensions/<host>.json` following the same structure as `extensions/vms.json`.
- Reference the external handoff docs if the user has them available (e.g., GETTING-STARTED.md, APP-EXTENSION-HANDOFF.md for VMS).
