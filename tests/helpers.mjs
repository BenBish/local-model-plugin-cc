import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const SCRIPTS_DIR = fileURLToPath(new URL("../plugins/local-model/scripts/", import.meta.url));

export function mkTmpDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

export function git(dir, args) {
  return execFileSync("git", args, { cwd: dir, encoding: "utf8" });
}

/** A real, minimal git repo fixture with one committed file. */
export function initGitRepo(prefix = "local-model-repo-") {
  const dir = mkTmpDir(prefix);
  git(dir, ["init", "-q"]);
  git(dir, ["config", "user.email", "test@example.com"]);
  git(dir, ["config", "user.name", "Test"]);
  fs.writeFileSync(path.join(dir, "README.md"), "# fixture\n");
  git(dir, ["add", "."]);
  git(dir, ["commit", "-q", "-m", "init"]);
  return dir;
}

/**
 * A git repo fixture with no commits at all (unborn HEAD) — the normal
 * state right after `git init`, before a first commit. Distinct from
 * initGitRepo() specifically to exercise that state, since it's easy to
 * assume a repo always has a resolvable HEAD.
 */
export function initEmptyGitRepo(prefix = "local-model-empty-repo-") {
  const dir = mkTmpDir(prefix);
  git(dir, ["init", "-q"]);
  git(dir, ["config", "user.email", "test@example.com"]);
  git(dir, ["config", "user.name", "Test"]);
  return dir;
}

/**
 * An isolated HOME (with XDG dirs under it) so tests never read or write
 * the real user's config/state, plus a plugin config already written so
 * scripts don't need a live /local:setup run.
 *
 * @param {{withPluginConfig?: boolean}} [opts]
 * @returns {{env: NodeJS.ProcessEnv, home: string}}
 */
export function isolatedEnv({ withPluginConfig = true } = {}) {
  const home = mkTmpDir("local-model-home-");
  const configDir = path.join(home, ".config", "local-model-plugin-cc");
  const env = {
    ...process.env,
    HOME: home,
    XDG_CONFIG_HOME: path.join(home, ".config"),
    XDG_STATE_HOME: path.join(home, ".local", "state"),
  };

  if (withPluginConfig) {
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(
      path.join(configDir, "config.json"),
      JSON.stringify(
        {
          mode: "oss",
          localProvider: "ollama",
          providerId: "ollama",
          providerName: "Test Provider",
          baseURL: null,
          apiKeyEnvVar: null,
          models: [{ id: "test-model", name: "Test Model" }],
          defaultModel: "test-model",
          configuredAt: new Date().toISOString(),
        },
        null,
        2,
      ),
    );
  }

  return { env, home };
}

/**
 * Write a fake `codex` executable and return the bin dir to prepend to
 * PATH. Behavior is controlled per-test via the FAKE_CODEX_MODE env var
 * (see tests/fake-codex.mjs for supported modes) so tests can exercise
 * success, schema-invalid-then-valid, error, and adversarial rescue-edit
 * scenarios without a real model server.
 */
export function fakeCodexBin() {
  const binDir = mkTmpDir("local-model-fakebin-");
  const fakeScript = fileURLToPath(new URL("./fake-codex.mjs", import.meta.url));
  const shimPath = path.join(binDir, "codex");
  fs.writeFileSync(shimPath, `#!/usr/bin/env node\nimport(${JSON.stringify(fakeScript)});\n`);
  fs.chmodSync(shimPath, 0o755);
  return binDir;
}

/**
 * @param {string} scriptRelPath
 * @param {string[]} args
 * @param {{cwd?: string, env: NodeJS.ProcessEnv}} opts cwd defaults to the
 *   current process's cwd — only repo-scoped scripts (local-companion,
 *   status, result, cancel) need an explicit one; setup.mjs doesn't.
 */
export function runNode(scriptRelPath, args, { cwd, env }) {
  const scriptPath = path.join(SCRIPTS_DIR, scriptRelPath);
  const result = execFileSync(process.execPath, [scriptPath, ...args], {
    cwd,
    env,
    encoding: "utf8",
  });
  return result;
}

/** @param {string} scriptRelPath
 * @param {string[]} args
 * @param {{cwd?: string, env: NodeJS.ProcessEnv}} opts
 */
export function runNodeExpectFailure(scriptRelPath, args, { cwd, env }) {
  const scriptPath = path.join(SCRIPTS_DIR, scriptRelPath);
  try {
    execFileSync(process.execPath, [scriptPath, ...args], { cwd, env, encoding: "utf8" });
    throw new Error("expected failure but command succeeded");
  } catch (err) {
    if (err.status === undefined) throw err;
    return { stdout: err.stdout, stderr: err.stderr, status: err.status };
  }
}
