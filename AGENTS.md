# AGENTS.md

<!-- Cross-agent project spec. Consumed by Claude Code, Gemini, Cursor, Copilot, etc. -->
<!-- Keep this up to date as the project evolves. -->

## Structure

```
<!-- TODO: update with real file tree after scaffolding -->
src/
```

## Commands

All commands run from project root:

```bash
bun run dev       # start dev server
bun run build     # production build
bun run test      # run tests
bun run lint      # lint + type-check
```

<!-- TODO: add ports, env vars needed, DB setup steps -->

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
