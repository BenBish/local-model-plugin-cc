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
npm run lint       # type-check .mjs sources
```

No dev server, no build step, no database. This is a Claude Code plugin distributed
directly from this git repo — every file under `plugins/local-model/` must be
runnable as committed, since installing the plugin does not run `npm install` or
any build in the target user's environment.

Runtime peer dependency: the `codex` CLI must be on the end user's `PATH`.
`/local:setup` checks for it and guides installation; nothing in this repo vendors
or auto-installs it.

### Linear MCP

For Codex, use the documented OAuth-based Linear MCP setup. The preferred
configuration is in `.codex/config.toml`:

```toml
[mcp_servers.linear]
url = "https://mcp.linear.app/mcp"
```

After creating a project from this starter, run:

```bash
codex mcp login linear
```

Do not use a Linear API key as Codex's primary Linear MCP auth path. API-key
bearer auth may work for raw MCP HTTP requests or other clients, but Codex's
Linear integration is expected to use OAuth.

## Architecture

<!-- TODO: describe the key architectural decisions once the project is scaffolded -->
<!-- Example: REST API on port 3000, React SPA on 5173, SQLite at data/app.db -->

## Auth / API Patterns

<!-- TODO: describe auth approach (session cookie, JWT, API key) and any token formats -->

## Gotchas

<!-- TODO: document surprises a new agent would hit — unusual build steps, env vars required before run, quirky test setup, etc. -->
