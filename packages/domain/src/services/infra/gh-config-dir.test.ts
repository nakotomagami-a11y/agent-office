import assert from "node:assert";
import { test } from "node:test";
import { join } from "node:path";
import { ghConfigDir } from "./paths";

const home = join("h", "me");

test("GH_CONFIG_DIR wins over everything", () => {
  const env = { GH_CONFIG_DIR: "explicit", XDG_CONFIG_HOME: "xdg", APPDATA: "appdata" };
  assert.strictEqual(ghConfigDir(env, "win32", home), "explicit");
});

test("XDG_CONFIG_HOME beats APPDATA", () => {
  assert.strictEqual(ghConfigDir({ XDG_CONFIG_HOME: "xdg", APPDATA: "appdata" }, "win32", home), join("xdg", "gh"));
});

test("Windows uses %APPDATA%\\GitHub CLI, not ~/.config/gh", () => {
  assert.strictEqual(ghConfigDir({ APPDATA: "appdata" }, "win32", home), join("appdata", "GitHub CLI"));
});

test("APPDATA is ignored off Windows; empty values fall through", () => {
  const fallback = join(home, ".config", "gh");
  assert.strictEqual(ghConfigDir({ APPDATA: "appdata" }, "linux", home), fallback);
  assert.strictEqual(ghConfigDir({ APPDATA: "appdata" }, "darwin", home), fallback);
  assert.strictEqual(ghConfigDir({ GH_CONFIG_DIR: "", XDG_CONFIG_HOME: "" }, "win32", home), fallback);
});
