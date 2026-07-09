#!/usr/bin/env node
// Backs /local:setup. Non-interactive by design — the setup.md command
// prompt drives the conversation with the user and calls this script with
// concrete flags at each step, the same division of labor Claude Code
// commands generally use (the .md file is the interactive part; scripts do
// deterministic work).
//
//   node setup.mjs detect
//   node setup.mjs configure --mode oss --local-provider <ollama|lmstudio> \
//     --model <id>[=<display name>] [--model <id2>...] --default-model <id>
//   node setup.mjs configure --mode custom --provider-id <id> --provider-name <name> \
//     --base-url <url> --model <id>[=<display name>] [--api-key-env <VAR>] --default-model <id>
//   node setup.mjs show
//   node setup.mjs smoke-test

import process from "node:process";
import { readPluginConfig, writePluginConfig } from "./lib/plugin-config.mjs";
import { buildProviderArgs } from "./lib/codex-config.mjs";
import { checkCodexOnPath, runCodex, CodexNotFoundError } from "./lib/codex-run.mjs";
import { jobLogPath } from "./lib/job-store.mjs";

const DETECT_TIMEOUT_MS = 1500;

// providerId is interpolated directly into codex `-c model_providers.<id>.*`
// TOML override arguments (see codex-config.mjs), and apiKeyEnvVar into a
// `-c ...env_key=<value>` override — neither is passed through a shell, so
// this isn't a shell-injection concern, but an unvalidated providerId
// containing "." would silently create an unintended nested TOML key path,
// and either containing "=" would break codex's own key=value parsing of
// the -c flag. Rejecting anything but safe identifiers here, before it's
// ever persisted, turns that into a clear error at configure time instead
// of a confusing codex failure later.
const SAFE_PROVIDER_ID = /^[a-zA-Z0-9_-]+$/;
const SAFE_ENV_VAR_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * @param {string} url
 * @param {{timeoutMs?: number}} [opts]
 * @returns {Promise<any>}
 */
async function probe(url, { timeoutMs = DETECT_TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function detectOllama() {
  const data = await probe("http://localhost:11434/api/tags");
  if (!data?.models) return null;
  return {
    mode: "oss",
    localProvider: "ollama",
    models: data.models.map((m) => ({ id: m.name, name: m.name })),
  };
}

async function detectLmStudio() {
  const data = await probe("http://127.0.0.1:1234/v1/models");
  if (!data?.data) return null;
  return {
    mode: "oss",
    localProvider: "lmstudio",
    models: data.data.map((m) => ({ id: m.id, name: m.id })),
  };
}

async function cmdDetect() {
  const [ollama, lmstudio] = await Promise.all([detectOllama(), detectLmStudio()]);
  const candidates = [ollama, lmstudio].filter(Boolean);
  console.log(JSON.stringify({ candidates }, null, 2));
}

function parseConfigureArgs(argv) {
  const args = { models: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--mode") args.mode = argv[++i];
    else if (arg === "--local-provider") args.localProvider = argv[++i];
    else if (arg === "--provider-id") args.providerId = argv[++i];
    else if (arg === "--provider-name") args.providerName = argv[++i];
    else if (arg === "--base-url") args.baseURL = argv[++i];
    else if (arg === "--api-key-env") args.apiKeyEnvVar = argv[++i];
    else if (arg === "--default-model") args.defaultModel = argv[++i];
    else if (arg === "--model") {
      // Split on the first "=" only — String.split("=") would silently
      // truncate a display name that itself contains "=".
      const raw = argv[++i];
      const eqIdx = raw.indexOf("=");
      const id = eqIdx === -1 ? raw : raw.slice(0, eqIdx);
      const name = eqIdx === -1 ? id : raw.slice(eqIdx + 1);
      args.models.push({ id, name });
    }
  }
  return args;
}

function cmdConfigure(argv) {
  const args = parseConfigureArgs(argv);
  if (args.mode !== "oss" && args.mode !== "custom") {
    console.error('Missing or invalid --mode (must be "oss" or "custom").');
    process.exit(1);
  }
  if (args.mode === "oss" && !["ollama", "lmstudio"].includes(args.localProvider)) {
    console.error('--mode oss requires --local-provider ollama|lmstudio.');
    process.exit(1);
  }
  if (args.mode === "custom") {
    for (const required of ["providerId", "baseURL"]) {
      if (!args[required]) {
        console.error(`--mode custom requires --${required.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase())}`);
        process.exit(1);
      }
    }
    if (!SAFE_PROVIDER_ID.test(args.providerId)) {
      console.error(
        `--provider-id must match ${SAFE_PROVIDER_ID} (letters, numbers, "-", "_" only): got ${JSON.stringify(args.providerId)}`,
      );
      process.exit(1);
    }
    if (args.apiKeyEnvVar && !SAFE_ENV_VAR_NAME.test(args.apiKeyEnvVar)) {
      console.error(
        `--api-key-env must be a valid environment variable name (${SAFE_ENV_VAR_NAME}): got ${JSON.stringify(args.apiKeyEnvVar)}`,
      );
      process.exit(1);
    }
  }
  if (args.models.length === 0) {
    console.error("At least one --model <id> is required.");
    process.exit(1);
  }

  const config = {
    mode: args.mode,
    localProvider: args.mode === "oss" ? args.localProvider : null,
    providerId: args.mode === "custom" ? args.providerId : args.localProvider,
    providerName: args.providerName ?? args.providerId ?? args.localProvider,
    baseURL: args.mode === "custom" ? args.baseURL : null,
    apiKeyEnvVar: args.mode === "custom" ? (args.apiKeyEnvVar ?? null) : null,
    models: args.models,
    defaultModel: args.defaultModel ?? args.models[0].id,
    configuredAt: new Date().toISOString(),
  };
  writePluginConfig(config);
  console.log(JSON.stringify({ config }, null, 2));
}

function cmdShow() {
  const config = readPluginConfig();
  if (!config) {
    console.log(JSON.stringify({ configured: false }));
    return;
  }
  console.log(JSON.stringify({ configured: true, config }, null, 2));
}

async function cmdSmokeTest() {
  const config = readPluginConfig();
  if (!config) {
    console.error("No configuration found. Run `configure` first.");
    process.exit(1);
  }
  try {
    checkCodexOnPath();
  } catch (err) {
    if (err instanceof CodexNotFoundError) {
      console.error(err.message);
      process.exit(1);
    }
    throw err;
  }

  const logPath = jobLogPath("setup-smoke-test", `smoke-${Date.now()}`);
  const result = runCodex({
    dir: process.cwd(),
    providerArgs: buildProviderArgs(config),
    sandboxArgs: ["-c", "sandbox_mode=read-only"],
    prompt: "Reply with exactly the single word: ok",
    logPath,
    timeoutMs: 30_000,
  });

  if (result.timedOut) {
    console.error(`Smoke test timed out. Full log: ${logPath}`);
    process.exit(1);
  }
  if (result.exitCode !== 0) {
    console.error(`Smoke test failed: ${result.errorDetail}\nFull log: ${logPath}`);
    process.exit(1);
  }
  console.log(`Smoke test passed. Model responded. Full log: ${logPath}`);
}

async function main() {
  const [, , command, ...rest] = process.argv;
  switch (command) {
    case "detect":
      return cmdDetect();
    case "configure":
      return cmdConfigure(rest);
    case "show":
      return cmdShow();
    case "smoke-test":
      return cmdSmokeTest();
    default:
      console.error("Usage: setup.mjs <detect|configure|show|smoke-test>");
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(err.stack ?? String(err));
  process.exit(1);
});
