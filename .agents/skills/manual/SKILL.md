---
name: manual
description: Manually verify application changes through realistic user or API workflows. Use when the user asks for manual testing, smoke testing, browser verification, endpoint verification, QA pass, or hands-on validation of UI, API, backend, integration, auth, error handling, or regression behavior after code changes.
---

# Manual

Manually verify changes with realistic workflows and concrete evidence. Keep this separate from `$test`: automated test suites can inform context, but this skill is about hands-on validation of behavior.

## Workflow

1. Identify what changed.
   - Inspect the user request, branch diff, issue context, and changed files.
   - Determine the affected surfaces: UI, API endpoints, background jobs, database migrations, CLI commands, integrations, auth, permissions, configuration, or observability.
   - Build a short manual test plan that covers the main happy path, likely regressions, and meaningful error cases.

2. Confirm runtime access before starting services.
   - Ask the user for the running app URL or port before browser testing.
   - Ask before starting long-running servers such as `bun run dev`, `npm run dev`, API servers, workers, databases, or dependent services.
   - If the user provides a URL or port, use it directly.
   - If required services are unavailable, report the blocker and the exact information or command needed.

3. Test UI changes with Playwright MCP.
   - Use Playwright MCP for all browser-based manual testing. Treat it as a required dependency for UI verification.
   - Navigate through the actual user workflow rather than only checking that a page loads.
   - Exercise interactive states: form input, validation, disabled/loading states, navigation, persistence after refresh, responsive layouts when relevant, keyboard/focus behavior, and visible error states.
   - Capture enough evidence to support the result: page URL, visible state, key DOM text, console errors, network failures, screenshots when available, and reproduction steps for failures.
   - If Playwright MCP is not available, do not substitute a different browser automation path for UI verification unless the user explicitly changes the requirement. Report that UI manual testing is blocked on Playwright MCP.

4. Test API and backend changes manually.
   - Use `curl`, HTTP clients, project scripts, local CLIs, or available MCP/tools appropriate to the system.
   - For new or changed endpoints, verify at least:
     - Happy path with representative valid input.
     - Validation errors for malformed or missing input.
     - Auth and permission failures when the endpoint is protected.
     - Not-found, conflict, rate-limit, or state-transition errors when relevant.
     - Response status codes, response shape, persistence side effects, and important headers.
   - Do not print secrets or sensitive tokens. Redact credentials in reports.

5. Test non-HTTP changes manually as applicable.
   - For CLIs, run representative commands, invalid arguments, help output, and exit-code behavior.
   - For background jobs or queues, trigger the job, observe expected side effects, retry/failure behavior, and logs.
   - For database migrations, verify apply/rollback expectations when supported, schema effects, and data compatibility.
   - For integrations, use safe test credentials or mocked/sandbox environments and verify both success and provider failure behavior.
   - For config changes, verify default behavior, missing/invalid config, and environment-specific behavior.

6. Triage findings.
   - Separate product behavior failures from environment/setup blockers.
   - Include exact reproduction steps for every failed manual check.
   - If a failure may be caused by stale data, cached assets, missing services, or local configuration, say so and list the evidence.
   - Do not fix code unless the user explicitly asks; this skill reports manual verification results.

## Playwright MCP Expectations

- Required for UI changes.
- Use semantic interaction where possible: navigate, click, fill, select, press keys, inspect visible text, and observe browser console/network failures.
- Test the primary desktop viewport and any mobile/responsive behavior affected by the change.
- Verify that UI text is readable, controls are reachable, and error/loading states do not overlap or trap the user.
- For visual changes, inspect the actual rendered page, not just source code.

## Output

Use this format:

```text
Manual test summary
- Scope: <changed behavior tested>
- Environment: <URL/port/service context>
- Result: <passed|failed|blocked|partial>

Checks
- [passed|failed|blocked] <workflow or case>: <evidence>
- [passed|failed|blocked] <workflow or case>: <evidence>

Failures
- <reproduction steps, expected result, actual result, relevant URL/request/status/log excerpt>

Not tested
- <case>: <reason>

Next steps
1. <specific fix, setup action, or retest command>
```

## Gotchas

- Do not treat automated tests as a substitute for manual verification.
- Do not start long-running services without asking unless the user already provided explicit permission and the required command.
- Do not skip error paths for API changes; happy-path-only manual testing is incomplete.
- Do not use non-Playwright browser tools for UI manual testing unless the user explicitly overrides the requirement.
- Redact secrets, cookies, authorization headers, and private user data.
- Manual testing should be scoped to the change. Avoid broad exploratory QA unless the user asks for it.
