---
description: Delegate a coding task to a local model with validated, patch-scoped file edits (no shell access).
argument-hint: "<task description> [--background]"
---

Delegate `$ARGUMENTS` to the `local-rescue` subagent. Do not attempt the
task yourself first and do not pre-edit any files — the whole point of this
command is to let the local model do the work and to see its result
unmodified.

Strip `--background` off before forwarding if present, and tell the
subagent whether this is a background or foreground run. Forward the rest
of the task text to the subagent exactly as the user wrote it — do not
rephrase, summarize, or "clean up" their request.

Use the Task tool to invoke the `local-rescue` subagent with the task text
and background/foreground flag. Relay the subagent's response to the user
verbatim; do not add your own commentary on whether the changes look
correct — if the user wants a second opinion, that's what `/local:review`
is for.

If the subagent reports that a mutating rescue job is already running for
this repository, tell the user and point them at `/local:status` — do not
retry automatically.
