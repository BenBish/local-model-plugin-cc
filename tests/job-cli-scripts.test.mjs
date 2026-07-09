import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { initGitRepo, isolatedEnv, mkTmpDir, runNode, runNodeExpectFailure } from "./helpers.mjs";

// status.mjs/result.mjs/cancel.mjs are thin CLI wrappers around job-store.mjs
// (already unit-tested in job-store.test.mjs) — these tests exercise the
// scripts themselves as subprocesses: arg parsing, output shape, and exit
// codes, none of which were covered anywhere before this file.

const jobStore = await import("../plugins/local-model/scripts/lib/job-store.mjs");
const { jobsDir } = await import("../plugins/local-model/scripts/lib/paths.mjs");
const { resolveRepoRoot, repoId } = await import("../plugins/local-model/scripts/lib/repo-identity.mjs");

function resultFileFor(repoIdValue, jobId) {
  return path.join(jobsDir(), repoIdValue, `${jobId}.result.json`);
}

/**
 * Seeds job data via job-store.mjs directly (setting HOME/XDG_STATE_HOME on
 * this process temporarily, same pattern as job-store.test.mjs), then
 * returns an env object pointing a subprocess at that same isolated state
 * dir plus a real git repo fixture to run the CLI scripts against.
 *
 * @param {(repoPath: string, repoIdValue: string) => void} seedFn
 */
function withSeededJobs(seedFn) {
  const home = mkTmpDir("job-cli-home-");
  const repo = initGitRepo();
  const repoIdValue = repoId(resolveRepoRoot(repo));
  const prev = { HOME: process.env.HOME, XDG_STATE_HOME: process.env.XDG_STATE_HOME };
  process.env.HOME = home;
  process.env.XDG_STATE_HOME = path.join(home, ".local", "state");
  try {
    seedFn(repo, repoIdValue);
  } finally {
    process.env.HOME = prev.HOME;
    if (prev.XDG_STATE_HOME === undefined) delete process.env.XDG_STATE_HOME;
    else process.env.XDG_STATE_HOME = prev.XDG_STATE_HOME;
  }
  const env = { ...process.env, HOME: home, XDG_STATE_HOME: path.join(home, ".local", "state") };
  return { repo, env, repoIdValue };
}

// --- status.mjs ---------------------------------------------------------

test("status: reports an empty job list for a repo with no jobs", () => {
  const repo = initGitRepo();
  const out = JSON.parse(runNode("status.mjs", [], { cwd: repo, env: isolatedEnv({ withPluginConfig: false }).env }));
  assert.deepEqual(out.jobs, []);
});

test("status: lists seeded jobs with summarized fields", () => {
  const { repo, env } = withSeededJobs((repoPath, repoIdValue) => {
    jobStore.createJob({ repoId: repoIdValue, repoRoot: repoPath, kind: "review", mutating: false, model: "m/x" });
  });
  const out = JSON.parse(runNode("status.mjs", [], { cwd: repo, env }));
  assert.equal(out.jobs.length, 1);
  assert.equal(out.jobs[0].kind, "review");
  assert.equal(out.jobs[0].status, "running");
  assert.equal(out.jobs[0].model, "m/x");
});

test("status: --job-id shows a single job", () => {
  let jobId;
  const { repo, env } = withSeededJobs((repoPath, repoIdValue) => {
    const job = jobStore.createJob({ repoId: repoIdValue, repoRoot: repoPath, kind: "rescue", mutating: true });
    jobId = job.id;
  });
  const out = JSON.parse(runNode("status.mjs", ["--job-id", jobId], { cwd: repo, env }));
  assert.equal(out.id, jobId);
  assert.equal(out.kind, "rescue");
});

test("status: --job-id for an unknown job exits non-zero", () => {
  const { repo, env } = withSeededJobs(() => {});
  const { stderr } = runNodeExpectFailure("status.mjs", ["--job-id", "job_bogus"], { cwd: repo, env });
  assert.match(stderr, /Job not found/);
});

test("status: outside a git repo exits non-zero", () => {
  const notARepo = mkTmpDir("not-a-repo-");
  const { stderr } = runNodeExpectFailure("status.mjs", [], { cwd: notARepo, env: isolatedEnv({ withPluginConfig: false }).env });
  assert.match(stderr, /git repository/);
});

// --- result.mjs ----------------------------------------------------------

