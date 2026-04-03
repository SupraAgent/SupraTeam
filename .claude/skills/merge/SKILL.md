---
name: "merge"
description: "Smart merge workflow — analyze branches, resolve conflicts, protect main quality, and summarize for CPO review."
user_invocable: true
---

# /merge — Smart merge workflow

When the user runs `/merge`, follow this exact process:

## 1. Analyze repository state
- Run `git branch -a` and `git status` to understand the current state.
- Identify the current branch (should typically be `main`).
- Run `git log --oneline --graph main..HEAD` (if not on main) or check other branches that are ahead of main via `git log --oneline main..<branch>` for each relevant branch.
- Detect and clearly report any merge conflicts by doing a dry-run: `git merge --no-commit --no-ff <branch>` then `git merge --abort`.

## 2. Resolve merge conflicts (if any)
- Help the user resolve conflicts intelligently and safely.
- **Prefer keeping the better version** of code rather than blindly accepting one side.
- For each conflict, explain what both sides changed and recommend which to keep (or how to combine them).
- Never silently drop changes from either side.

## 3. Smart merging strategy
- If other branches are ahead of main, analyze what changes exist in those branches.
- Suggest the best way to bring valuable changes into main — usually via one clean PR.
- Recommend a single, well-structured PR that combines the most important updates instead of merging everything automatically.
- Use `/opt/homebrew/bin/gh` for any GitHub CLI operations.

## 4. Protect main branch quality
After merging or preparing the PR, explicitly verify:
- Run `git diff main..HEAD` to review all changes that will land on main.
- Confirm that improvements already in main are **not** overwritten or regressed.
- The best version of each change is kept (do not replace superior code already in main).
- Flag any potential regressions with clear explanations.

## 5. Final summary
Once the merge/PR is prepared, provide a clear summary:
- **Brought over**: list of changes merged from the feature branch(es).
- **Kept from main**: any cases where main's version was superior and preserved.
- **Trade-offs**: anything the user should be aware of.
- **PR link**: if a PR was created, output the URL.

## 6. CPO Merge Review (automatic)
After the merge is complete, automatically review the merge itself:
- Verify the right changes were brought over (nothing missing, nothing extra).
- Verify nothing valuable in main was overwritten or regressed.
- Check that conflict resolutions chose the correct side and explain why.
- List any files where the merge result looks suspicious or warrants a second look.
- Give a pass/fail verdict with a short explanation.
