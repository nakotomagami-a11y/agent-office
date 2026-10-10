import assert from "node:assert";
import { test } from "node:test";
import { absoluteSearchPath } from "./search-path";

test("Windows: %VAR% entries are expanded, relative ones dropped", () => {
  const env = { USERPROFILE: "C:\\Users\\me", SystemRoot: "C:\\Windows" };
  const raw = [
    "%USERPROFILE%\\AppData\\Local\\Microsoft\\WindowsApps",
    "%NOT_SET%\\bin",
    "C:\\Program Files\\nodejs",
    "\"C:\\Program Files\\GitHub CLI\"",
    ".",
    "tools",
    "\\rooted",
    "C:relative",
    "\\\\server\\share\\bin",
    "%systemroot%\\system32",
  ].join(";");
  assert.deepStrictEqual(absoluteSearchPath(raw, "win32", env).split(";"), [
    "C:\\Users\\me\\AppData\\Local\\Microsoft\\WindowsApps",
    "C:\\Program Files\\nodejs",
    "C:\\Program Files\\GitHub CLI",
    "\\\\server\\share\\bin",
    "C:\\Windows\\system32",
  ]);
});

test("POSIX: empty and relative entries (both mean 'the cwd') are dropped", () => {
  assert.strictEqual(absoluteSearchPath("/usr/bin::./bin:node_modules/.bin:/opt/x", "linux"), "/usr/bin:/opt/x");
});

test("a variable whose value holds several entries is split again and filtered", () => {
  const env = { EVIL: "C:/ok;relative/dir", HOME: "/home/me" };
  assert.strictEqual(absoluteSearchPath("%EVIL%;//server/share/bin", "win32", env), "C:/ok;//server/share/bin");
});

test("POSIX: a leading ~ is expanded the way bash does, not dropped", () => {
  assert.strictEqual(absoluteSearchPath("~/bin:~:~other/bin:/usr/bin", "linux", { HOME: "/home/me" }), "/home/me/bin:/home/me:/usr/bin");
});
