---
description: Show running and recent local-model jobs for this repository.
argument-hint: "[job-id]"
---

Run:
```
node "${CLAUDE_PLUGIN_ROOT}/scripts/status.mjs" [--job-id <id>]
```

Pass `--job-id <id>` only if `$ARGUMENTS` contains a job id (e.g.
`job_abc123`); otherwise list recent jobs for the current repository.
Present the result as a short table or list: job id, kind, status, model,
timestamps. If a mutating rescue job is running, note that concurrent
rescues are blocked until it finishes.
