#!/usr/bin/env node
// Backs /local:result. Usage: node result.mjs [--job-id <id>]
// Defaults to the latest job (any kind) for the current repository.

import fs from "node:fs";
import process from "node:process";
import { resolveRepoRoot, repoId as computeRepoId, NotAGitRepoError } from "./lib/repo-identity.mjs";
import { getJob, getLatestJob } from "./lib/job-store.mjs";

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--job-id") args.jobId = argv[++i];
  }
  return args;
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

  const job = args.jobId ? getJob(repoIdValue, args.jobId) : getLatestJob(repoIdValue);
  if (!job) {
    console.error(args.jobId ? `Job not found: ${args.jobId}` : "No jobs recorded for this repository.");
    process.exit(1);
  }

  if (job.status === "running") {
    console.log(JSON.stringify({ id: job.id, status: "running", message: "Job is still running." }, null, 2));
    return;
  }

  if (!job.resultPath || !fs.existsSync(job.resultPath)) {
    console.log(
      JSON.stringify(
        { id: job.id, status: job.status, error: job.error ?? "No result was persisted for this job." },
        null,
        2,
      ),
    );
    return;
  }

  const result = JSON.parse(fs.readFileSync(job.resultPath, "utf8"));
  console.log(JSON.stringify({ id: job.id, kind: job.kind, status: job.status, result }, null, 2));
}

main();
