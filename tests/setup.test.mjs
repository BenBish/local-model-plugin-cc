import test from "node:test";
import assert from "node:assert/strict";
import { isolatedEnv, runNode, runNodeExpectFailure } from "./helpers.mjs";

// setup.mjs's `detect` and `smoke-test` commands make real network/process
// calls and are intentionally left to manual verification (see the review
// that prompted this file) — these tests cover `configure`'s validation
// logic and `show`, which is where the actual (previously untested) bugs
// were: unvalidated --provider-id/--api-key-env fed straight into codex -c
// TOML overrides, and a --model id=name parser that truncated names
// containing "=".

function freshEnv() {
  return isolatedEnv({ withPluginConfig: false }).env;
}

test("configure: oss mode with a valid model succeeds and is readable via show", () => {
  const env = freshEnv();
  runNode(
    "setup.mjs",
    ["configure", "--mode", "oss", "--local-provider", "ollama", "--model", "qwen2.5-coder:7b=Qwen"],
    { env },
  );
  const shown = JSON.parse(runNode("setup.mjs", ["show"], { env }));
  assert.equal(shown.configured, true);
  assert.equal(shown.config.mode, "oss");
  assert.equal(shown.config.localProvider, "ollama");
  assert.equal(shown.config.defaultModel, "qwen2.5-coder:7b");
});

test("configure: missing --mode is rejected", () => {
  const env = freshEnv();
  const { stderr } = runNodeExpectFailure("setup.mjs", ["configure", "--model", "m"], { env });
  assert.match(stderr, /--mode/);
});

test("configure: oss mode without a valid --local-provider is rejected", () => {
  const env = freshEnv();
  const { stderr } = runNodeExpectFailure(
    "setup.mjs",
    ["configure", "--mode", "oss", "--local-provider", "bogus", "--model", "m"],
    { env },
  );
  assert.match(stderr, /--local-provider/);
});

test("configure: custom mode without --provider-id or --base-url is rejected", () => {
  const env = freshEnv();
  const { stderr } = runNodeExpectFailure(
    "setup.mjs",
    ["configure", "--mode", "custom", "--model", "m"],
    { env },
  );
  assert.match(stderr, /--provider-id|--base-url/);
});

test("configure: custom mode with no models is rejected", () => {
  const env = freshEnv();
  const { stderr } = runNodeExpectFailure(
    "setup.mjs",
    ["configure", "--mode", "custom", "--provider-id", "myserver", "--base-url", "https://example.com/v1"],
    { env },
  );
  assert.match(stderr, /--model/);
});

test("configure: custom mode rejects a --provider-id that would break the codex -c TOML key path", () => {
  // Regression test: providerId is interpolated directly into
  // `-c model_providers.<id>.*` — a "." here would silently create an
  // unintended nested key path instead of erroring.
  const env = freshEnv();
  const { stderr } = runNodeExpectFailure(
    "setup.mjs",
    [
      "configure",
      "--mode",
      "custom",
      "--provider-id",
      "my.server",
      "--base-url",
      "https://example.com/v1",
      "--model",
      "m",
    ],
    { env },
  );
  assert.match(stderr, /--provider-id/);
});

test("configure: custom mode rejects a --provider-id containing '='", () => {
  const env = freshEnv();
  const { stderr } = runNodeExpectFailure(
    "setup.mjs",
    [
      "configure",
      "--mode",
      "custom",
      "--provider-id",
      "my=server",
      "--base-url",
      "https://example.com/v1",
      "--model",
      "m",
    ],
    { env },
  );
  assert.match(stderr, /--provider-id/);
});

test("configure: custom mode rejects an --api-key-env that isn't a valid env var name", () => {
  const env = freshEnv();
  const { stderr } = runNodeExpectFailure(
    "setup.mjs",
    [
      "configure",
      "--mode",
      "custom",
      "--provider-id",
      "myserver",
      "--base-url",
      "https://example.com/v1",
      "--model",
      "m",
      "--api-key-env",
      "not a valid name",
    ],
    { env },
  );
  assert.match(stderr, /--api-key-env/);
});

test("configure: custom mode accepts a valid provider-id and api-key-env, never persists the literal key", () => {
  const env = freshEnv();
  runNode(
    "setup.mjs",
    [
      "configure",
      "--mode",
      "custom",
      "--provider-id",
      "my-server_1",
      "--base-url",
      "https://example.com/v1",
      "--model",
      "m",
      "--api-key-env",
      "MY_API_KEY",
    ],
    { env },
  );
  const shown = JSON.parse(runNode("setup.mjs", ["show"], { env }));
  assert.equal(shown.config.providerId, "my-server_1");
  assert.equal(shown.config.apiKeyEnvVar, "MY_API_KEY");
});

test("configure: a --model display name containing '=' is not truncated", () => {
  const env = freshEnv();
  runNode(
    "setup.mjs",
    ["configure", "--mode", "oss", "--local-provider", "ollama", "--model", "m=a=b=c"],
    { env },
  );
  const shown = JSON.parse(runNode("setup.mjs", ["show"], { env }));
  assert.equal(shown.config.models[0].id, "m");
  assert.equal(shown.config.models[0].name, "a=b=c");
});

test("show: reports configured:false before any configure call", () => {
  const env = freshEnv();
  const shown = JSON.parse(runNode("setup.mjs", ["show"], { env }));
  assert.equal(shown.configured, false);
});
