---
name: test
description: Run and report the full project verification suite, including TypeScript type checks, Prettier formatting checks, linting, unit tests, integration tests, and end-to-end tests. Use when the user asks to test, run all checks, verify the repo, run CI locally, or diagnose test failures.
---

# Test

Run the full verification suite from the project root and report clear results. Prefer existing project scripts over inventing commands.

## Workflow

1. Discover the available commands.
   - Read `AGENTS.md`, `README.md`, `package.json`, lockfiles, test configs, and CI config when present.
   - Detect the package manager from lockfiles: prefer `bun` for `bun.lock` or `bun.lockb`, `pnpm` for `pnpm-lock.yaml`, `yarn` for `yarn.lock`, and `npm` for `package-lock.json`.
   - Prefer explicit package scripts such as `typecheck`, `format:check`, `lint`, `test`, `test:unit`, `test:integration`, and `test:e2e`.
   - If this repo is still a starter with no package files, report checks as not configured. Do not run placeholder commands from `AGENTS.md` unless the matching package scripts or tool configs actually exist.

2. Ask follow-up questions only when required commands cannot be discovered.
   - Ask which command runs TypeScript checking if neither `tsc` nor a typecheck/lint script is available.
   - Ask which command runs Prettier if no `prettier` dependency, config, or format script is available.
   - Ask which commands run unit, integration, or e2e tests if those categories are requested but no scripts/configs exist.
   - Ask whether to start dependent services before integration or e2e tests if the repo indicates databases, browsers, APIs, or dev servers are required but setup is unclear.

3. Run checks in this order.
   - TypeScript: use `bunx tsc --noEmit`, `npx tsc --noEmit`, or the project's `typecheck`/`lint` script.
   - Prettier: use the project's format check script, otherwise `bunx prettier --check .` or `npx prettier --check .` when Prettier is present.
   - Linting: use the project's lint script.
   - Unit tests: use `test:unit` when present, otherwise the general `test` script if no more specific unit command exists.
   - Integration tests: use `test:integration`, `integration`, or documented integration command.
   - E2E tests: use `test:e2e`, `e2e`, `playwright test`, `cypress run`, or documented e2e command.

4. Stop or continue based on failure context.
   - For fast static checks (tsc, Prettier, lint), stop after a failure if later tests would be noisy or invalid.
   - For test suites, continue to the next suite only when failures are independent and useful to collect.
   - Never hide failures behind a later passing command.

5. Diagnose failures.
   - Capture the failing command, exit code, and the smallest useful error excerpt.
   - Identify failing test names, files, assertions, snapshots, or browser traces when available.
   - Suggest concrete next steps: files to inspect, commands to rerun, services to start, or likely fixes.

## Command Selection

Use this preference order for each category:

```text
documented repo command > package script > tool config/dependency default > ask follow-up
```

Common script names:

- TypeScript: `typecheck`, `check-types`, `tsc`, `lint`
- Prettier: `format:check`, `prettier:check`, `format`
- Lint: `lint`, `eslint`
- Unit: `test:unit`, `unit`, `test`
- Integration: `test:integration`, `integration`
- E2E: `test:e2e`, `e2e`, `playwright`, `cypress`

## Gotchas

- `bun run lint` may include type-checking in this repo; treat it as covering both lint and TypeScript only when the project documents or script content confirms that.
- Starter repos may document intended future commands before `package.json` exists. Treat those commands as not configured until the scripts or tool configs are present.
- Do not run mutating format commands such as `prettier --write` unless the user asks to fix formatting.
- E2E tests often require browsers, services, or env vars. Ask before starting long-running servers if setup is unclear.
- If a category does not exist in the project yet, report it as missing rather than pretending it passed.

## Output

Use this format:

```text
Verification summary
- TypeScript: <passed|failed|not configured> (`command`)
- Prettier: <passed|failed|not configured> (`command`)
- Lint: <passed|failed|not configured> (`command`)
- Unit: <passed|failed|not configured> (`command`)
- Integration: <passed|failed|not configured> (`command`)
- E2E: <passed|failed|not configured> (`command`)

Failures
- <category>: <short cause and key evidence>

Next steps
1. <specific action>
2. <specific command to rerun or file to inspect>
```
