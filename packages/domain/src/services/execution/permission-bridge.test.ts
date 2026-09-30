/**
 * The permission bridge is spawned BY PATH at runtime. When that path is wrong
 * nothing throws — the CLI just gets an MCP server that never answers, and
 * every prompt denies with no visible cause. That shipped: `scripts/` was
 * absent from the packaged bundle while `next dev` resolved it fine.
 *
 * SCOPE NOTE, because the first version of this file lied about it: everything
 * here is a DEV-TREE check and would have passed on the broken commit. The
 * bug was bundle-only, so the real gate is `apps/web/scripts/verify-bundle.mjs`
 * running in CI against the built artifact. A unit test in this package cannot
 * express a packaging contract.
 */
import assert from "node:assert";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { PERMISSION_SERVER_PATH } from "./summon";
import { isReservedEnvName } from "./runs/spawn-env";

test("the bridge the summon path points at exists in the dev tree", () => {
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
      join("/nonexistent-bundle-root", "scripts"),
      "the launcher-supplied bundle root must win over the dev-only module hops",
    );
  } finally {
    if (prev === undefined) delete process.env.AO_BUNDLE_ROOT;
    else process.env.AO_BUNDLE_ROOT = prev;
  }
});

test("AO_ is a reserved env namespace, case-insensitively", () => {
  for (const name of ["AO_BASE_URL", "AO_RUN_ID", "AO_BUNDLE_ROOT", "ao_base_url", "Ao_Bundle_Root"]) {
    assert.equal(isReservedEnvName(name), true, `${name} must not be settable by a project secret`);
  }
  for (const name of ["OPENAI_API_KEY", "AWS_SECRET", "A", "AONE", "GITHUB_TOKEN"]) {
    assert.equal(isReservedEnvName(name), false, `${name} is a legitimate secret name`);
  }
});
