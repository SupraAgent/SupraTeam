---
name: automation-builder requires dist rebuild
description: The @supra/automation-builder package exports from ./dist/ via tsup — source edits are not visible until rebuilt
type: feedback
---

After editing any file in `packages/automation-builder/src/`, always run `npm run build` inside `packages/automation-builder/` before committing. The package exports from `./dist/` (built by tsup), so source changes alone won't affect the Next.js app.

**Why:** Shipped a source-only change that had no effect in production because the dist wasn't rebuilt. Wasted an hour debugging.

**How to apply:** Every time you edit files in `packages/automation-builder/src/`, run `cd packages/automation-builder && npm run build` and commit the updated `dist/` alongside the source changes.
