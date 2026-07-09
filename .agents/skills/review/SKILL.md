---
name: review
description: Review GitHub pull requests or current branch diffs for correctness, security, tests, maintainability, and API contracts. Use when the user asks to review a PR/MR, review the current branch, assess changes before merge, post GitHub review comments, or submit an approve/request-changes/comment review with gh.
---

# Review

Review GitHub PRs or the current branch diff with a findings-first report. Produce a local session report every time. When reviewing a GitHub PR, also publish the review to GitHub by default.

## Workflow

1. Determine the review target.
   - If the user provides a PR number or URL, review that PR.
   - If the user provides no PR, review the current branch against the base branch.
   - Resolve the base branch by preferring the PR base when reviewing a PR. For branch reviews, default to `main`; use `develop` when the repo clearly uses it as the integration branch, or follow the user's explicit base.
   - If the target is ambiguous, ask for the PR number, URL, or base branch.

2. Collect context.
   - For PR reviews, run:

```bash
gh pr view <pr> --json number,title,body,url,author,headRefName,baseRefName,labels,reviews,reviewDecision,commits
gh pr diff <pr>
gh pr checks <pr>
```

   - For branch reviews, run:

```bash
git status --short --branch
git log --oneline --decorate <base>..HEAD
git diff <base>...HEAD
```

   - Inspect referenced issues, especially Linear links or issue keys, when tools are available. Use issue acceptance criteria to judge whether the change satisfies the stated intent.
   - Inspect relevant surrounding code when a diff hunk is not enough to prove the finding.

3. Review with industry-standard gates.
   - Correctness: logic errors, boundary cases, state transitions, data migrations, concurrency, idempotency, rollback behavior, and error handling.
   - Security: trust boundaries, authentication and authorization, access control, injection risks, unsafe deserialization, secret exposure, sensitive logging, path traversal, SSRF, XSS, CSRF, dependency risk, insecure crypto, and privilege escalation.
   - Reliability: failure modes, retries, timeouts, resource leaks, race conditions, observability, backward compatibility, and operational impact.
   - Tests: missing coverage for new behavior, edge cases, regressions, authorization checks, failure paths, and test assertions that do not prove the behavior.
   - Types and contracts: API shape, schema compatibility, nullability, over-wide types, serialization, validation at boundaries, and caller expectations.
   - Maintainability: unnecessary complexity, duplication, naming, cohesion, local style, migration clarity, and long-term ownership cost.
   - Performance: avoidable N+1 work, unbounded loops or queries, unnecessary network calls, cache invalidation, large payloads, and hot-path regressions.

4. Classify findings.
   - Critical issues: security vulnerabilities, data loss/corruption, broken user-visible behavior, failed required checks, migration hazards, deploy blockers, or changes that clearly violate the PR goal.
   - Recommended improvements: maintainability, tests, type/API contracts, performance concerns, reliability risks, and non-blocking design issues that should usually be fixed before or soon after merge.
   - NITs: small style, naming, wording, formatting, or readability suggestions that are optional and should not block merge.
   - Do not invent findings. Every finding must cite evidence from the diff or surrounding code.
   - Prefer fewer, stronger findings over broad commentary.

5. Produce the local report.
   - Lead with findings, ordered by severity.
   - Include a file and line reference for each finding whenever possible.
   - Explain why it matters and give a concrete fix.
   - If there are no findings in a category, write `None.`
   - Avoid positives unless the user asks for them.
   - End with one recommendation: `Approve`, `Approve with NITs`, `Comment`, or `Request changes`.

6. Publish PR reviews to GitHub.
   - Before choosing a review action, check whether this is a self-review: compare the PR author (`gh pr view <pr> --json author --jq .author.login`) to the authenticated `gh` user (`gh api user --jq .login`), and also treat it as a self-review if you created, committed to, or pushed this PR earlier in the current session.
   - If it is a self-review, skip formal review actions entirely and post the full local report with `gh pr comment <pr> --body-file <file>`. Formal `gh pr review --approve`/`--request-changes`/`--comment` actions on your own PR are typically blocked (by GitHub itself or by harness self-approval safeguards) regardless of the recommendation, so do not attempt them first. State in the posted comment and in your response to the user that this is a self-review and was posted as a plain comment rather than a formal review.
   - If the plain `gh pr comment` call is also denied (for example by a harness permission classifier), do not retry or work around it. Report the full local report directly to the user and explain that posting was blocked because you authored the PR.
   - For non-self-reviews, submit the local report to GitHub by default with `gh pr review <pr> --body-file <file>` and the action that matches the recommendation.
   - Use `gh pr review <pr> --approve --body-file <file>` only when there are no critical issues, no recommended improvements that require discussion, and the recommendation is `Approve` or `Approve with NITs`.
   - Use `gh pr review <pr> --request-changes --body-file <file>` when critical issues are present and the recommendation is `Request changes`.
   - Use `gh pr review <pr> --comment --body-file <file>` when there are recommended improvements but no critical issues, or when the recommendation is `Comment`.
   - If GitHub rejects the formal review action for a non-self-review reason, fall back to `gh pr comment <pr> --body-file <file>` with the same review body and mention the fallback reason.
   - For branch-only reviews with no associated PR, keep the review local unless the user asks to post it somewhere.
   - If line-specific comments are requested, use GitHub-supported review comment mechanisms when available. Do not fabricate file positions; fall back to a summary review when exact positions cannot be resolved safely.
   - Never submit an approval when critical issues remain. Never submit request-changes for NITs alone.

## GitHub Review Body

Use this structure for both the local report and any GitHub review body unless the user requests another format:

```markdown
## Review: <PR title or branch name>

### Critical Issues
- [file:line] <issue> — <why it matters>. Fix: <concrete fix>.

### Recommended Improvements
- [file:line] <issue> — <why it matters>. Fix: <concrete fix>.

### NITs
- [file:line] <suggestion>.

### Recommendation
<Approve|Approve with NITs|Comment|Request changes>
```

## Recommendation Rules

- `Request changes`: one or more critical issues.
- `Comment`: no critical issues, but recommended improvements should be discussed or addressed.
- `Approve with NITs`: only NITs remain.
- `Approve`: no material findings.

## Gotchas

- This skill is for review, not implementation. Do not edit files unless the user explicitly asks for fixes.
- Review PRs with `gh`; do not use the GitHub MCP for this workflow.
- Always provide the local report even when also posting to GitHub.
- For PR reviews, posting to GitHub is the default; use a normal PR comment as a fallback when GitHub disallows the formal review action.
- Self-reviewing your own PR: always post as a plain `gh pr comment`, never attempt `gh pr review --approve`/`--request-changes`/`--comment`. If even the comment is blocked, stop and give the user the local report instead of retrying.
- Treat security-sensitive changes as high scrutiny even when the diff is small.
- A passing test suite does not prove correctness or security.
- If CI is failing or pending, mention it in the recommendation context.
- Do not expose secrets found during review. Identify the file and risk without repeating secret values.
- Avoid vague findings such as "consider improving tests" unless tied to a specific missing behavior or risk.
