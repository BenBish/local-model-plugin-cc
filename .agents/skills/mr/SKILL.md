---
name: mr
description: Create GitHub pull requests or merge requests with the GitHub CLI after preparing, committing, and pushing relevant branch changes. Use when the user asks to create/open/file a PR or MR, push branch work for review, turn local changes into a review request, or prepare a GitHub review request from a Linear issue and diff.
---

# MR

Create a GitHub review request with `gh` after committing and pushing the relevant work. In this skill, "MR" and "PR" are interchangeable unless the user explicitly names a non-GitHub host.

## Workflow

1. Inspect repository state.
   - Run `git status --short --branch` and identify the current branch.
   - Run `git remote -v` and confirm this is a GitHub remote.
   - If `gh` is unavailable or unauthenticated, stop and report the missing prerequisite.
   - If the current branch is `main`, `master`, `develop`, or another protected/source branch, call this out. Create a topic branch before committing. If the working tree or repo layout requires isolation, create a worktree only when it is necessary and explain why.

2. Determine the source branch.
   - Prefer the repository default branch from `gh repo view --json defaultBranchRef`.
   - If the project clearly uses `develop` as the integration branch, use `develop`.
   - If the base branch is ambiguous, inspect branch names, existing PR conventions, and recent history. Ask only when the choice affects correctness.

3. Understand the work item.
   - Read the current diff and commit history relevant to the branch:

```bash
git diff
git diff --staged
git log --oneline --decorate <base>..HEAD
```

   - Look for a Linear issue key or URL in the user request, branch name, commits, local docs, or changed files. If available through tools, fetch the Linear issue for title, description, acceptance criteria, and context.
   - Use the Linear issue plus the diff to produce a PR title and description that are useful to human reviewers and future agents.

4. Select changes to include.
   - Include changes that are relevant to the branch work item being completed.
   - If the user explicitly asks to commit everything, include all outstanding changes.
   - Otherwise, do not blindly stage the whole working tree. Review changed paths and stage only relevant files or hunks.
   - Preserve unrelated user work. Report any modified, deleted, or untracked files that were not included and why.
   - If relevance is unclear and staging the wrong file would be risky, ask before staging it.

5. Validate before committing.
   - Run the best available focused checks for the touched area.
   - If the repo documents commands such as `bun run lint`, `bun run test`, or `bun run build`, run the smallest set that gives meaningful confidence for the change.
   - If checks fail, stop before opening the PR unless the user explicitly wants a PR for failing work. Report failures with concise next steps.

6. Commit the selected changes.
   - If there are staged changes from before this workflow, inspect them before including them.
   - Write an informative commit message based on the Linear issue and diff. Prefer the local commit style if one is visible.
   - If no relevant changes remain to commit, do not create an empty commit. Continue only if the branch already contains unpushed commits that should become the PR.

7. Push the branch.
   - Push to the matching origin branch:

```bash
git push -u origin <branch>
```

   - Never force-push unless the user explicitly requests it and the branch safety implications are clear.

8. Create the PR/MR.
   - Use `gh pr create` with the resolved base branch, current head branch, inferred title, and a body that includes:
     - Summary of what changed.
     - Linear issue reference when known.
     - Validation performed and results.
     - Reviewer notes for non-obvious decisions, migrations, risks, or intentionally excluded scope.
   - Prefer a ready-for-review PR unless the user asks for a draft or validation is incomplete.
   - If a PR already exists for the branch, update or report it instead of creating a duplicate.

9. Report the result.
   - Include PR URL, title, base branch, head branch, commit hash, validation run, and excluded local changes.
   - If blocked, report the exact blocker and the command or user action needed to continue.

## Gotchas

- Use the GitHub CLI for GitHub PRs. Do not use the GitHub MCP for this workflow.
- "MR" usually means a GitHub PR in this repo context; follow the CLI and hosting platform vocabulary in the final output.
- Do not commit unrelated local work just because it exists.
- Do not work directly on `main`, `master`, or `develop`; create a branch first and explain the correction.
- PR descriptions should help reviewers understand intent, not just restate filenames.
- If the Linear issue and diff disagree, trust the diff for actual implementation details and mention any issue scope mismatch.
- Do not bypass failing validation silently.

## Output

When created:

```text
Created PR: <url>
Title: <title>
Base: <base>
Head: <branch>
Commit: <short-sha> <subject>
Validation: <commands and result>
Not included: <paths or "none">
```

When blocked:

```text
Did not create PR.
Blocker: <missing gh auth|ambiguous base branch|failing checks|unsafe branch state|no relevant changes>
Details: <concise evidence>
Next step: <specific command, decision, or fix needed>
```
