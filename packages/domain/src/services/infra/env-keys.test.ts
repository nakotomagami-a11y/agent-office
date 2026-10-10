import assert from "node:assert";
import { test } from "node:test";
import { deleteEnvKeys, GH_TOKEN_VARS } from "./env-keys";

test("removes a variable whatever case it was inherited in (Windows reads env case-insensitively)", () => {
  const env: NodeJS.ProcessEnv = { Gh_Token: "a", GITHUB_TOKEN: "b", gh_repo: "o/r", GH_CONFIG_DIR: "/keep", Path: "/keep" };
  deleteEnvKeys(env, [...GH_TOKEN_VARS, "GH_REPO"]);
  assert.deepStrictEqual(env, { GH_CONFIG_DIR: "/keep", Path: "/keep" });
});
