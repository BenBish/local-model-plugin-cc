import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  resolveRepoRoot,
  repoId,
  NotAGitRepoError,
} from "../plugins/local-model/scripts/lib/repo-identity.mjs";
import { initGitRepo, mkTmpDir } from "./helpers.mjs";

test("resolveRepoRoot returns the real git top-level path", () => {
  const dir = initGitRepo();
  const root = resolveRepoRoot(dir);
  assert.equal(root, fs.realpathSync(dir));
});

test("resolveRepoRoot throws NotAGitRepoError outside a git repo", () => {
  const dir = mkTmpDir("not-a-repo-");
  assert.throws(() => resolveRepoRoot(dir), NotAGitRepoError);
});

test("repoId is stable for the same path and differs for different paths", () => {
  const a = initGitRepo();
  const b = initGitRepo();
  assert.equal(repoId(a), repoId(a));
  assert.notEqual(repoId(a), repoId(b));
});
