---
name: local-model-runtime
description: How the local-model-plugin-cc broker scripts work — job model, codex CLI delegation, and result format. Use when invoking or debugging the local-companion.mjs / setup.mjs / status.mjs / result.mjs / cancel.mjs scripts.
---

# local-model-runtime

This plugin delegates work to a local model by brokering to the `codex` CLI
(the same CLI `openai/codex-plugin-cc` itself wraps) pointed at a local
model server, not by implementing its own agent runtime. Everything here
describes that broker contract, including several non-obvious constraints
found by testing against a real local model rather than assumed from docs.

## Job model

Every `/local:review`, `/local:adversarial-review`, and `/local:rescue`
invocation creates one job, recorded outside the target repository (under
the user's XDG state dir, keyed by resolved git-root identity). A job is
one of:

- `review` / `adversarial-review` — read-only, runs plain `codex exec`
  under `-c sandbox_mode=read-only`.
- `rescue` — mutating, runs plain `codex exec` under `-s workspace-write`.
  Empirically, codex's sandbox refuses writes under `.git/` regardless of
  sandbox mode (verified directly), though that isn't documented behavior
  we can cite, so the broker's own diff-safety pass (below) is still the
  primary defense, not this.

All three always use plain `codex exec`, never `codex exec review` — see
"Why not `codex exec review`" below.

Jobs have status `running` → `completed` | `failed` | `cancelled`.
Foreground invocations (no `--background`) block until the job reaches a
terminal state and print the final JSON result directly. Background
invocations print a job ID immediately; use `/local:status` and
`/local:result` to check on them later.

## What the companion script does per job

1. Resolve the repo root and repo identity from the current working
   directory (`git rev-parse --show-toplevel`, real-path resolved).
2. Load the plugin's own config (written by `/local:setup`) and build the
   `codex` CLI args that select the provider/model: always `-c
   model_providers.<id>.base_url=... -c model_providers.<id>.wire_api=responses
   -c model_provider=<id>`, using Ollama/LM Studio's well-known local base
   URLs for those two, or the user-supplied URL for a custom endpoint. `<id>`
   is always prefixed `localmodel-` — codex rejects overrides for reserved
   built-in provider names, and "ollama" itself is one, so the bare
   `localProvider`/`providerId` value can't be used directly. No config
   file is ever generated or written — everything is passed as CLI flags,
   and `--ignore-user-config` ensures the user's personal
   `~/.codex/config.toml` is never read or affected.
3. Spawn `codex exec <provider args> <sandbox args> -C <repo>
   --skip-git-repo-check --json -o <tmpfile> <prompt>` and read the final
   message from the `-o` file — far more reliable than scraping the
   `--json` NDJSON event stream for text, which is only used for
   diagnostics (logged) and extracting the `thread_id`
   (`type: "thread.started"` event).
4. The exit code is the only thing trusted as a hard success/failure
   signal. Codex emits non-fatal `item.completed` events with
   `item.type === "error"` for things like "model metadata not found, using
   fallback metadata" — these are warnings, not failures (observed
   directly: exit code 0, correct output, despite one of these being
   present). Don't treat any `type: "error"` event as fatal on its own.
5. For reviews: the prompt (prompts.mjs) itself specifies the required JSON
   shape and instructs the model to investigate via `git status`/`git diff`
   before answering. The broker validates the parsed JSON against
   `schemas/review-output.schema.json` and, on a mismatch, does one fresh
   retry (not a session-resume — a new `codex exec` call with the
   validation errors folded into the prompt) before failing the job.
6. For rescue: after the run, `diff-safety.mjs` checks every changed file
   (via `git status`) against the repo root (no path/symlink escape, no
   oversized/binary files, HEAD hasn't moved since the run started) before
   reporting the rescue as `completed`. A rejection here fails the job even
   if codex itself reported success — this is a deliberate second gate.

## Why not `codex exec review`

`codex exec review` looks like the obvious choice for `/local:review` — it
has built-in `--uncommitted`/`--base <ref>` diff-scoping and reliably calls
`git status`/`git diff` itself before answering. Two things rule it out,
both confirmed empirically, not assumed from `--help` text:

1. `--uncommitted`/`--base` can't be combined with a custom `[PROMPT]`
   argument (`error: the argument '--uncommitted' cannot be used with
   '[PROMPT]'`), so there's no way to inject this plugin's schema
   instructions or the adversarial-review framing while using them.
2. Even without that conflict, `codex exec review` ignores `--output-schema`
   entirely and always emits its own native `[P1] Title — file:line...`
   text format — not this plugin's JSON schema, and not something
   `--output-schema` overrides.

So `/local:review` and `/local:adversarial-review` both use plain `codex
exec` with the diff target (uncommitted changes, or a `--base <ref>` diff)
described in the prompt text instead (`prompts.mjs`), and rely on
prompt-only schema instructions plus the broker's own validate-and-retry
logic rather than `--output-schema`.

## Why not `--output-schema` even on plain `codex exec`

This one is counterintuitive enough to call out on its own: `--output-schema
<file>` on plain `codex exec` measurably reduces reliability for this
plugin's use case, rather than improving it. Tested head-to-head with the
same prompt and the same model — the *only* variable changed was the
presence of `--output-schema` — and:

- **With** `--output-schema`: the model skipped investigation entirely and
  answered immediately with a schema-shaped but factually wrong result (a
  real uncommitted change existed; it claimed "no changes detected").
- **Without** it: the model ran `git status`, `git diff`, `cat`, `find`, and
  `ls` — five real tool calls — before producing a correctly-grounded
  answer in the exact JSON shape asked for in the prompt text alone.

The theory: constraining final-response shape appears to bias the model
toward jumping straight to that shape, short-circuiting the "investigate
first" instruction elsewhere in the same prompt. Whether that generalizes
beyond the specific model tested is unconfirmed, but the empirical result
was consistent and repeated, so this plugin doesn't use `--output-schema`
at all — schema conformance is enforced entirely via prompt instructions
(`prompts.mjs`) plus the broker's validate-and-one-retry logic
(`local-companion.mjs`), not via the CLI flag that exists for exactly this
purpose. If you're tempted to add `--output-schema` back for "extra safety,"
test that theory against a real model first — the empirical result here
was the opposite of what the flag's docs would suggest.

## Known open risks

- If a job fails in a way that looks like a parsing problem rather than a
  real model/task failure, check the job's log file (path in the job
  record) for the raw `codex` invocation and its `--json` event stream
  before assuming the broker's code is at fault.
- `wire_api = "chat"` is deprecated/rejected by current codex versions for
  custom `model_providers` entries — always use `"responses"`. Local
  servers' OpenAI-compatible endpoints (Ollama, LM Studio, etc.) handled
  this fine in testing despite most only implementing the older Chat
  Completions API, but this is worth re-checking if a future custom-endpoint
  setup fails in a way that looks like a wire-format mismatch.
- The reserved-built-in-provider-name collision (`ollama`) was found for
  that one name specifically; there may be others. If `/local:setup`
  configure fails with "reserved built-in provider IDs," that's the class
  of error — the `localmodel-` prefix in `codex-config.mjs` should already
  prevent it, but if codex adds more reserved names this could resurface
  for a custom `--provider-id` chosen by a user, however unlikely.
