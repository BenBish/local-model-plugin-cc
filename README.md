# local-model-plugin-cc

A Claude Code plugin that delegates code review and rescue work to **local
models** — Ollama, LM Studio, or any custom OpenAI-compatible endpoint —
instead of a hosted provider. It's the local-model counterpart to
[`openai/codex-plugin-cc`](https://github.com/openai/codex-plugin-cc), and
shares its architecture *and its underlying CLI*: a thin broker over
OpenAI's own [`codex`](https://developers.openai.com/codex/cli) CLI, pointed
at a local model server via ephemeral `-c model_providers.*` CLI overrides
(Ollama/LM Studio's well-known local base URLs, or a custom
OpenAI-compatible endpoint's URL) instead of a hosted model. No separate
agent runtime, no generated config file — codex's own sandboxing
(`-s read-only` / `-s workspace-write`) and tool-calling loop do the work.

## Commands

- `/local:setup` — detect a local model server (Ollama at `:11434`, then LM
  Studio at `:1234`) or configure a custom OpenAI-compatible endpoint, pick a
  model, and smoke-test it.
- `/local:review` — review uncommitted changes (or `--base <ref>`) via
  `codex exec review` under a read-only sandbox. Structured, file-grounded
  findings.
- `/local:adversarial-review` — same target selection, steered toward
  challenging design assumptions and failure modes.
- `/local:rescue` — delegate a coding task via `codex exec` under a
  workspace-write sandbox, with a post-hoc diff-safety check as a second
  gate.
- `/local:status`, `/local:result`, `/local:cancel` — manage background jobs.

## Requirements

- Node.js >=20
- The [`codex`](https://developers.openai.com/codex/cli) CLI on `PATH` (a
  required peer dependency)
- A running local model server (Ollama, LM Studio, or a custom
  OpenAI-compatible endpoint) with a model capable of reliable tool calling

## What's here

- `.claude-plugin/marketplace.json`, `plugins/local-model/` — the Claude Code
  plugin itself (manifest, commands, rescue subagent, broker scripts,
  findings schema).
- `tests/` — `node --test` suite, including a fake `codex` binary fixture
  so CI never needs a live model server.
- `CLAUDE.md` / `AGENTS.md` — project spec consumed by coding agents.
- `.agents/skills/` — portable Agent Skills for *contributing to this repo*
  (issue, work, mr, merge, test, manual, create-skill, etc.), unrelated to
  the plugin's own runtime; symlinked at `.claude/skills/` for Claude Code.
- `.codex/config.toml` — Codex project config, including Linear MCP.
- `.mcp.json` — generic MCP server config for clients that still read it.
- `.github/` — CI/workflow configuration.

## Conventions

- **Branches**: `feature/<issue-number>-brief-slug` from `main`
- **Commits**: [Conventional Commits](https://www.conventionalcommits.org/)
  (`feat(scope): description`, `fix(scope): description`, etc.)
- **PRs**: reference the issue with `Resolves #N`; one squashed semantic
  commit per PR

See `CLAUDE.md` for the full set of project instructions used by coding
agents working in this repo.