test("result: no jobs recorded exits non-zero", () => {
  const repo = initGitRepo();
  const { stderr } = runNodeExpectFailure("result.mjs", [], { cwd: repo, env: isolatedEnv({ withPluginConfig: false }).env });
  assert.match(stderr, /No jobs recorded/);
});

test("result: a still-running job reports status running without a result", () => {
  const { repo, env } = withSeededJobs((repoPath, repoIdValue) => {
    jobStore.createJob({ repoId: repoIdValue, repoRoot: repoPath, kind: "review", mutating: false });
  });
  const out = JSON.parse(runNode("result.mjs", [], { cwd: repo, env }));
  assert.equal(out.status, "running");
});

test("result: a completed job with a persisted result returns it", () => {
  let jobId;
  const { repo, env } = withSeededJobs((repoPath, repoIdValue) => {
    const job = jobStore.createJob({ repoId: repoIdValue, repoRoot: repoPath, kind: "review", mutating: false });
    jobId = job.id;
    const resultFile = resultFileFor(repoIdValue, job.id);
    fs.mkdirSync(path.dirname(resultFile), { recursive: true });
    fs.writeFileSync(
      resultFile,
      JSON.stringify({ verdict: "approve", summary: "ok", findings: [], next_steps: [] }),
    );
    jobStore.updateJob(repoIdValue, job.id, { status: "completed", resultPath: resultFile });
  });
  const out = JSON.parse(runNode("result.mjs", ["--job-id", jobId], { cwd: repo, env }));
  assert.equal(out.status, "completed");
  assert.equal(out.result.verdict, "approve");
});

test("result: a completed job with no persisted result file reports the fallback shape, not a crash", () => {
  let jobId;
  const { repo, env } = withSeededJobs((repoPath, repoIdValue) => {
    const job = jobStore.createJob({ repoId: repoIdValue, repoRoot: repoPath, kind: "review", mutating: false });
    jobId = job.id;
    jobStore.updateJob(repoIdValue, job.id, { status: "failed", error: "something went wrong" });
  });
  const out = JSON.parse(runNode("result.mjs", ["--job-id", jobId], { cwd: repo, env }));
  assert.equal(out.status, "failed");
  assert.equal(out.error, "something went wrong");
});

test("result: --job-id for an unknown job exits non-zero", () => {
  const { repo, env } = withSeededJobs(() => {});
  const { stderr } = runNodeExpectFailure("result.mjs", ["--job-id", "job_bogus"], { cwd: repo, env });
  assert.match(stderr, /Job not found/);
});

// --- cancel.mjs ------------------------------------------------------------

test("cancel: no running job exits non-zero", () => {
  const repo = initGitRepo();
  const { stderr } = runNodeExpectFailure("cancel.mjs", [], { cwd: repo, env: isolatedEnv({ withPluginConfig: false }).env });
  assert.match(stderr, /No running job found/);
});

test("cancel: a job that already finished is reported as not running, no signal sent", () => {
  let jobId;
  const { repo, env } = withSeededJobs((repoPath, repoIdValue) => {
    const job = jobStore.createJob({ repoId: repoIdValue, repoRoot: repoPath, kind: "review", mutating: false });
    jobId = job.id;
    jobStore.updateJob(repoIdValue, job.id, { status: "completed" });
  });
  const out = JSON.parse(runNode("cancel.mjs", ["--job-id", jobId], { cwd: repo, env }));
  assert.equal(out.status, "completed");
  assert.match(out.message, /not running/);
});

test("cancel: a genuinely running process is sent SIGTERM and the job is marked cancelled", async () => {
  const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
  await new Promise((resolve) => setTimeout(resolve, 100)); // let it actually start

  let jobId;
  const { repo, env } = withSeededJobs((repoPath, repoIdValue) => {
    const job = jobStore.createJob({ repoId: repoIdValue, repoRoot: repoPath, kind: "rescue", mutating: true });
    jobId = job.id;
    jobStore.updateJob(repoIdValue, job.id, { pid: child.pid });
  });

  const out = JSON.parse(runNode("cancel.mjs", ["--job-id", jobId], { cwd: repo, env }));
  assert.equal(out.status, "cancelled");
  assert.equal(out.signalSent, true);

  const exited = await new Promise((resolve) => {
    child.once("exit", () => resolve(true));
    setTimeout(() => resolve(false), 2000);
  });
  assert.equal(exited, true);
});
