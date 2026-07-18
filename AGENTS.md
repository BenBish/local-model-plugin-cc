# AGENTS.md

<!-- Cross-agent project spec. Consumed by Claude Code, Gemini, Cursor, Copilot, etc. -->
<!-- Keep this up to date as the project evolves. -->

## Structure

```
.claude-plugin/marketplace.json
plugins/local-model/
  .claude-plugin/plugin.json
  commands/{setup,review,adversarial-review,rescue,status,result,cancel}.md
  agents/local-rescue.md
  scripts/{local-companion,setup,status,result,cancel}.mjs, scripts/lib/*.mjs
  schemas/review-output.schema.json
  skills/local-model-runtime/
tests/*.test.mjs
```

## Commands

All commands run from project root:

```bash
npm install       # install devDependencies
npm test          # run tests
npm run lint      # type-check .mjs sources
```

No dev server, no build step, no database. This is a Claude Code plugin distributed
directly from this git repo — every file under `plugins/local-model/` must be
runnable as committed, since installing the plugin does not run `npm install` or
any build in the target user's environment.

Runtime peer dependency: the `codex` CLI must be on the end user's `PATH`.
`/local:setup` checks for it and guides installation; nothing in this repo vendors
or auto-installs it.

## Architecture

Thin broker over the `codex` CLI. Provider/model selection is passed as ephemeral
`-c model_providers.*` CLI overrides on every invocation (no generated config file).
Jobs are tracked as flat JSON under the user's XDG state directory, never inside a
target repository. Review runs under a read-only sandbox; rescue under workspace-write
with a post-hoc diff-safety gate.

## Gotchas

- `codex exec review` does not accept `--oss` / `--local-provider`; all modes use `-c` overrides.
- End-user installs of the plugin never run `npm install` — only files under `plugins/local-model/` ship to users.
- Tests use a fake `codex` binary fixture so CI does not need a live model server.
