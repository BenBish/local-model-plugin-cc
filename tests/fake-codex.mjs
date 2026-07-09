#!/usr/bin/env node
// Fake `codex` binary for tests. Mirrors the CLI surface used by
// codex-run.mjs (`codex exec [review] ... -o <file> --json ...`) so the
// broker's flag-building, output-file reading, exit-code handling, and the
// rescue diff-safety pass can be exercised deterministically without a
// real model server. Behavior is selected via FAKE_CODEX_MODE.

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

function parseArgs(argv) {
  const args = { cArgs: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-C") args.dir = argv[++i];
    else if (a === "-o") args.outputFile = argv[++i];
    else if (a === "-m") args.model = argv[++i];
    else if (a === "-s") args.sandbox = argv[++i];
    else if (a === "-c") args.cArgs.push(argv[++i]);
    else if (a === "--base") args.base = argv[++i];
    else if (a === "--uncommitted") args.uncommitted = true;
    else if (a === "--output-schema") args.outputSchema = argv[++i];
    else if (a === "--json") args.json = true;
    else if (a === "--skip-git-repo-check" || a === "--ignore-user-config") continue;
    else if (i === argv.length - 1) args.prompt = a;
  }
  return args;
}

function emit(event) {
  process.stdout.write(`${JSON.stringify(event)}\n`);
}

function writeOutput(args, text) {
  if (args.outputFile) fs.writeFileSync(args.outputFile, text);
}

const threadId = `fake_thread_${Math.random().toString(36).slice(2, 10)}`;

const VALID_REVIEW = {
  verdict: "needs-attention",
  summary: "Found one issue.",
  findings: [
    {
      severity: "medium",
      title: "Example finding",
      body: "This is a fake finding for tests.",
      file: "README.md",
      line_start: 1,
      line_end: 1,
      confidence: 0.9,
      recommendation: "Fix it.",
    },
  ],
  next_steps: ["Address the finding above."],
};

function main() {
  const argv = process.argv.slice(2);
  if (argv[0] === "--version") {
    console.log("fake-codex 0.0.0");
    process.exit(0);
  }
  if (argv[0] !== "exec") {
    console.error(`fake-codex: unsupported command ${argv[0]}`);
    process.exit(1);
  }

  let rest = argv.slice(1);
  let subcommand = "exec";
  if (rest[0] === "review") {
    subcommand = "review";
    rest = rest.slice(1);
  }
  const args = parseArgs(rest);
  const mode = process.env.FAKE_CODEX_MODE ?? "success-review";

  if (process.env.FAKE_CODEX_RECORD_PATH) {
    fs.appendFileSync(process.env.FAKE_CODEX_RECORD_PATH, `${JSON.stringify({ subcommand, args })}\n`);
  }

  emit({ type: "thread.started", thread_id: threadId });
  emit({ type: "turn.started" });

  switch (mode) {
    case "success-review": {
      writeOutput(args, `\`\`\`json\n${JSON.stringify(VALID_REVIEW, null, 2)}\n\`\`\``);
      emit({ type: "turn.completed", usage: {} });
      process.exit(0);
      break;
    }
    case "success-review-with-warning": {
      // Non-fatal "error" item (e.g. real codex's "model metadata not
      // found, using fallback") must not be treated as a failure.
      emit({ type: "item.completed", item: { id: "item_0", type: "error", message: "benign warning" } });
      writeOutput(args, `\`\`\`json\n${JSON.stringify(VALID_REVIEW, null, 2)}\n\`\`\``);
      emit({ type: "turn.completed", usage: {} });
      process.exit(0);
      break;
    }
    case "invalid-then-valid": {
      const isRetry = (args.prompt ?? "").includes("did not match the required schema");
      const text = isRetry
        ? `\`\`\`json\n${JSON.stringify(VALID_REVIEW, null, 2)}\n\`\`\``
        : '{"not": "valid"}';
      writeOutput(args, text);
      emit({ type: "turn.completed", usage: {} });
      process.exit(0);
      break;
    }
    case "error": {
      emit({ type: "item.completed", item: { id: "item_0", type: "error", message: "fake provider error" } });
      process.exit(1);
      break;
    }
    case "rescue-safe": {
      fs.writeFileSync(path.join(args.dir, "rescued.txt"), "fixed by fake codex\n");
      writeOutput(args, "Added rescued.txt.");
      emit({ type: "turn.completed", usage: {} });
      process.exit(0);
      break;
    }
    case "rescue-symlink-escape": {
      const outsideDir = fs.mkdtempSync(path.join(path.dirname(args.dir), "escape-target-"));
      fs.writeFileSync(path.join(outsideDir, "escaped.txt"), "should not be reachable\n");
      fs.symlinkSync(outsideDir, path.join(args.dir, "escape-link"));
      writeOutput(args, "Edited via symlink.");
      emit({ type: "turn.completed", usage: {} });
      process.exit(0);
      break;
    }
    case "rescue-oversized": {
      fs.writeFileSync(path.join(args.dir, "huge.txt"), Buffer.alloc(3 * 1024 * 1024, "x"));
      writeOutput(args, "Wrote a large file.");
      emit({ type: "turn.completed", usage: {} });
      process.exit(0);
      break;
    }
    case "rescue-binary": {
      fs.writeFileSync(path.join(args.dir, "binary.dat"), Buffer.from([0, 1, 2, 0, 3, 4]));
      writeOutput(args, "Wrote a binary file.");
      emit({ type: "turn.completed", usage: {} });
      process.exit(0);
      break;
    }
    case "rescue-stale": {
      fs.writeFileSync(path.join(args.dir, "rescued.txt"), "fixed by fake codex\n");
      execFileSync("git", ["-C", args.dir, "commit", "-q", "--allow-empty", "-m", "concurrent commit"]);
      writeOutput(args, "Added rescued.txt.");
      emit({ type: "turn.completed", usage: {} });
      process.exit(0);
      break;
    }
    case "rescue-many-files": {
      for (let i = 0; i < 30; i++) {
        fs.writeFileSync(path.join(args.dir, `file-${i}.txt`), `${i}\n`);
      }
      writeOutput(args, "Wrote many files.");
      emit({ type: "turn.completed", usage: {} });
      process.exit(0);
      break;
    }
    default:
      console.error(`fake-codex: unknown FAKE_CODEX_MODE ${mode}`);
      process.exit(1);
  }
}

main();
