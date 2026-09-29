/**
 * The permission bridge is spawned BY PATH at runtime. When that path is wrong
 * nothing throws — the CLI just gets an MCP server that never answers, and
 * every prompt denies with no visible cause. That shipped: `scripts/` was
 * absent from the packaged bundle while `next dev` resolved it fine, so no
 * gate caught it. These tests assert the path is real and the failure is loud.
 */
import assert from "node:assert";
import { existsSync } from "node:fs";
import { test } from "node:test";
import { PERMISSION_SERVER_PATH } from "./summon";

test("the bridge the summon path points at actually exists", () => {
  assert.ok(
    existsSync(PERMISSION_SERVER_PATH),
    `permission bridge absent at ${PERMISSION_SERVER_PATH} — every prompt would silently deny`,
  );
});

test("AO_BUNDLE_ROOT overrides module-relative resolution", async () => {
  const prev = process.env.AO_BUNDLE_ROOT;
  process.env.AO_BUNDLE_ROOT = "/nonexistent-bundle-root";
  try {
    // Fresh module instance: the constant is resolved at import time.
    const mod = await import(`../infra/paths?bundle-root-test=${Date.now()}`);
    assert.equal(
      mod.REPO_SCRIPTS_DIR,
      "/nonexistent-bundle-root/scripts",
      "the launcher-supplied bundle root must win over the dev-only module hops",
    );
  } finally {
    if (prev === undefined) delete process.env.AO_BUNDLE_ROOT;
    else process.env.AO_BUNDLE_ROOT = prev;
  }
});
