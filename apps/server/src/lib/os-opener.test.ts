import assert from "node:assert";
import { test } from "node:test";
import { isOpenablePath, launchDetached, openCommand, windowsCodeExe } from "./os-opener";

const has = (...files: string[]) => (p: string) => files.includes(p);

// B17: every platform spawned `xdg-open`, and `code` (code.cmd on Windows) without a shell.
test("each platform opens a folder with its own file manager", () => {
  assert.deepEqual(openCommand("folder", "C:\\p", "win32", { SystemRoot: "C:\\Windows" }),
    { cmd: "C:\\Windows\\explorer.exe", args: ["C:\\p"], checkExit: false });
  assert.deepEqual(openCommand("folder", "/p", "darwin", {}), { cmd: "/usr/bin/open", args: ["/p"], checkExit: true });
  assert.deepEqual(openCommand("folder", "/p", "linux", { PATH: "/usr/bin" }, has("/usr/bin/xdg-open")),
    { cmd: "/usr/bin/xdg-open", args: ["/p"], checkExit: true });
});

test("Linux launchers come from absolute PATH entries only, and a missing one is reported", () => {
  const env = { PATH: "bin:/usr/local/bin" };
  assert.deepEqual(openCommand("code", "/p", "linux", env, has("bin/code", "/usr/local/bin/code")),
    { cmd: "/usr/local/bin/code", args: ["/p"], checkExit: true });
  assert.equal(openCommand("folder", "/p", "linux", env, has("bin/xdg-open")), null, "a repo's own bin/ never runs");
});

test("VS Code on Windows is Code.exe beside the code.cmd on PATH, never the .cmd", () => {
  const env = { PATH: "C:\\Windows;C:\\VS\\bin;relative\\bin" };
  const files = has("C:\\VS\\bin\\code.cmd", "C:\\VS\\Code.exe", "relative\\bin\\code.cmd");
  assert.equal(windowsCodeExe(env, files), "C:\\VS\\Code.exe");
  assert.deepEqual(openCommand("code", "C:\\p", "win32", env, files), { cmd: "C:\\VS\\Code.exe", args: ["C:\\p"], checkExit: false });
});

test("VS Code on Windows falls back to the default user install, and reports none when absent", () => {
  const exe = "C:\\Users\\u\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe";
  assert.equal(windowsCodeExe({ PATH: "", LOCALAPPDATA: "C:\\Users\\u\\AppData\\Local" }, has(exe)), exe);
  assert.equal(openCommand("code", "C:\\p", "win32", { PATH: "" }, () => false), null);
});

test("macOS: VS Code needs no `code` command, and a bundle folder is revealed, never launched", () => {
  assert.deepEqual(openCommand("code", "/p", "darwin", {}), { cmd: "/usr/bin/open", args: ["-a", "Visual Studio Code", "/p"], checkExit: true });
  assert.deepEqual(openCommand("folder", "/p/Evil.app", "darwin", {}, has("/p/Evil.app/Contents/Info.plist"))?.args, ["-R", "/p/Evil.app"]);
  assert.deepEqual(openCommand("folder", "/code/next.js", "darwin", {}, () => false)?.args, ["/code/next.js"], "a dotted folder still opens");
});

test("only a plain absolute path reaches a launcher, so it can never parse as an option or switch", () => {
  assert.ok(isOpenablePath("C:\\work\\p", "win32"));
  assert.ok(isOpenablePath("C:/work/p", "win32"));
  for (const bad of ["/select,C:\\x", "C:\\a,b", "C:\\a\"b", "\\\\host\\share", "\\\\?\\C:\\p", "-a", "work\\p", "C:p"]) {
    assert.ok(!isOpenablePath(bad, "win32"), bad);
  }
  assert.ok(isOpenablePath("/home/p", "linux"));
  assert.ok(!isOpenablePath("--inspect", "linux"));
});

test("a missing launcher is a failed result, not an uncaught 'error' event", async () => {
  const r = await launchDetached({ cmd: "ao-no-such-launcher-xyz", args: [], checkExit: true });
  assert.equal(r.ok, false);
});

test("a launcher's non-zero exit fails only when its exit code means something", async () => {
  const fail = { cmd: process.execPath, args: ["-e", "process.exit(3)"] };
  assert.equal((await launchDetached({ ...fail, checkExit: true })).ok, false);
  assert.equal((await launchDetached({ ...fail, checkExit: false })).ok, true);
  assert.equal((await launchDetached({ cmd: process.execPath, args: ["-e", ""], checkExit: true })).ok, true);
});
