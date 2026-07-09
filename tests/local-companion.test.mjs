import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  initGitRepo,
  isolatedEnv,
  fakeCodexBin,
  runNode,
  runNodeExpectFailure,
  mkTmpDir,
} from "./helpers.mjs";

/**
 * @param {string} mode
 * @returns {NodeJS.ProcessEnv}
 */
function envWithFakeCodex(mode) {
  const { env } = isolatedEnv();
  const binDir = fakeCodexBin();
  return {
    ...env,
    PATH: `${binDir}${path.delimiter}${env.PATH}`,
    FAKE_CODEX_MODE: mode,
  };
}

test("review: valid model output is returned as the job result", () => {
  const repo = initGitRepo();
  const env = envWithFakeCodex("success-review");
  const stdout = runNode("local-companion.mjs", ["review"], { cwd: repo, env });
  const result = JSON.parse(stdout);
  assert.equal(result.verdict, "needs-attention");
  assert.equal(result.findings.length, 1);
});

test("review: a non-fatal warning item does not fail the job (exit code is the only trusted signal)", () => {
  const repo = initGitRepo();
  const env = envWithFakeCodex("success-review-with-warning");
  const stdout = runNode("local-companion.mjs", ["review"], { cwd: repo, env });
  const result = JSON.parse(stdout);
  assert.equal(result.verdict, "needs-attention");
});

test("review: invalid output triggers exactly one retry and then succeeds", () => {
  const repo = initGitRepo();
  const env = envWithFakeCodex("invalid-then-valid");
  const stdout = runNode("local-companion.mjs", ["review"], { cwd: repo, env });
  const result = JSON.parse(stdout);
  assert.equal(result.verdict, "needs-attention");
});

test("review: a provider error (nonzero exit) is surfaced, not silently swallowed", () => {
  const repo = initGitRepo();
  const env = envWithFakeCodex("error");
  const { stdout } = runNodeExpectFailure("local-companion.mjs", ["review"], { cwd: repo, env });
  const result = JSON.parse(stdout);
  assert.match(result.error, /fake provider error/);
});

test("review: uses plain `codex exec` (not `exec review`) under a read-only sandbox", () => {
  // codex exec review can't combine --uncommitted/--base with a custom
  // prompt, and ignores --output-schema entirely — see codex-run.mjs. So
  // review always uses plain `codex exec`, with the diff target described
  // in the prompt text instead of as a review-specific CLI flag.
  const repo = initGitRepo();
  const env = envWithFakeCodex("success-review");
  const recordPath = path.join(mkTmpDir("record-"), "record.jsonl");
  env.FAKE_CODEX_RECORD_PATH = recordPath;
  runNode("local-companion.mjs", ["review"], { cwd: repo, env });
  const lines = fs.readFileSync(recordPath, "utf8").trim().split("\n");
  const invocation = JSON.parse(lines[0]);
  assert.equal(invocation.subcommand, "exec");
  assert.ok(invocation.args.cArgs.includes("sandbox_mode=read-only"));
  assert.equal(invocation.args.dir, repo);
  assert.match(invocation.args.prompt, /git status/);
});

test("review: --base <ref> is described in the prompt", () => {
  const repo = initGitRepo();
  const env = envWithFakeCodex("success-review");
  const recordPath = path.join(mkTmpDir("record-"), "record.jsonl");
  env.FAKE_CODEX_RECORD_PATH = recordPath;
  runNode("local-companion.mjs", ["review", "--base", "main"], { cwd: repo, env });
  const invocation = JSON.parse(fs.readFileSync(recordPath, "utf8").trim().split("\n")[0]);
  assert.match(invocation.args.prompt, /git diff main/);
});

test("rescue: a clean edit is reported with the changed file list", () => {
  const repo = initGitRepo();
  const env = envWithFakeCodex("rescue-safe");
  const stdout = runNode("local-companion.mjs", ["rescue", "--", "fix", "the", "thing"], { cwd: repo, env });
  const result = JSON.parse(stdout);
  assert.deepEqual(result.changed_files, ["rescued.txt"]);
});

test("rescue: uses plain `codex exec` under a workspace-write sandbox", () => {
  const repo = initGitRepo();
  const env = envWithFakeCodex("rescue-safe");
  const recordPath = path.join(mkTmpDir("record-"), "record.jsonl");
  env.FAKE_CODEX_RECORD_PATH = recordPath;
  runNode("local-companion.mjs", ["rescue", "--", "fix", "it"], { cwd: repo, env });
  const invocation = JSON.parse(fs.readFileSync(recordPath, "utf8").trim().split("\n")[0]);
  assert.equal(invocation.subcommand, "exec");
  assert.equal(invocation.args.sandbox, "workspace-write");
  assert.equal(invocation.args.dir, repo);
});

test("rescue: no task text is rejected before invoking codex", () => {
  const repo = initGitRepo();
  const env = envWithFakeCodex("rescue-safe");
  const { stdout } = runNodeExpectFailure("local-companion.mjs", ["rescue", "--"], { cwd: repo, env });
  const result = JSON.parse(stdout);
  assert.match(result.error, /no task text/);
});
