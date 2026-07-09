import test from "node:test";
import assert from "node:assert/strict";
import { buildProviderArgs } from "../plugins/local-model/scripts/lib/codex-config.mjs";

test("buildProviderArgs: oss mode builds -c overrides with the known Ollama base URL (codex exec review rejects --oss)", () => {
  const args = buildProviderArgs({ mode: "oss", localProvider: "ollama", defaultModel: "qwen2.5-coder:7b" });
  assert.ok(!args.includes("--oss"));
  assert.ok(args.includes("model_providers.localmodel-ollama.base_url=http://localhost:11434/v1"));
  assert.ok(args.includes("model_providers.localmodel-ollama.wire_api=responses"));
  assert.ok(args.includes("model_provider=localmodel-ollama"));
  assert.ok(args.includes("qwen2.5-coder:7b"));
});

test("buildProviderArgs: oss mode supports lmstudio with its own known base URL", () => {
  const args = buildProviderArgs({ mode: "oss", localProvider: "lmstudio", defaultModel: "some-model" });
  assert.ok(args.includes("model_providers.localmodel-lmstudio.base_url=http://127.0.0.1:1234/v1"));
  assert.ok(args.includes("model_provider=localmodel-lmstudio"));
});

test("buildProviderArgs: custom mode builds -c model_providers.* overrides with wire_api=responses", () => {
  const args = buildProviderArgs({
    mode: "custom",
    providerId: "myserver",
    providerName: "My Server",
    baseURL: "https://example.com/v1",
    apiKeyEnvVar: null,
    defaultModel: "some-model",
  });
  assert.ok(args.includes("model_providers.localmodel-myserver.base_url=https://example.com/v1"));
  assert.ok(args.includes("model_providers.localmodel-myserver.wire_api=responses"));
  assert.ok(args.includes("model_provider=localmodel-myserver"));
  assert.ok(!args.some((a) => a.includes("wire_api=chat")));
});

test("buildProviderArgs: custom mode with an API key references the env var name, never a literal secret", () => {
  const args = buildProviderArgs({
    mode: "custom",
    providerId: "myserver",
    baseURL: "https://example.com/v1",
    apiKeyEnvVar: "MY_API_KEY",
    defaultModel: "some-model",
  });
  assert.ok(args.includes("model_providers.localmodel-myserver.env_key=MY_API_KEY"));
  assert.ok(!args.some((a) => /sk-|secret|token/i.test(a)));
});

test("buildProviderArgs: custom mode without an API key omits env_key entirely", () => {
  const args = buildProviderArgs({
    mode: "custom",
    providerId: "myserver",
    baseURL: "https://example.com/v1",
    apiKeyEnvVar: null,
    defaultModel: "some-model",
  });
  assert.ok(!args.some((a) => a.includes("env_key")));
});

test("buildProviderArgs: oss mode never sets env_key even if apiKeyEnvVar were somehow present", () => {
  const args = buildProviderArgs({
    mode: "oss",
    localProvider: "ollama",
    apiKeyEnvVar: "SHOULD_BE_IGNORED",
    defaultModel: "m",
  });
  assert.ok(!args.some((a) => a.includes("env_key")));
});

test("buildProviderArgs: always includes --ignore-user-config so the user's personal codex config is never touched", () => {
  const args = buildProviderArgs({ mode: "oss", localProvider: "ollama", defaultModel: "m" });
  assert.equal(args[0], "--ignore-user-config");
});
