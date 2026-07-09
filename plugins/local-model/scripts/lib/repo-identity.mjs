import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export class NotAGitRepoError extends Error {}

/**
 * Resolve the real (symlink-free) git top-level path for `cwd`. This is the
 * repo-identity anchor everywhere in the broker: job ledger keys, codex's
 * `-C`, and the diff-safety containment checks all use this value, never
 * the raw cwd string.
 */
export function resolveRepoRoot(cwd = process.cwd()) {
  let root;
  try {
    root = execFileSync("git", ["-C", cwd, "rev-parse", "--show-toplevel"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch {
    throw new NotAGitRepoError(`Not inside a git repository: ${cwd}`);
  }
  return fs.realpathSync(root);
}

/**
 * Stable, filesystem-safe identifier for a repo root: a short slug (for
 * human-readable ledger directories) plus a hash of the full real path (so
 * two repos with the same basename never collide).
 */
export function repoId(repoRoot) {
  const hash = createHash("sha256").update(repoRoot).digest("hex").slice(0, 12);
  const slug =
    path
      .basename(repoRoot)
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "repo";
  return `${slug}-${hash}`;
}
