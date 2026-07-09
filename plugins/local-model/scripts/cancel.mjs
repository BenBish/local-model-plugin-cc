#!/usr/bin/env node
// Backs /local:cancel. Usage: node cancel.mjs [--job-id <id>]
// Defaults to the latest running job for the current repository.

import process from "node:process";
import { resolveRepoRoot, repoId as computeRepoId, NotAGitRepoError } from "./lib/repo-identity.mjs";
import { getJob, getLatestJob, listJobs, updateJob } from "./lib/job-store.mjs";

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--job-id") args.jobId = argv[++i];
  }
  return args;
}

function findLatestRunning(repoIdValue) {
  return listJobs(repoIdValue).find((job) => job.status === "running") ?? null;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  let repoRoot;
  try {
    repoRoot = resolveRepoRoot(process.cwd());
  } catch (err) {
    if (err instanceof NotAGitRepoError) {
      console.error(err.message);
      process.exit(1);
    }
    throw err;
  }
  const repoIdValue = computeRepoId(repoRoot);

  const job = args.jobId ? getJob(repoIdValue, args.jobId) : findLatestRunning(repoIdValue);
  if (!job) {
    console.error(args.jobId ? `Job not found: ${args.jobId}` : "No running job found for this repository.");
    process.exit(1);
  }
  if (job.status !== "running") {
    console.log(JSON.stringify({ id: job.id, status: job.status, message: "Job is not running." }, null, 2));
    return;
  }

  let killed = false;
  if (job.pid) {
    try {
      process.kill(job.pid, "SIGTERM");
      killed = true;
    } catch {
      killed = false; // already dead
    }
  }

  const updated = updateJob(repoIdValue, job.id, {
    status: "cancelled",
    error: "Cancelled via /local:cancel.",
  });
  console.log(JSON.stringify({ id: updated.id, status: updated.status, signalSent: killed }, null, 2));
}

main();
