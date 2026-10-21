/**
 * Guarded deletes compared paths with `startsWith(root + "/")`. On Windows that
 * refused every real path (project folders, GitHub account folders holding a
 * token), and a `~/` root expanded to mixed separators that matched nothing.
 * `path.win32` / `path.posix` are pinned so every case runs on every OS.
 *
 *   pnpm --filter @agent-office/domain test src/services/infra/paths.inside.test.ts
 */
import assert from "node:assert";
import { test } from "node:test";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, posix, win32 } from "node:path";
import { expandTilde, isInside, pathKey, samePath } from "./paths";

test("win32: a child is inside its parent whatever the separators and case", () => {
  const root = "C:\\Users\\me\\Documents";
  assert.equal(isInside("C:\\Users\\me\\Documents\\proj", root, win32), true);
  assert.equal(isInside("C:\\Users\\me/Documents/proj", root, win32), true, "mixed separators, as `~/` produced");
  assert.equal(isInside("c:\\users\\ME\\documents\\proj", root, win32), true, "Windows paths are case-insensitive");
  assert.equal(isInside("C:\\Users\\me\\Documents\\..foo", root, win32), true, "a name starting with .. is still a child");
});

test("win32: the root itself, siblings, traversal and other drives are not inside", () => {
  const root = "C:\\Users\\me\\Documents";
  assert.equal(isInside(root, root, win32), false);
  assert.equal(isInside("C:\\Users\\me\\Documents\\", root, win32), false, "trailing separator is still the root");
  assert.equal(isInside("C:\\Users\\me\\Documents2\\proj", root, win32), false, "a shared prefix is not containment");
  assert.equal(isInside("C:\\Users\\me\\Documents\\..\\Secrets", root, win32), false);
  assert.equal(isInside("D:\\Users\\me\\Documents\\proj", root, win32), false);
});

test("posix: containment is case-sensitive", () => {
  assert.equal(isInside("/home/me/docs/proj", "/home/me/docs", posix), true);
  assert.equal(isInside("/home/me/Docs/proj", "/home/me/docs", posix), false);
  assert.equal(isInside("/home/me/docs-old/proj", "/home/me/docs", posix), false);
  assert.equal(isInside("/home/me/docs", "/home/me/docs", posix), false);
});

test("samePath ignores separators, trailing slashes and, on Windows only, case", () => {
  assert.equal(samePath("C:\\Users\\me\\Docs\\", "c:/users/me/docs", win32), true);
  assert.equal(samePath("/home/me/docs/", "/home/me/docs", posix), true);
  assert.equal(samePath("/home/me/Docs", "/home/me/docs", posix), false);
});

test("expandTilde: `~`, `~/` and `~\\` on Windows, all with native separators", () => {
  const home = "C:\\Users\\me";
  assert.equal(expandTilde("~", home, win32), home);
  assert.equal(expandTilde("~/Documents/x", home, win32), "C:\\Users\\me\\Documents\\x");
  assert.equal(expandTilde("~\\Documents", home, win32), "C:\\Users\\me\\Documents", "`~\\` once scanned nothing");
  assert.equal(expandTilde("~other\\x", home, win32), "~other\\x", "another user's ~ is left alone");
  assert.equal(expandTilde("D:\\x", home, win32), "D:\\x");
});

test("expandTilde on POSIX: `~/` only; a backslash is part of a file name there", () => {
  assert.equal(expandTilde("~/Documents", "/home/me", posix), "/home/me/Documents");
  assert.equal(expandTilde("~", "/home/me", posix), "/home/me");
  assert.equal(expandTilde("~\\x", "/home/me", posix), "~\\x");
});

// A junction needs no admin rights on Windows; elsewhere the type is ignored and it is a plain symlink.
test("on disk, a path is judged by where it leads: a link out of the root is not inside it", () => {
  const base = mkdtempSync(join(tmpdir(), "ao-pathkey-"));
  const root = join(base, "root");
  const outside = join(base, "outside");
  mkdirSync(root);
  mkdirSync(outside);
  symlinkSync(outside, join(root, "link"), "junction");

  assert.equal(isInside(join(root, "link"), root), false, "a guarded delete would follow it out of the root");
  assert.equal(isInside(join(root, "link", "deeper"), root), false);
  assert.equal(samePath(join(root, "link"), outside), true);
  assert.equal(isInside(join(root, "not-yet", "child"), root), true, "a missing path still sits inside its parent");
  assert.equal(pathKey(join(root, "not-yet")), join(pathKey(root), "not-yet"));
  assert.equal(isInside(join(root, "link"), root, undefined, "lexical"), true, "lexical judges the spelling only");
  rmSync(base, { recursive: true, force: true });
});
