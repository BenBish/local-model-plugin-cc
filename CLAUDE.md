# CLAUDE.md

## Project

**Name**: local-model-plugin-cc
**Description**: Claude Code plugin that delegates `/local:review`, `/local:adversarial-review`, and `/local:rescue` to local models (Ollama, LM Studio, custom OpenAI-compatible endpoints) by brokering to the `codex` CLI via ephemeral `-c model_providers.*` overrides (no config file, no `--oss`/`--local-provider` — those flags don't exist on `codex exec review`, only on plain `codex exec`, so everything uses `-c` overrides uniformly) — the same CLI `openai/codex-plugin-cc` itself wraps, just pointed at a local model instead of a hosted one, instead of reimplementing an agent runtime.

## Stack

- **Language/Runtime**: Node.js >=20, plain `.mjs` (no build step — shipped scripts must run as-is since Claude Code installs the plugin directly from this git repo)
- **Framework**: none — Claude Code plugin manifest conventions (`.claude-plugin/`, `commands/*.md`, `agents/*.md`)
- **Database**: none — the job ledger is flat JSON files under the user's XDG state dir, never inside a target repo. No config file is generated for codex either — provider/model selection is passed as CLI flags on every invocation.
- **Package manager**: npm for `devDependencies` (TypeScript, used only for `tsc --noEmit` type-checking of the `.mjs` sources via JSDoc). Nothing shipped in `plugins/local-model/` may assume bun is installed on an end user's machine.

## Commands

Run from project root:

```bash
npm install       # install devDependencies (typescript, @types/node)
npm test          # run tests (node --test tests/*.test.mjs)
npm run lint      # type-check the .mjs sources (tsc --noEmit, checkJs)
```

## Repository Layout

```
.claude-plugin/marketplace.json          # marketplace manifest
plugins/local-model/
  .claude-plugin/plugin.json             # plugin manifest
  commands/                              # /local:* slash commands
  agents/local-rescue.md                 # thin Bash-only forwarder subagent
  scripts/                               # broker: spawns `codex exec`/`codex exec review`, job ledger
    lib/
  schemas/review-output.schema.json      # findings JSON schema
  skills/local-model-runtime/            # skill documenting the broker contract
tests/                                   # node --test suite incl. fake-codex fixture
```

## Conventions

### Branches
`feature/<issue-number>-brief-slug` from `main`

### Commits
Conventional Commits: `feat(scope): description`, `fix(scope): description`, `docs: description`, `chore: description`

### PRs
- One squashed semantic commit per PR

## Do Not Commit

- `.env`, `.env.local`, any secrets or credentials
- `.claude/settings.local.json`
- Build artefacts (`dist/`, `build/`, `.next/`, `node_modules/`)
