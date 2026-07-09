---
name: merge
description: Merge GitHub pull requests or merge requests with the GitHub CLI only after required checks, CI, and pipeline status pass. Use when the user asks to merge a PR/MR, wait for checks then merge, merge when the pipeline succeeds, or investigate failed merge checks.
---

# Merge

Merge GitHub PRs with `gh` only after CI and required checks are successful. Do not use the GitHub MCP for this workflow.

## Workflow

1. Resolve the PR.
   - If the user provides a PR number or URL, use it.
   - If no PR is provided, run `gh pr view --json number,title,headRefName,baseRefName,url,isDraft` from the current branch.
   - If the PR cannot be resolved unambiguously, ask the user for the PR number or URL.

2. Inspect PR metadata.
   - Run:

```bash
gh pr view <number> --json number,title,url,state,isDraft,headRefName,baseRefName,mergeable,reviewDecision,statusCheckRollup
```

   - Stop if the PR is closed, already merged, draft, or has merge conflicts.
   - Stop if `reviewDecision` is `CHANGES_REQUESTED`; report who requested changes when available.
   - Warn but do not block solely on missing review approval unless branch protection or required checks report that approval is required.

3. Check CI and pipeline status.
   - Run `gh pr checks <number>` first for a readable status table.
   - Treat `pass` and successful required checks as mergeable.
   - Treat `pending`, `queued`, `in_progress`, `waiting`, or equivalent states as not ready.
   - Treat `fail`, `error`, `cancelled`, `timed_out`, `action_required`, or missing required checks as failed/not mergeable.
   - If status is unclear, inspect `statusCheckRollup` from `gh pr view` and, when needed, use `gh run list --branch <headRefName>` plus `gh run view <run-id> --log-failed`.

4. Wait when requested.
   - If the user asks to "merge when checks pass" or "merge when the pipeline succeeds", poll with `gh pr checks <number>` until all required checks pass or any check fails.
   - Use a reasonable interval and tell the user when checks are still pending.
   - Do not merge while checks are pending unless the user explicitly changes the requirement.

5. Investigate failures.
   - If checks or pipeline fail, do not merge.
   - Identify failing check names, statuses, URLs, and associated workflow runs when available.
   - Fetch failed logs with `gh run view <run-id> --log-failed` when a run id can be identified.
   - Report the likely cause, the failing job/step, and suggested next steps.
   - Keep suggestions actionable: commands to run locally, files likely involved, or owners/services to inspect.

6. Merge only after the gate passes.
   - Confirm the PR number, title, and base branch if the user has not already made it explicit.
   - Always squash merge with branch deletion unless the user explicitly requests a different strategy for this merge:

```bash
gh pr merge <number> --squash --delete-branch
```

   - If the user requests another strategy, use `--merge` or `--rebase`, but check repo settings/branch protection for merge-strategy restrictions first — some repos only allow squash merges.
   - If GitHub reports checks are not passing or branch protection blocks the merge, stop and report the block.

7. Clean up local state when appropriate.
   - If currently on the merged branch, switch to the base branch and pull:

```bash
git checkout <baseRefName>
git pull --ff-only
```

   - Delete the local branch with `git branch -d <headRefName>` only after confirming it is local and safe to delete.
   - If local deletion fails, report the reason; do not force delete without user confirmation.

## Gotchas

- "MR" in this skill means a GitHub PR unless the user explicitly names another host. Use `gh` for GitHub.
- Passing local tests is not enough. GitHub required checks and pipeline status must be successful before merging.
- Do not bypass branch protection, use admin merge, disable checks, or force delete branches.
- If `gh pr checks` says checks are pending, the correct action is to wait or report pending status, not merge.
- If checks fail, investigation and next steps are the deliverable.
- Squash is the standing default for this workflow. Do not infer strategy from git history; always squash unless the user explicitly overrides for one merge, or repo settings/branch protection require a different strategy.

## Output

When merged:

```text
Merged PR #<number>: <title>
Strategy: <squash|merge|rebase>
Base: <baseRefName>
Branch cleanup: <result>
```

When blocked:

```text
Did not merge PR #<number>: <title>
Blocker: <failed checks|pending checks|merge conflict|review changes requested|branch protection>
Evidence:
- <check/job/status/log excerpt or URL>
Suggested next steps:
1. <specific fix or investigation step>
2. <specific command or owner to check>
```
