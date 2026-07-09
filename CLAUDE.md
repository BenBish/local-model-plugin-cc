# CLAUDE.md

## Project

**Name**: <!-- TODO: project name -->
**Description**: <!-- TODO: one-line description -->

## Stack

<!-- TODO: fill in after scaffolding -->
- **Language/Runtime**:
- **Framework**:
- **Database**:
- **Package manager**: bun (preferred) or npm

## Commands

Run from project root:

```bash
# TODO: fill in real commands
bun install       # install dependencies
bun run dev       # local dev server
bun run build     # production build
bun run test      # run tests
bun run lint      # lint
```

## Repository Layout

```
<!-- TODO: update after scaffolding -->
src/
  index.ts
```

## Conventions

### Branches
`feature/<issue-number>-brief-slug` from `main`

### Commits
Conventional Commits: `feat(scope): description`, `fix(scope): description`, `docs: description`, `chore: description`

### PRs
- Reference the issue with `Resolves #N`
- One squashed semantic commit per PR

## Do Not Commit

- `.env`, `.env.local`, any secrets or credentials
- `.claude/settings.local.json`
- Build artefacts (`dist/`, `build/`, `.next/`, `node_modules/`)
