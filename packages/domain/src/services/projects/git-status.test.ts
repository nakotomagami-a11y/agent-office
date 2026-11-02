import assert from "node:assert";
import { test } from "node:test";
import { execSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readGitStatus } from "./git-status";

test("a fresh `git init` with no commits counts as a git repo", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ao-git-status-"));
  try {
    execSync("git init -q -b main", { cwd: dir });
    writeFileSync(join(dir, "a.txt"), "hi\n");
    const st = await readGitStatus(dir);
    assert.equal(st.isGit, true);
    assert.equal(st.branch, "main");
    assert.equal(st.filesChanged, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a plain folder is not a git repo", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ao-git-status-"));
  try {
    assert.deepEqual(await readGitStatus(dir), { isGit: false, added: 0, removed: 0, filesChanged: 0, ahead: 0, behind: 0 });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
