import test from "node:test";
import assert from "node:assert/strict";
import { initGitRepo, isolatedEnv, fakeCodexBin, runNodeExpectFailure } from "./helpers.mjs";
import path from "node:path";

function envWithFakeCodex(mode) {
  const { env } = isolatedEnv();
  const binDir = fakeCodexBin();
  return {
    ...env,
    PATH: `${binDir}${path.delimiter}${env.PATH}`,
    FAKE_CODEX_MODE: mode,
  };
}

test("rescue: a symlink-escape edit is rejected, not reported as applied", () => {
  const repo = initGitRepo();
  const env = envWithFakeCodex("rescue-symlink-escape");
  const { stdout } = runNodeExpectFailure("local-companion.mjs", ["rescue", "--", "do", "it"], {
    cwd: repo,
    env,
  });
  const result = JSON.parse(stdout);
  assert.equal(result.code, "SYMLINK_ESCAPE");
});

test("rescue: a dangling symlink-escape edit is rejected, not reported as applied", () => {
  const repo = initGitRepo();
  const env = envWithFakeCodex("rescue-dangling-symlink-escape");
  const { stdout } = runNodeExpectFailure("local-companion.mjs", ["rescue", "--", "do", "it"], {
    cwd: repo,
    env,
  });
  const result = JSON.parse(stdout);
  assert.equal(result.code, "SYMLINK_ESCAPE");
});

test("rescue: an oversized file edit is rejected", () => {
  const repo = initGitRepo();
  const env = envWithFakeCodex("rescue-oversized");
  const { stdout } = runNodeExpectFailure("local-companion.mjs", ["rescue", "--", "do", "it"], {
    cwd: repo,
    env,
  });
  const result = JSON.parse(stdout);
  assert.equal(result.code, "OVERSIZED_FILE");
});

test("rescue: a binary file edit is rejected", () => {
  const repo = initGitRepo();
  const env = envWithFakeCodex("rescue-binary");
  const { stdout } = runNodeExpectFailure("local-companion.mjs", ["rescue", "--", "do", "it"], {
    cwd: repo,
    env,
  });
  const result = JSON.parse(stdout);
  assert.equal(result.code, "BINARY_FILE");
});

test("rescue: a concurrent commit during the run is treated as stale and rejected", () => {
  const repo = initGitRepo();
  const env = envWithFakeCodex("rescue-stale");
  const { stdout } = runNodeExpectFailure("local-companion.mjs", ["rescue", "--", "do", "it"], {
    cwd: repo,
    env,
  });
  const result = JSON.parse(stdout);
  assert.equal(result.code, "STALE_HEAD");
});

test("rescue: too many changed files is rejected even if each file is individually safe", () => {
  const repo = initGitRepo();
  const env = envWithFakeCodex("rescue-many-files");
  const { stdout } = runNodeExpectFailure("local-companion.mjs", ["rescue", "--", "do", "it"], {
    cwd: repo,
    env,
  });
  const result = JSON.parse(stdout);
  assert.match(result.error, /too many files changed/);
});
