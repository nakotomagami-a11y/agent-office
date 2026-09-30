/**
 * The permission bridge is spawned BY PATH at runtime. When that path is wrong
 * nothing throws — the CLI just gets an MCP server that never answers, and
 * every prompt denies with no visible cause. That shipped: `scripts/` was
 * absent from the packaged bundle while `next dev` resolved it fine, so no
 * gate caught it.
 *
 * The dev-tree checks below would ALL have passed on the broken commit — the
 * bug was bundle-only. Hence the packaging contract test, which is the one
 * that fails if the copy step is deleted.
 */
import assert from "node:assert";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { PERMISSION_SERVER_PATH } from "./summon";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "..");

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
      join("/nonexistent-bundle-root", "scripts"),
      "the launcher-supplied bundle root must win over the dev-only module hops",
    );
  } finally {
    if (prev === undefined) delete process.env.AO_BUNDLE_ROOT;
    else process.env.AO_BUNDLE_ROOT = prev;
  }
});

test("the bundler is required to ship the bridge", () => {
  // The dev-tree assertions above hold on the broken commit too. This one does
  // not: delete the copy step from prepare-bundle and it fails.
  const prepareBundle = readFileSync(
    join(REPO_ROOT, "apps", "web", "scripts", "prepare-bundle.mjs"), "utf8",
  );
  const bridge = "mcp-permission-server.mjs";
  assert.ok(
    prepareBundle.includes(bridge),
    `prepare-bundle.mjs must name ${bridge} as a required artifact, or the packaged app ships without it`,
  );
  assert.match(
    prepareBundle, /REQUIRED_BUNDLE_SCRIPTS/,
    "the required-file list must stay a named manifest so this contract is checkable",
  );
});

test("a project secret cannot forge an AO_ variable", async () => {
  const src = readFileSync(
    join(REPO_ROOT, "packages", "domain", "src", "services", "execution", "runs", "spawn-env.ts"),
    "utf8",
  );
  assert.match(
    src, /startsWith\("AO_"\)\s*\)\s*continue/,
    "the secrets loop must skip AO_* — AO_BASE_URL redirects permission decisions and AO_BUNDLE_ROOT selects the bridge",
  );
});
