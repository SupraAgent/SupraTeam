---
name: "ship"
description: "Commit, push, create PR to main, and return the PR link."
user_invocable: true
---

# /ship — Commit, PR, and link

When the user runs `/ship`, perform these steps:

## 1. Stage and commit
- Run `git status` and `git diff` to review changes.
- Run `git log --oneline -5` to match commit message style.
- Stage only the relevant changed files (not `.env*`, credentials, or unrelated files).
- Create a commit with a concise message summarizing the changes.
- End the commit message with: `Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>`

## 2. Push
- Push the current branch to `origin` with `-u`.

## 3. Create PR
- Use `/opt/homebrew/bin/gh pr create` targeting `main`.
- Title: short (under 70 chars), describing the change.
- Body format:
  ```
  ## Summary
  <1-3 bullet points>

  ## Test plan
  <checklist>

  Generated with [Claude Code](https://claude.com/claude-code)
  ```
- If a PR already exists for this branch, skip creation and return the existing PR URL using `/opt/homebrew/bin/gh pr view --json url -q .url`.

## 4. Return the PR link
- Output the PR URL so the user can click it.
