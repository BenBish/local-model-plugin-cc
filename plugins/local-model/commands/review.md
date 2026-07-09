---
description: Run a read-only code review through a local model (uncommitted changes by default, or --base <ref>).
argument-hint: "[--base <ref>] [--wait|--background]"
---

Run a local-model review of the current work. This command never mutates
files — the underlying agent has no edit or shell tools.

Parse `$ARGUMENTS` for:
- `--base <ref>`: review the diff against `<ref>` instead of just uncommitted
  changes.
- `--wait`: run in the foreground and block until done.
- `--background`: launch as a background job and return immediately.
- If neither `--wait` nor `--background` is given, estimate scope first
  (`git status --porcelain`, `git diff --stat`) and recommend background for
  anything beyond a 1-2 file change, foreground otherwise — then ask the
  user which they want, or just proceed with your recommendation if the
  scope is unambiguous.
- If there is nothing to review (clean working tree and no `--base`), say so
  and stop; do not run the command.

Invoke:
```
node "${CLAUDE_PLUGIN_ROOT}/scripts/local-companion.mjs" review [--base <ref>] [--background]
```

Foreground: return the command's JSON output verbatim, then present the
findings to the user in readable form (verdict, summary, findings grouped by
severity, next steps).

Background: tell the user the job ID and that they can check
`/local:status` or `/local:result` for progress/results.

If the command reports "No local-model configuration found," tell the user
to run `/local:setup` first — do not attempt to guess a configuration.
