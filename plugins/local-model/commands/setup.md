---
description: Detect or configure a local model provider (Ollama, LM Studio, or a custom OpenAI-compatible endpoint) for local-model-plugin-cc.
---

Configure local-model-plugin-cc for this machine. Do not skip steps or guess
configuration — this command's whole job is to get a working, verified
config in place before any review/rescue command is used.

1. Run:
   ```
   node "${CLAUDE_PLUGIN_ROOT}/scripts/setup.mjs" detect
   ```
   This probes `localhost:11434` (Ollama) and `127.0.0.1:1234` (LM Studio)
   with a short timeout and returns any servers found, each with their
   available models.

2. Present what was found to the user:
   - If one or more servers were detected, list them (provider name, model
     count) and ask which to use, and which specific model to default to.
     Prefer a model the user says supports tool calling reliably; if unsure,
     suggest a coder-oriented model if one is present in the list.
   - If nothing was detected, ask the user for a custom OpenAI-compatible
     endpoint: base URL (must end in `/v1` or equivalent), one or more model
     IDs, and — only if the endpoint requires auth — the *name* of an
     environment variable holding the API key. Never ask for or write the
     literal key value; only the variable name is stored.

3. Run configure with the resolved answers. For a detected Ollama or LM
   Studio server (`mode: "oss"`):
   ```
   node "${CLAUDE_PLUGIN_ROOT}/scripts/setup.mjs" configure \
     --mode oss --local-provider ollama \
     --model qwen2.5-coder:7b="Qwen2.5 Coder 7B" \
     --default-model qwen2.5-coder:7b
   ```
   For a custom OpenAI-compatible endpoint (`mode: "custom"`):
   ```
   node "${CLAUDE_PLUGIN_ROOT}/scripts/setup.mjs" configure \
     --mode custom --provider-id myserver --provider-name "My Server" \
     --base-url https://my-server.example.com/v1 \
     --model some-model-id="Some Model" \
     --default-model some-model-id \
     [--api-key-env VAR_NAME]
   ```
   Repeat `--model <id>=<display name>` for each model the user wants
   available. Add `--api-key-env <VAR_NAME>` only for a custom endpoint that
   needs one.

4. Run:
   ```
   node "${CLAUDE_PLUGIN_ROOT}/scripts/setup.mjs" smoke-test
   ```
   This requires the `codex` CLI to be on `PATH` (setup.mjs will say so
   clearly if it isn't — point the user to
   https://developers.openai.com/codex/cli) and sends a trivial prompt to
   the configured model through `codex exec` to confirm the whole path
   works end to end. Report the pass/fail result to the user plainly,
   including the log path on failure so they can see what codex actually
   said.

5. Once the smoke test passes, tell the user setup is complete and they can
   use `/local:review`, `/local:adversarial-review`, and `/local:rescue`.
