import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  snapshotRepoState,
  validateChanges,
  DiffSafetyError,
} from "../plugins/local-model/scripts/lib/diff-safety.mjs";
import { initGitRepo, git, mkTmpDir } from "./helpers.mjs";

test("validateChanges accepts a safe, small text-file change", () => {
  const repo = initGitRepo();
  const before = snapshotRepoState(repo);
  fs.writeFileSync(path.join(repo, "new-file.txt"), "hello\n");
  const result = validateChanges(repo, before);
  assert.deepEqual(result.changedFiles, ["new-file.txt"]);
});

test("validateChanges rejects a symlink that escapes the repo root", () => {
  const repo = initGitRepo();
  const before = snapshotRepoState(repo);
  const outside = mkTmpDir("escape-target-");
  fs.writeFileSync(path.join(outside, "secret.txt"), "should not be reachable\n");
  fs.symlinkSync(outside, path.join(repo, "escape-link"));
  // git reports the new symlink itself as a changed/untracked path; a real
  // edit tool following it to write "secret.txt" would be the actual
  // exploit, but the symlink's mere presence is enough to trigger rejection.
  assert.throws(
    () => validateChanges(repo, before),
    (err) => err instanceof DiffSafetyError && err.code === "SYMLINK_ESCAPE",
  );
});

test("validateChanges rejects a dangling symlink that points outside the repo root", () => {
  // Regression test: fs.existsSync() follows symlinks and returns false
  // for a dangling one (target doesn't exist), which previously made
  // resolveInsideRoot's `if (!fs.existsSync(current)) continue;` guard
  // skip validation entirely — silently accepting an escaping symlink as
  // long as its target didn't happen to exist yet.
  const repo = initGitRepo();
  const before = snapshotRepoState(repo);
  fs.symlinkSync("/nonexistent/outside/target", path.join(repo, "dangling-escape-link"));
  assert.throws(
    () => validateChanges(repo, before),
    (err) => err instanceof DiffSafetyError && err.code === "SYMLINK_ESCAPE",
  );
});

test("validateChanges accepts a dangling symlink whose target is inside the repo", () => {
  const repo = initGitRepo();
  const before = snapshotRepoState(repo);
  // Target doesn't exist yet, but resolves inside the repo root — not an
  // escape, just a forward-reference. Should not be rejected.
  fs.symlinkSync("not-created-yet.txt", path.join(repo, "dangling-internal-link"));
  const result = validateChanges(repo, before);
  assert.deepEqual(result.changedFiles, ["dangling-internal-link"]);
});

test("validateChanges rejects an oversized file", () => {
  const repo = initGitRepo();
  const before = snapshotRepoState(repo);
  fs.writeFileSync(path.join(repo, "huge.txt"), Buffer.alloc(3 * 1024 * 1024, "x"));
  assert.throws(
    () => validateChanges(repo, before),
    (err) => err instanceof DiffSafetyError && err.code === "OVERSIZED_FILE",
  );
});

test("validateChanges rejects a binary file", () => {
  const repo = initGitRepo();
  const before = snapshotRepoState(repo);
  fs.writeFileSync(path.join(repo, "binary.dat"), Buffer.from([0, 1, 2, 0, 3]));
  assert.throws(
    () => validateChanges(repo, before),
    (err) => err instanceof DiffSafetyError && err.code === "BINARY_FILE",
  );
});

test("validateChanges rejects a stale snapshot when HEAD moved concurrently", () => {
  const repo = initGitRepo();
  const before = snapshotRepoState(repo);
  fs.writeFileSync(path.join(repo, "new-file.txt"), "hello\n");
  git(repo, ["commit", "--allow-empty", "-q", "-m", "concurrent commit"]);
  assert.throws(
    () => validateChanges(repo, before),
    (err) => err instanceof DiffSafetyError && err.code === "STALE_HEAD",
  );
});
