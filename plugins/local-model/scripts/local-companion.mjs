#!/usr/bin/env node
// Broker invoked by the /local:review, /local:adversarial-review, and
// /local:rescue commands (the latter via the local-rescue subagent). Usage:
//
//   node local-companion.mjs review [--base <ref>] [--background]
//   node local-companion.mjs adversarial-review [--base <ref>] [--background] [--focus "..."]
//   node local-companion.mjs rescue [--background] -- <task text>
//
// Foreground runs (no --background) block and print the final JSON result
// to stdout, matching codex-plugin-cc's "return companion script stdout
// verbatim" convention for the calling slash command.
//
// Delegates to the `codex` CLI's own local-model support (--oss
// --local-provider, or -c model_providers.* overrides for a custom
// endpoint) rather than reimplementing a provider/tool-loop runtime — see
// the plan's "Pivot" section for why this replaced an earlier opencode
// broker.

import path from "node:path";
import process from "node:process";
import { resolveRepoRoot, repoId as computeRepoId, NotAGitRepoError } from "./lib/repo-identity.mjs";
import { readPluginConfig } from "./lib/plugin-config.mjs";
import { buildProviderArgs } from "./lib/codex-config.mjs";
import { createJob, updateJob, getJob, ConcurrentMutationError } from "./lib/job-store.mjs";
import { jobsDir } from "./lib/paths.mjs";
import { atomicWriteJson } from "./lib/fs-utils.mjs";
import { runCodex, spawnDetachedWorker, checkCodexOnPath, CodexNotFoundError } from "./lib/codex-run.mjs";
import { validateReviewOutput, extractJsonBlock } from "./lib/schema-validate.mjs";
import { snapshotRepoState, validateChanges, DiffSafetyError } from "./lib/diff-safety.mjs";
import { buildReviewPrompt, buildAdversarialReviewPrompt, buildRescuePrompt } from "./lib/prompts.mjs";

const REVIEW_TIMEOUT_MS = 10 * 60 * 1000;
const RESCUE_TIMEOUT_MS = 15 * 60 * 1000;
const RESCUE_MAX_FILES = 25;
const KINDS = ["review", "adversarial-review", "rescue"];

// Both proven equivalent empirically (a real write attempt blocked either
// way); `-c` used for review just because that's what got tested first.
const REVIEW_SANDBOX_ARGS = ["-c", "sandbox_mode=read-only"];
const RESCUE_SANDBOX_ARGS = ["-s", "workspace-write"];

function resultPath(repoIdValue, jobId) {
  return path.join(jobsDir(), repoIdValue, `${jobId}.result.json`);
}

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--base") args.base = argv[++i];
    else if (arg === "--focus") args.focus = argv[++i];
    else if (arg === "--background") args.background = true;
    else if (arg === "--worker") args.worker = true;
    else if (arg === "--job-id") args.jobId = argv[++i];
    else if (arg === "--") continue;
    else args._.push(arg);
  }
  return args;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function requireConfig() {
  const config = readPluginConfig();
  if (!config) fail("No local-model configuration found. Run /local:setup first.");
  return config;
}

function output(resultObj) {
  console.log(JSON.stringify(resultObj, null, 2));
}

