---
description: Cancel a running local-model job (defaults to the latest running job for this repository).
argument-hint: "[job-id]"
---

Run:
```
node "${CLAUDE_PLUGIN_ROOT}/scripts/cancel.mjs" [--job-id <id>]
```

Pass `--job-id <id>` only if `$ARGUMENTS` contains a job id; otherwise this
cancels the latest running job for the current repository. Confirm to the
user whether a job was actually cancelled or there was nothing running to
cancel.
