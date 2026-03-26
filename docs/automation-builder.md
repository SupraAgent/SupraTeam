# @supra/automation-builder

This app uses the shared visual workflow builder package from:

**Source repo:** https://github.com/SupraAgent/Supra-Automation-Builder

**Full integration guide:** `node_modules/@supra/automation-builder/INTEGRATION.md`

Or view it on GitHub: https://github.com/SupraAgent/Supra-Automation-Builder/blob/main/INTEGRATION.md

## Updating

```bash
npm install github:SupraAgent/Supra-Automation-Builder
```

This pulls the latest `main` branch. The `prepare` script auto-builds `dist/`. The integration guide updates with it.

## SupraTeam-specific setup

- **Registry:** `lib/workflow-registry.ts` — 24 triggers, 20 actions with `async_select` fields
- **Persistence:** `lib/workflow-persistence.ts` — Supabase adapter (`crm_workflow_runs` table)
- **Engine:** `lib/workflow-engine.ts` — wraps the generic engine with CRM action executors
- **Builder page:** `app/automations/[id]/page.tsx`
- **Templates:** stored in `crm_workflow_templates` table (not localStorage)
- **Tailwind:** v3, content path in `tailwind.config.ts`
- **tsconfig:** path alias pointing to `node_modules/@supra/automation-builder/dist/index`
