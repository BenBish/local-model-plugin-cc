#!/usr/bin/env node
// Backs /local:status. Usage: node status.mjs [--job-id <id>]

import process from "node:process";
import { resolveRepoRoot, repoId as computeRepoId, NotAGitRepoError } from "./lib/repo-identity.mjs";
import { getJob, listJobs } from "./lib/job-store.mjs";

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--job-id") args.jobId = argv[++i];
  }
  return args;
}

function summarize(job) {
  return {
    id: job.id,
    kind: job.kind,
    status: job.status,
    mutating: job.mutating,
    model: job.model,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    error: job.error,
  };
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

  if (args.jobId) {
    const job = getJob(repoIdValue, args.jobId);
    if (!job) {
      console.error(`Job not found: ${args.jobId}`);
      process.exit(1);
    }
    console.log(JSON.stringify(summarize(job), null, 2));
    return;
  }

  const jobs = listJobs(repoIdValue).slice(0, 20).map(summarize);
  console.log(JSON.stringify({ repo: repoRoot, jobs }, null, 2));
}

main();
