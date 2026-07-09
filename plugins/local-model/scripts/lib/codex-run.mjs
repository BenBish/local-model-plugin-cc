import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

export class CodexNotFoundError extends Error {}

export function checkCodexOnPath() {
  const result = spawnSync("codex", ["--version"], { encoding: "utf8" });
  if (result.error && /** @type {NodeJS.ErrnoException} */ (result.error).code === "ENOENT") {
    throw new CodexNotFoundError(
      "codex CLI not found on PATH. Install it (see https://developers.openai.com/codex/cli) and re-run /local:setup.",
    );
  }
  if (result.status !== 0) {
    throw new CodexNotFoundError(
      `codex CLI found but exited with status ${result.status}: ${result.stderr?.trim()}`,
    );
  }
  return result.stdout.trim();
}

function tmpOutputFile() {
  return path.join(
    os.tmpdir(),
    `local-model-plugin-cc-${process.pid}-${crypto.randomBytes(4).toString("hex")}.txt`,
  );
}

function extractThreadId(stdout) {
  for (const line of stdout.split("\n")) {
    try {
      const event = JSON.parse(line);
      if (event.type === "thread.started" && event.thread_id) return event.thread_id;
    } catch {
      continue;
    }
  }
  return null;
}

// Codex emits non-fatal `item.completed` events with `item.type === "error"`
// for things like "model metadata not found, using fallback" — these are
// warnings, not failures (observed directly: exit code 0, correct output,
// despite one of these being present). The exit code is the only thing
// trusted as a hard success/failure signal; this is just diagnostic text
// for when the exit code says it *did* fail.
function extractLastErrorMessage(stdout) {
  let last = null;
  for (const line of stdout.split("\n")) {
    try {
      const event = JSON.parse(line);
      if (event.type === "item.completed" && event.item?.type === "error") {
        last = event.item.message;
      }
    } catch {
      continue;
    }
  }
  return last;
}

/**
 * Run `codex exec` to completion and return its final message.
 *
 * Deliberately always plain `codex exec`, never `codex exec review`:
 * `codex exec review`'s native `--uncommitted`/`--base` flags can't be
 * combined with a custom prompt ("the argument '--uncommitted' cannot be
 * used with '[PROMPT]'"), and it ignores `--output-schema` entirely in
 * favor of its own native "[P1] Title — file:line" text format (confirmed
 * empirically). The diff target is described in the prompt instead (see
 * prompts.mjs).
 *
 * Deliberately never passes `--output-schema` either, even on plain `codex
 * exec`: confirmed empirically that it biases the model toward emitting
 * schema-shaped JSON immediately, skipping the "investigate via git
 * status/diff first" step the prompt asks for — same prompt, same model,
 * `--output-schema` present vs absent was the only variable, and only its
 * absence produced a real git status/diff/read tool-call sequence before
 * answering. Schema conformance instead relies entirely on the prompt's own
 * instructions (prompts.mjs) plus this broker's validate-and-one-retry
 * logic (local-companion.mjs) — less elegant, more reliable in practice.
 *
 * Uses `-o <file>` for the final message rather than scraping the `--json`
 * event stream for text — confirmed reliable in testing, unlike opencode's
 * ambiguous NDJSON shape this replaced. The event stream is still captured
 * to the log for diagnostics and thread-id extraction.
 *
 * @param {{
 *   dir: string,
 *   providerArgs: string[],
 *   sandboxArgs: string[],
 *   prompt: string,
 *   logPath: string,
 *   timeoutMs: number,
 * }} opts
 */
export function runCodex({ dir, providerArgs, sandboxArgs, prompt, logPath, timeoutMs }) {
  const outputFile = tmpOutputFile();
  const args = [
    "exec",
    ...providerArgs,
    ...sandboxArgs,
    "-C",
    dir,
    "--skip-git-repo-check",
    "--json",
    "-o",
    outputFile,
    prompt,
  ];

  const result = spawnSync("codex", args, {
    cwd: dir,
    encoding: "utf8",
    timeout: timeoutMs,
    maxBuffer: 64 * 1024 * 1024,
  });

  fs.appendFileSync(logPath, `$ codex ${args.map((a) => JSON.stringify(a)).join(" ")}\n`);
  fs.appendFileSync(logPath, `${result.stdout ?? ""}\n`);
  if (result.stderr) fs.appendFileSync(logPath, `--- stderr ---\n${result.stderr}\n`);

  if (/** @type {NodeJS.ErrnoException|undefined} */ (result.error)?.code === "ENOENT") {
    throw new CodexNotFoundError("codex CLI not found on PATH.");
  }

  const stdout = result.stdout ?? "";
  const sessionId = extractThreadId(stdout);

  if (result.signal === "SIGTERM" && timeoutMs) {
    cleanup(outputFile);
    return { timedOut: true, sessionId, text: null, exitCode: null, errorDetail: null };
  }

  const text = fs.existsSync(outputFile) ? fs.readFileSync(outputFile, "utf8") : null;
  cleanup(outputFile);

  if (result.status !== 0) {
    return {
      timedOut: false,
      sessionId,
      text: null,
      exitCode: result.status,
      errorDetail: extractLastErrorMessage(stdout) || result.stderr?.trim() || `exit code ${result.status}`,
    };
  }

  return { timedOut: false, sessionId, text, exitCode: result.status, errorDetail: null };
}

function cleanup(file) {
  try {
    fs.unlinkSync(file);
  } catch {
    // best effort
  }
}

/**
 * Spawn this same script detached (for background jobs) and return its PID
 * immediately without waiting for completion. The caller is responsible for
 * having already arranged for `--worker` mode to actually run the job.
 */
export function spawnDetachedWorker({ scriptPath, workerArgs, logPath }) {
  const logFd = fs.openSync(logPath, "a");
  const child = spawn(process.execPath, [scriptPath, ...workerArgs], {
    detached: true,
    stdio: ["ignore", logFd, logFd],
  });
  child.unref();
  fs.closeSync(logFd);
  return child.pid;
}
