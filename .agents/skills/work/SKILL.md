---
name: work
description: Start isolated implementation work from a Linear issue key by fetching Linear context, branching from the default branch, and creating a git worktree. Use when the user asks to start work on a Linear issue such as BET-5, work an issue, create an isolated branch/worktree, or prepare an implementation plan from Linear.
---

# Work

Start work from a Linear issue in an isolated git worktree. Pull issue context from Linear before planning or coding.

## Inputs

Require a Linear issue key such as `BET-5`.

Ask a follow-up question before continuing when:

- No Linear issue key is provided.
- Linear MCP access is unavailable.
- The default branch cannot be determined.
- The branch or worktree path already exists and the safe next action is unclear.
- The issue lacks enough context to plan implementation safely.

## Workflow

1. Resolve and fetch the Linear issue.
   - Use the Linear MCP server only; do not use GitHub issues for issue context.
   - Fetch the issue by key, including title, description, status, labels, project, assignee, links, and acceptance criteria if present.
   - Resolve the current status's type (`backlog`, `unstarted`, `started`, `completed`, `canceled`) by cross-referencing the team's statuses (e.g. `list_issue_statuses`) — the issue itself typically exposes only a status name, not its type.
   - Stop if the issue does not exist, is canceled/closed/done, or cannot be fetched.

2. Read project guidance.
   - Read `AGENTS.md` and other relevant local guidance before planning.
   - Note repo commands, testing expectations, branch naming conventions, and gotchas.

3. Determine the default branch.
   - Prefer the remote default branch:

```bash
git remote show origin
```

   - Fall back to `main` if the repo clearly uses `main`.
   - Ask before using a guessed default branch when unclear.

4. Create a safe branch name.
   - Build a slug from the Linear title: lowercase, hyphenated, short, ASCII where practical.
   - Use this format, keeping the issue key's case as Linear returns it — never a username or initials prefix:

```text
<linear-key>-<slug>
```

   Example: `ENG-9-add-ultracite`.

5. Create an isolated worktree from the default branch.
   - Fetch and update the default branch:

```bash
git fetch origin
git checkout <default-branch>
git pull --ff-only origin <default-branch>
```

   - Use a sibling worktree path (kept lowercase for filesystem-friendliness even though the branch name above preserves the issue key's case):

```text
../<repo-name>-<linear-key-lowercase>
```

   - If the path exists, ask whether to reuse it, remove it, or choose another path.
   - Create the worktree and new branch:

```bash
git worktree add ../<repo-name>-<linear-key-lowercase> -b <branch-name> <default-branch>
```

6. Build the implementation plan in the new worktree.
   - Explore relevant files from inside the worktree.
   - Identify likely code changes, tests, docs, migrations, config, and risks.
   - Map each plan item back to Linear context and acceptance criteria.
   - Ask follow-up questions when requirements are ambiguous or acceptance criteria are missing.

7. Stop for approval before implementation.
   - Present the Linear issue summary, branch name, worktree path, plan, risks, and open questions.
   - Do not edit code, and do not change Linear issue state, until the user approves the plan.

8. Mark the issue as started.
   - Once the user approves the plan, before making any code changes: if the status type resolved in step 1 is `backlog` or `unstarted`, move the issue to the team's `started`-type status (e.g. "In Progress") via the Linear MCP update tool, passing the status type rather than a hardcoded name so this works across teams with different state names.
   - Never move a status backward: leave issues that are already `started` (or further along) untouched.
   - If the issue has no assignee, assign it to the current Linear user (`assignee: "me"`). If it already has an assignee, leave it as-is unless the user explicitly asks to reassign.
   - Confirm the resulting status and assignee to the user in a short follow-up line before starting implementation.
   - If the user does not approve the plan (or work is abandoned), skip this step entirely — the issue is left untouched.

## Gotchas

- This skill starts work from Linear issues, not GitHub issues.
- Always create a worktree for isolation unless the user explicitly asks to work in-place.
- Do not branch from the current feature branch; branch from the default branch.
- Do not overwrite an existing worktree or branch without confirmation.
- If Linear context is thin, ask follow-up questions before planning broad implementation work.
- Branch names never include a username or initials prefix — use `<linear-key>-<slug>` only.
- Do not move an issue's status backward, and do not overwrite an existing assignee without explicit confirmation.
- Do not mark the issue as started (status/assignee changes) until the user approves the plan — it is shared, external state visible to the whole team, unlike local worktree/branch creation.

## Output

Use this format:

```text
Linear issue: <KEY> — <title>
Branch: <branch-name>
Worktree: <path>
Base: <default-branch>

Issue context
- Status: <current status>
- Assignee: <current assignee, or "Unassigned">
- Project/labels: <project/labels>
- Acceptance criteria: <summary or missing>

Plan
1. <specific implementation step>
2. <specific test/update step>

Open questions
- <questions that must be answered before implementation>

Next step: approve the plan before I make code changes. On approval I'll move this issue to <started-state-name> and assign it to you before starting.
```
