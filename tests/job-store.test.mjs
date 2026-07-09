import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// job-store.mjs reads its base directories from paths.mjs, which reads
// HOME/XDG_* at *call time* (not import time), so setting these env vars
// before each test is enough to isolate the ledger without a subprocess.
import { mkTmpDir } from "./helpers.mjs";

function withIsolatedHome(fn) {
  const home = mkTmpDir("job-store-home-");
  const prev = { HOME: process.env.HOME, XDG_STATE_HOME: process.env.XDG_STATE_HOME };
  process.env.HOME = home;
  process.env.XDG_STATE_HOME = path.join(home, ".local", "state");
  try {
    return fn();
  } finally {
    process.env.HOME = prev.HOME;
    if (prev.XDG_STATE_HOME === undefined) delete process.env.XDG_STATE_HOME;
    else process.env.XDG_STATE_HOME = prev.XDG_STATE_HOME;
  }
}

// Re-import fresh each call isn't necessary: paths.mjs computes paths from
// env vars on every call, not at module-load time, so a single static
// import is safe across tests as long as env vars are set first.
const jobStore = await import("../plugins/local-model/scripts/lib/job-store.mjs");
const { jobsDir } = await import("../plugins/local-model/scripts/lib/paths.mjs");

test("createJob + getJob round-trip", () => {
  withIsolatedHome(() => {
    const job = jobStore.createJob({
      repoId: "repo-a",
      repoRoot: "/tmp/repo-a",
      kind: "review",
      mutating: false,
      model: "test/model",
      agent: "local-review",
    });
    const fetched = jobStore.getJob("repo-a", job.id);
    assert.equal(fetched.id, job.id);
    assert.equal(fetched.status, "running");
  });
});

test("a second mutating job is rejected while one is running", () => {
  withIsolatedHome(() => {
    jobStore.createJob({
      repoId: "repo-b",
      repoRoot: "/tmp/repo-b",
      kind: "rescue",
      mutating: true,
      model: "test/model",
      agent: "local-rescue",
    });
    assert.throws(
      () =>
        jobStore.createJob({
          repoId: "repo-b",
          repoRoot: "/tmp/repo-b",
          kind: "rescue",
          mutating: true,
          model: "test/model",
          agent: "local-rescue",
        }),
      jobStore.ConcurrentMutationError,
    );
  });
});

test("concurrent read-only reviews are allowed", () => {
  withIsolatedHome(() => {
    jobStore.createJob({
      repoId: "repo-c",
      repoRoot: "/tmp/repo-c",
      kind: "review",
      mutating: false,
      model: "test/model",
      agent: "local-review",
    });
    assert.doesNotThrow(() =>
      jobStore.createJob({
        repoId: "repo-c",
        repoRoot: "/tmp/repo-c",
        kind: "review",
        mutating: false,
        model: "test/model",
        agent: "local-review",
      }),
    );
  });
});

test("a running job with a dead PID is reconciled to failed", () => {
  withIsolatedHome(() => {
    const job = jobStore.createJob({
      repoId: "repo-d",
      repoRoot: "/tmp/repo-d",
      kind: "rescue",
      mutating: true,
      model: "test/model",
      agent: "local-rescue",
    });
    jobStore.updateJob("repo-d", job.id, { pid: 999999999 }); // very unlikely to be alive
    const fetched = jobStore.getJob("repo-d", job.id);
    assert.equal(fetched.status, "failed");

    // and a new mutating job should now be allowed
    assert.doesNotThrow(() =>
      jobStore.createJob({
        repoId: "repo-d",
        repoRoot: "/tmp/repo-d",
        kind: "rescue",
        mutating: true,
        model: "test/model",
        agent: "local-rescue",
      }),
    );
  });
});

test("getLatestJob filters by kind and returns the most recent", () => {
  withIsolatedHome(() => {
    const first = jobStore.createJob({
      repoId: "repo-e",
      repoRoot: "/tmp/repo-e",
      kind: "review",
      mutating: false,
      model: "test/model",
      agent: "local-review",
    });
    jobStore.updateJob("repo-e", first.id, { status: "completed" });
    const second = jobStore.createJob({
      repoId: "repo-e",
      repoRoot: "/tmp/repo-e",
      kind: "adversarial-review",
      mutating: false,
      model: "test/model",
      agent: "local-review",
    });
    const latestReview = jobStore.getLatestJob("repo-e", { kind: "review" });
    assert.equal(latestReview.id, first.id);
    const latestAny = jobStore.getLatestJob("repo-e");
    assert.equal(latestAny.id, second.id);
  });
});

test("listJobs ignores sibling *.result.json files written into the same directory", () => {
  withIsolatedHome(() => {
    const job = jobStore.createJob({
      repoId: "repo-f",
      repoRoot: "/tmp/repo-f",
      kind: "review",
      mutating: false,
      model: "test/model",
      agent: "local-review",
    });
    // local-companion.mjs writes ${jobId}.result.json into the same
    // directory as the job ledger file — this also ends in ".json" and
    // must not be picked up as a second, malformed "job".
    const resultFilePath = path.join(jobsDir(), "repo-f", `${job.id}.result.json`);
    fs.writeFileSync(resultFilePath, JSON.stringify({ verdict: "approve", summary: "ok" }));

    const jobs = jobStore.listJobs("repo-f");
    assert.equal(jobs.length, 1);
    assert.equal(jobs[0].id, job.id);

    const latest = jobStore.getLatestJob("repo-f");
    assert.equal(latest.id, job.id);
  });
});
