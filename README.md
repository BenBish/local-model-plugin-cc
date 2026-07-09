# Personal Project Starter

A starter template for new personal projects, preconfigured for agent-assisted
development (Claude Code, and other AGENTS.md-compatible tools).

## What's here

- `CLAUDE.md` / `AGENTS.md` — project spec consumed by coding agents. Fill in
  the `TODO`s once the project is scaffolded (stack, commands, layout,
  conventions).
- `.agents/skills/` — portable Agent Skills (issue, work, mr, merge, test,
  manual, create-skill, etc.), symlinked at `.claude/skills/` for Claude Code.
- `.codex/config.toml` — Codex project config, including Linear MCP.
- `.mcp.json` — generic MCP server config for clients that still read it.
- `.github/` — CI/workflow configuration.

## Getting started

1. Fill in the `TODO` sections of `CLAUDE.md` and `AGENTS.md` with the real
   project name, stack, commands, and repository layout.
2. Authenticate Linear MCP for Codex with `codex mcp login linear`. Codex
   should use OAuth for Linear MCP rather than a Linear API key.
3. Scaffold the project under `src/` (or wherever the chosen framework
   expects).

## Conventions

- **Branches**: `feature/<issue-number>-brief-slug` from `main`
- **Commits**: [Conventional Commits](https://www.conventionalcommits.org/)
  (`feat(scope): description`, `fix(scope): description`, etc.)
- **PRs**: reference the issue with `Resolves #N`; one squashed semantic
  commit per PR

See `CLAUDE.md` for the full set of project instructions used by coding
agents working in this repo.
