import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { jobsDir, logsDir } from "./paths.mjs";
import { ensureDir, atomicWriteJson, readJsonSafe } from "./fs-utils.mjs";

export class ConcurrentMutationError extends Error {}

const KINDS = new Set(["review", "adversarial-review", "rescue"]);
const STATUSES = new Set(["running", "completed", "failed", "cancelled"]);

function repoJobsDir(repoId) {
  return path.join(jobsDir(), repoId);
}

function jobFilePath(repoId, jobId) {
  return path.join(repoJobsDir(repoId), `${jobId}.json`);
}

function newJobId() {
  const ts = Date.now().toString(36);
  const rand = crypto.randomBytes(3).toString("hex");
  return `job_${ts}${rand}`;
}

export function jobLogPath(repoId, jobId) {
  const dir = path.join(logsDir(), repoId);
  ensureDir(dir);
  return path.join(dir, `${jobId}.log`);
}

/** Every currently "running" job recorded for a repo, without re-checking liveness. */
function runningJobsRaw(repoId) {
  return listJobs(repoId).filter((job) => job.status === "running");
}

/**
 * A job's process may have died without updating the ledger (crash, kill -9,
 * host restart). Treat a "running" job whose PID is no longer alive as
 * failed, so stale entries never block new mutating rescues forever.
 */
function isPidAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

// A job's pid is null for the brief window between createJob() and the
// caller recording its actual pid (see local-companion.mjs). Only reconcile
// jobs that recorded a pid and that pid is now dead — a null pid means
// "not yet started", not "crashed".
function reconcileJob(job) {
  if (job.status === "running" && job.pid && !isPidAlive(job.pid)) {
    return updateJob(job.repoId, job.id, {
      status: "failed",
      error: "Process no longer running (broker or job crashed without updating the ledger).",
    });
  }
  return job;
}

/**
 * @param {{repoId: string, repoRoot: string, kind: string, mutating?: boolean, model?: string, agent?: string, target?: {base: string} | null}} opts
 */
export function createJob({ repoId, repoRoot, kind, mutating, model, agent, target }) {
  if (!KINDS.has(kind)) throw new Error(`Unknown job kind: ${kind}`);

  if (mutating) {
    const activeMutating = runningJobsRaw(repoId)
      .map(reconcileJob)
      .find((job) => job.mutating && job.status === "running");
    if (activeMutating) {
      throw new ConcurrentMutationError(
        `A mutating rescue job (${activeMutating.id}) is already running for this repository. ` +
          `Wait for it to finish or cancel it with /local:cancel before starting another.`,
      );
    }
  }

  const id = newJobId();
  const now = new Date().toISOString();
  const job = {
    id,
    repoId,
    repoRoot,
    kind,
    mutating: Boolean(mutating),
    status: "running",
    model: model ?? null,
    agent: agent ?? null,
    target: target ?? null,
    pid: null,
    codexSessionId: null,
    logPath: jobLogPath(repoId, id),
    resultPath: null,
    error: null,
    createdAt: now,
    // Wall-clock createdAt is only millisecond-resolution and rapid-fire
    // job creation (same process) can tie. This is a monotonic tiebreaker
    // for sort order in listJobs — not meaningful across process
    // boundaries, only within one.
    createdAtHr: process.hrtime.bigint().toString(),
    updatedAt: now,
  };
  ensureDir(repoJobsDir(repoId));
  atomicWriteJson(jobFilePath(repoId, id), job);
  return job;
}

export function updateJob(repoId, jobId, patch) {
  const filePath = jobFilePath(repoId, jobId);
  const existing = readJsonSafe(filePath);
  if (!existing) throw new Error(`Job not found: ${jobId} (repo ${repoId})`);
  if (patch.status && !STATUSES.has(patch.status)) {
    throw new Error(`Unknown job status: ${patch.status}`);
  }
  const updated = { ...existing, ...patch, updatedAt: new Date().toISOString() };
  atomicWriteJson(filePath, updated);
  return updated;
}

export function getJob(repoId, jobId) {
  const job = readJsonSafe(jobFilePath(repoId, jobId));
  return job ? reconcileJob(job) : null;
}

export function listJobs(repoId) {
  const dir = repoJobsDir(repoId);
  // Result files (${jobId}.result.json, written by local-companion.mjs
  // into this same directory) also end in ".json" — exclude them
  // explicitly, or they get parsed as malformed "jobs" (no id/status/etc,
  // since they don't have that shape) and corrupt both the listing and the
  // createdAt-based "latest job" sort.
  const files = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter((f) => f.endsWith(".json") && !f.endsWith(".result.json"))
    : [];
  return files
    .map((f) => readJsonSafe(path.join(dir, f)))
    .filter(Boolean)
    .sort((a, b) => {
      // createdAt is millisecond-resolution and jobs can legitimately tie
      // (rapid-fire commands, or tests). A comparator must return 0 for
      // ties — returning -1 unconditionally, as a naive `a < b ? 1 : -1`
      // does, is not a valid total order and produces readdir-order-
      // dependent (i.e. nondeterministic) results for tied timestamps.
      if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1;
      if (a.createdAtHr && b.createdAtHr && a.createdAtHr !== b.createdAtHr) {
        return BigInt(a.createdAtHr) < BigInt(b.createdAtHr) ? 1 : -1;
      }
      return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
    });
}

/** @param {{kind?: string}} [filter] */
export function getLatestJob(repoId, filter = {}) {
  const { kind } = filter;
  const jobs = listJobs(repoId).map(reconcileJob);
  const filtered = kind ? jobs.filter((j) => j.kind === kind) : jobs;
  return filtered[0] ?? null;
}
