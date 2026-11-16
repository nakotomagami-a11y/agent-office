/**
 * The projects root may be any local folder on any drive (D:\Lab), but not a network path, a relative path,
 * a drive root, a folder holding the user's home, or a file.
 *
 *   pnpm --filter @agent-office/domain test src/services/settings.test.ts
 */
import assert from "node:assert";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, parse } from "node:path";
import { test } from "node:test";
import { HOME } from "./infra/paths";
import { projectsRootProblem } from "./settings";

const win = process.platform === "win32";

test("a local folder outside home is fine, and so is one that doesn't exist yet", () => {
  const dir = mkdtempSync(join(tmpdir(), "ao-root-ok-"));
  try {
    assert.equal(projectsRootProblem(dir), null);
    assert.equal(projectsRootProblem(`  ${dir}  `), null, "padding is trimmed");
    assert.equal(projectsRootProblem(join(dir, "not-yet")), null);
    assert.equal(projectsRootProblem("~"), null, "home itself");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("each refused root gets its own code", () => {
  assert.equal(projectsRootProblem(parse(HOME).root), "root_is_drive_root");
  assert.equal(projectsRootProblem("Lab"), "root_not_absolute");
  assert.equal(projectsRootProblem(dirname(HOME)), "root_contains_home");
  const dir = mkdtempSync(join(tmpdir(), "ao-root-file-"));
  try {
    const file = join(dir, "notes.txt");
    writeFileSync(file, "");
    assert.equal(projectsRootProblem(file), "root_not_a_directory");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("Windows: network and device paths, drive-relative paths and missing drives are refused", { skip: !win }, () => {
  assert.equal(projectsRootProblem("\\\\server\\share\\Lab"), "root_not_local");
  assert.equal(projectsRootProblem("\\\\?\\C:\\Lab"), "root_not_local");
  assert.equal(projectsRootProblem("//server/share"), "root_not_local");
  assert.equal(projectsRootProblem("D:Lab"), "root_not_absolute");
  assert.equal(projectsRootProblem("\\Lab"), "root_not_absolute", "root-relative: depends on the current drive");
  assert.equal(projectsRootProblem("D:\\"), "root_is_drive_root");
  const unused = "QRSTUVWXYZ".split("").find((l) => !existsSync(`${l}:\\`));
  if (unused) assert.equal(projectsRootProblem(`${unused}:\\Lab`), "root_drive_missing");
});
