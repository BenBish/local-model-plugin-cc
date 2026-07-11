import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

// Scope note: every check here operates on paths reported by `git status`,
// which by construction only ever reports paths inside the repo worktree.
// That makes this module effective against a *symlink-mediated* escape
// (a tracked/untracked symlink inside the repo whose target resolves
// outside it) but structurally unable to observe a write that landed
// entirely outside the repo tree (e.g. via a raw absolute-path write). That
// class of escape can only be prevented at the point of the write itself —
// i.e. by codex's own sandbox (`-s workspace-write`, OS-level) — which is
// exactly why this module is defense-in-depth, not a complete substitute
// for it.
const MAX_FILE_BYTES = 2 * 1024 * 1024; // 2 MiB
const BINARY_SNIFF_BYTES = 8000;

export class DiffSafetyError extends Error {
  constructor(message, code, filePath) {
    super(message);
    this.code = code;
    this.filePath = filePath;
  }
}

function git(repoRoot, args) {
  return execFileSync("git", ["-C", repoRoot, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

/**
 * `git rev-parse HEAD` throws ("fatal: ambiguous argument 'HEAD'") on a
 * repo with zero commits — an "unborn" HEAD, the normal state right after
 * `git init` and before any commit. That's a real, unremarkable starting
 * point (confirmed via a real first-use report, not hypothetical), not an
 * error condition, so it's treated as "no HEAD yet" (null) rather than
 * left to throw a raw git subprocess error up through snapshotRepoState/
 * validateChanges. The before/after staleness comparison in validateChanges
 * still works correctly on null: null !== null is false (no false-positive
 * staleness on two commit-less snapshots), and null !== "<sha>" is true (a
 * commit appearing during the run is still correctly detected as stale).
 */
function currentHeadSha(repoRoot) {
  try {
    return git(repoRoot, ["rev-parse", "HEAD"]).trim();
  } catch {
    return null;
  }
}

/**
 * Capture enough state before a mutating rescue run to detect two things
 * afterward: (a) someone else committed concurrently (HEAD moved), and
 * (b) which files actually changed. We can't see opencode's internal
 * per-file read timestamps, so "stale" is approximated at the HEAD level —
 * documented as an open precision gap in the plan.
 */
export function snapshotRepoState(repoRoot) {
  const headSha = currentHeadSha(repoRoot);
  const statusBefore = git(repoRoot, ["status", "--porcelain=v1"]);
  return { headSha, statusBefore, capturedAt: Date.now() };
}

function isWithinRoot(root, candidate) {
  const rel = path.relative(root, candidate);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

const MAX_SYMLINK_HOPS = 40;

/**
 * Like fs.realpathSync, but doesn't require the final target to exist:
 * walks the symlink chain manually (lstat-based, so it sees the link
 * itself rather than following through to a possibly-nonexistent target)
 * and returns the fully resolved path even if it points nowhere, so
 * containment can still be checked on it.
 *
 * This matters because fs.existsSync()/fs.realpathSync() both follow
 * symlinks to determine existence — for a *dangling* symlink (target
 * doesn't exist), fs.existsSync() returns false, which previously made the
 * caller skip validation entirely. A symlink pointing outside the repo to
 * a path that happens not to exist yet (or not on this machine) escaped
 * detection this way. Confirmed empirically: fs.existsSync() on a dangling
 * symlink returns false while fs.lstatSync() still sees a real filesystem
 * entry.
 */
function resolveMaybeDanglingRealpath(startPath) {
  let current = startPath;
  const seen = new Set();
  for (let hops = 0; hops < MAX_SYMLINK_HOPS; hops++) {
    let lst;
    try {
      lst = fs.lstatSync(current);
    } catch {
      return current; // this segment doesn't exist at all: nothing further to resolve
    }
    if (!lst.isSymbolicLink()) return current;
    if (seen.has(current)) {
      throw new DiffSafetyError(`Symlink cycle detected: ${startPath}`, "SYMLINK_ESCAPE", startPath);
    }
    seen.add(current);
    const target = fs.readlinkSync(current);
    current = path.isAbsolute(target) ? target : path.resolve(path.dirname(current), target);
  }
  throw new DiffSafetyError(`Symlink chain too deep: ${startPath}`, "SYMLINK_ESCAPE", startPath);
}

/**
 * Resolve `relPath` against `repoRoot`, following symlinks (including
 * dangling ones — see resolveMaybeDanglingRealpath), and confirm the real,
 * final location is still inside the repo. Rejects path traversal
 * (`../../etc/passwd`) and symlink escapes (a tracked symlink whose target
 * resolves outside the repo, whether or not that target currently exists)
 * identically.
 */
function resolveInsideRoot(repoRoot, relPath) {
  const absPath = path.resolve(repoRoot, relPath);
  if (!isWithinRoot(repoRoot, absPath)) {
    throw new DiffSafetyError(`Path escapes repository root: ${relPath}`, "PATH_TRAVERSAL", relPath);
  }

  // Walk from the repo root down, resolving each path segment, so a
  // symlinked intermediate directory (not just the final component) is
  // caught before we ever stat/read the target.
  let current = repoRoot;
  const segments = path.relative(repoRoot, absPath).split(path.sep).filter(Boolean);
  for (const segment of segments) {
    current = path.join(current, segment);
    let entryExists = true;
    try {
      fs.lstatSync(current);
    } catch {
      entryExists = false;
    }
    if (!entryExists) continue; // deleted/new file: nothing to walk further
    const real = resolveMaybeDanglingRealpath(current);
    if (!isWithinRoot(repoRoot, real)) {
      throw new DiffSafetyError(`Symlink escapes repository root: ${relPath}`, "SYMLINK_ESCAPE", relPath);
    }
  }
  return absPath;
}

// `git status` never reports paths under `.git/` in the first place (it's
// repository metadata, not worktree content), so this check is a cheap
// no-op safety net, not the real defense. Empirically, codex's
// `workspace-write` sandbox itself refuses writes under `.git/` regardless
// of sandbox mode (verified directly: a normal in-repo write succeeded, a
// targeted `.git/hooks/` write was consistently refused even under a direct
// forceful instruction) — but that isn't documented behavior we can cite,
// so keep this check as a second layer rather than removing it.
function assertNotGitInternal(relPath) {
  const normalized = relPath.split(path.sep).join("/");
  if (normalized === ".git" || normalized.startsWith(".git/")) {
    throw new DiffSafetyError(`Refusing to touch .git internals: ${relPath}`, "GIT_INTERNAL", relPath);
  }
}

function looksBinary(absPath) {
  const fd = fs.openSync(absPath, "r");
  try {
    const buffer = Buffer.alloc(BINARY_SNIFF_BYTES);
    const bytesRead = fs.readSync(fd, buffer, 0, BINARY_SNIFF_BYTES, 0);
    return buffer.subarray(0, bytesRead).includes(0);
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * After a rescue run, validate every changed path against the repo root,
 * .git, symlink-escape, binary, and size constraints, and confirm HEAD
 * hasn't moved since the snapshot. Throws DiffSafetyError on the first
 * violation — callers should treat that as "reject the whole rescue result,
 * do not report it as applied."
 */
export function validateChanges(repoRoot, before) {
  const headSha = currentHeadSha(repoRoot);
  if (headSha !== before.headSha) {
    throw new DiffSafetyError(
      "Repository HEAD moved during the rescue run (concurrent commit) — treating result as stale.",
      "STALE_HEAD",
      null,
    );
  }

  const statusAfter = git(repoRoot, ["status", "--porcelain=v1", "-z"]);
  const changed = statusAfter
    .split("\0")
    .filter(Boolean)
    .map((entry) => entry.slice(3));

  const changedFiles = [];
  for (const relPath of changed) {
    assertNotGitInternal(relPath);
    const absPath = resolveInsideRoot(repoRoot, relPath);

    if (fs.existsSync(absPath) && fs.statSync(absPath).isFile()) {
      const size = fs.statSync(absPath).size;
      if (size > MAX_FILE_BYTES) {
        throw new DiffSafetyError(
          `Changed file exceeds ${MAX_FILE_BYTES} bytes: ${relPath}`,
          "OVERSIZED_FILE",
          relPath,
        );
      }
      if (looksBinary(absPath)) {
        throw new DiffSafetyError(`Refusing binary file edit: ${relPath}`, "BINARY_FILE", relPath);
      }
    }
    changedFiles.push(relPath);
  }

  return { headSha, changedFiles };
}