async function runReviewJob({ job, repoRoot, repoIdValue, kind, args, config }) {
  const prompt =
    kind === "adversarial-review"
      ? buildAdversarialReviewPrompt(job.target, args.focus)
      : buildReviewPrompt(job.target);
  const providerArgs = buildProviderArgs(config);

  // Shared across the initial call and the schema-invalid retry below, so
  // the two together can never exceed REVIEW_TIMEOUT_MS — previously each
  // call got its own full budget, so a pathological pair of near-timeout
  // calls could take up to 2x the stated timeout for one review.
  const deadline = Date.now() + REVIEW_TIMEOUT_MS;

  let runResult = runCodex({
    dir: repoRoot,
    providerArgs,
    sandboxArgs: REVIEW_SANDBOX_ARGS,
    prompt,
    logPath: job.logPath,
    timeoutMs: REVIEW_TIMEOUT_MS,
  });

  if (runResult.timedOut) {
    updateJob(repoIdValue, job.id, { status: "failed", error: `Timed out after ${REVIEW_TIMEOUT_MS}ms` });
    return output({ error: "timed out" });
  }
  if (runResult.exitCode !== 0) {
    updateJob(repoIdValue, job.id, {
      status: "failed",
      error: runResult.errorDetail,
      codexSessionId: runResult.sessionId,
    });
    return output({ error: runResult.errorDetail });
  }

  let structured = runResult.text ? extractJsonBlock(runResult.text) : null;
  let validation = structured
    ? validateReviewOutput(structured)
    : { valid: false, errors: ["no JSON object found in model output"] };

  if (!validation.valid) {
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      updateJob(repoIdValue, job.id, {
        status: "failed",
        error: `Timed out after ${REVIEW_TIMEOUT_MS}ms (no budget left for the schema-invalid retry)`,
        codexSessionId: runResult.sessionId,
      });
      return output({ error: "timed out" });
    }
    // No session-resume dependency: a fresh call with the validation
    // errors folded into the prompt. No --output-schema here (see
    // codex-run.mjs) — schema conformance is prompt-only, so this retry
    // path is the real safety net, not a rare edge case.
    const retryPrompt = [
      prompt,
      "IMPORTANT: your previous response did not match the required schema. Errors:",
      validation.errors.join("\n"),
      "Respond again with ONLY the corrected JSON object.",
    ].join("\n\n");
    runResult = runCodex({
      dir: repoRoot,
      providerArgs,
      sandboxArgs: REVIEW_SANDBOX_ARGS,
      prompt: retryPrompt,
      logPath: job.logPath,
      timeoutMs: remainingMs,
    });
    if (runResult.timedOut) {
      updateJob(repoIdValue, job.id, {
        status: "failed",
        error: `Timed out after ${REVIEW_TIMEOUT_MS}ms (during the schema-invalid retry)`,
      });
      return output({ error: "timed out" });
    }
    structured = runResult.text ? extractJsonBlock(runResult.text) : null;
    validation = structured
      ? validateReviewOutput(structured)
      : { valid: false, errors: ["no JSON object found in model output"] };
  }

  const resultFile = resultPath(repoIdValue, job.id);
  if (!validation.valid) {
    atomicWriteJson(resultFile, { valid: false, errors: validation.errors, raw: runResult.text });
    updateJob(repoIdValue, job.id, {
      status: "failed",
      error: `Model output did not match schema: ${validation.errors.join("; ")}`,
      resultPath: resultFile,
      codexSessionId: runResult.sessionId,
    });
    return output({ error: "invalid model output", errors: validation.errors });
  }

  atomicWriteJson(resultFile, structured);
  updateJob(repoIdValue, job.id, {
    status: "completed",
    resultPath: resultFile,
    codexSessionId: runResult.sessionId,
  });
  output(structured);
}

async function runRescueJob({ job, repoRoot, repoIdValue, args, config }) {
  const taskText = args._.join(" ").trim();
  if (!taskText) {
    updateJob(repoIdValue, job.id, { status: "failed", error: "No task text provided." });
    return output({ error: "no task text provided" });
  }

  const before = snapshotRepoState(repoRoot);
  const prompt = buildRescuePrompt(taskText);

  const runResult = runCodex({
    dir: repoRoot,
    providerArgs: buildProviderArgs(config),
    sandboxArgs: RESCUE_SANDBOX_ARGS,
    prompt,
    logPath: job.logPath,
    timeoutMs: RESCUE_TIMEOUT_MS,
  });

  if (runResult.timedOut) {
    updateJob(repoIdValue, job.id, { status: "failed", error: `Timed out after ${RESCUE_TIMEOUT_MS}ms` });
    return output({ error: "timed out" });
  }
  if (runResult.exitCode !== 0) {
    updateJob(repoIdValue, job.id, {
      status: "failed",
      error: runResult.errorDetail,
      codexSessionId: runResult.sessionId,
    });
    return output({ error: runResult.errorDetail });
  }

  let safety;
  try {
    safety = validateChanges(repoRoot, before);
  } catch (err) {
    if (err instanceof DiffSafetyError) {
      updateJob(repoIdValue, job.id, {
        status: "failed",
        error: `Rejected: ${err.message}`,
        codexSessionId: runResult.sessionId,
      });
      return output({ error: err.message, code: err.code });
    }
    throw err;
  }

  if (safety.changedFiles.length > RESCUE_MAX_FILES) {
    updateJob(repoIdValue, job.id, {
      status: "failed",
      error: `Too many files changed (${safety.changedFiles.length} > ${RESCUE_MAX_FILES}).`,
    });
    return output({ error: "too many files changed", changedFiles: safety.changedFiles });
  }

  const resultFile = resultPath(repoIdValue, job.id);
  const result = { summary: runResult.text?.trim() ?? "", changed_files: safety.changedFiles };
  atomicWriteJson(resultFile, result);
  updateJob(repoIdValue, job.id, {
    status: "completed",
    resultPath: resultFile,
    codexSessionId: runResult.sessionId,
  });
  output(result);
}

async function runJob({ jobId, repoRoot, repoIdValue, kind, args, config }) {
  const job = getJob(repoIdValue, jobId);
  if (!job) fail(`Job not found: ${jobId}`);
  try {
    if (kind === "rescue") {
      await runRescueJob({ job, repoRoot, repoIdValue, args, config });
    } else {
      await runReviewJob({ job, repoRoot, repoIdValue, kind, args, config });
    }
  } catch (err) {
    updateJob(repoIdValue, jobId, { status: "failed", error: err.message });
    output({ error: err.message });
  }
  // Every run*Job branch above prints its own JSON result and returns
  // normally rather than throwing on a handled failure (invalid schema,
  // diff-safety rejection, timeout, provider error) — so the only way a
  // caller (a shell script, a test, the slash command) can tell success
  // from failure is the process exit code. Set it here from the ledger's
  // final status rather than scattering process.exit() calls through every
  // failure branch above.
  const finalJob = getJob(repoIdValue, jobId);
  if (finalJob.status !== "completed") {
    process.exitCode = 1;
  }
}

async function main() {
  const [, , kind, ...rest] = process.argv;
  if (!KINDS.includes(kind)) {
    fail(`Usage: local-companion.mjs <${KINDS.join("|")}> [options]`);
  }
  const args = parseArgs(rest);

  let repoRoot;
  try {
    repoRoot = resolveRepoRoot(process.cwd());
  } catch (err) {
    if (err instanceof NotAGitRepoError) fail(err.message);
    throw err;
  }
  const repoIdValue = computeRepoId(repoRoot);
  const config = requireConfig();

  try {
    checkCodexOnPath();
  } catch (err) {
    if (err instanceof CodexNotFoundError) fail(err.message);
    throw err;
  }

  if (args.worker) {
    await runJob({ jobId: args.jobId, repoRoot, repoIdValue, kind, args, config });
    return;
  }

  const mutating = kind === "rescue";
  let job;
  try {
    job = createJob({
      repoId: repoIdValue,
      repoRoot,
      kind,
      mutating,
      model: `${config.providerId}:${config.defaultModel}`,
      agent: mutating ? "local-rescue" : "local-review",
      target: args.base ? { base: args.base } : null,
    });
  } catch (err) {
    if (err instanceof ConcurrentMutationError) fail(err.message);
    throw err;
  }

  if (args.background) {
    const workerArgs = [kind, "--worker", "--job-id", job.id, ...rest.filter((a) => a !== "--background")];
    const pid = spawnDetachedWorker({ scriptPath: process.argv[1], workerArgs, logPath: job.logPath });
    updateJob(repoIdValue, job.id, { pid });
    console.log(`Started background job ${job.id}. Check with /local:status or /local:result.`);
    return;
  }

  updateJob(repoIdValue, job.id, { pid: process.pid });
  await runJob({ jobId: job.id, repoRoot, repoIdValue, kind, args, config });
}

main().catch((err) => {
  console.error(err.stack ?? String(err));
  process.exit(1);
});
