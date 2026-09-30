/**
 * `permission-mode` reaches `--permission-mode` verbatim, and frontmatter is
 * hand-edited — it bypasses every zod schema on the API.
 *
 * The mode list must be verified by EXECUTING the CLI, not by reading its help.
 * `claude --permission-mode default` exits 0, but the CLI's own error text for
 * an invalid mode lists "Allowed choices" WITHOUT `default`. Trusting that
 * string would have made this enum reject a working value that 250 stored
 * sessions use.
 */
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { PERMISSION_MODE_OPTS } from "../../config/agent-opts";
import { asPermissionMode } from "./agents";

const REPO = resolve(import.meta.dirname, "../../../../..");

test("every real mode round-trips", () => {
  for (const m of PERMISSION_MODE_OPTS) assert.equal(asPermissionMode(m), m);
});

test("a pasted option list is rejected, not forwarded", () => {
  assert.equal(asPermissionMode("default|plan|bypassPermissions"), undefined);
});

test("invented and malformed values are dropped, never passed through", () => {
  for (const bad of ["", "BYPASSPERMISSIONS", "--dangerously-skip", 42, null]) {
    assert.equal(asPermissionMode(bad), undefined, `${String(bad)} must not reach --permission-mode`);
  }
});

test("YAML whitespace is tolerated, not rejected", () => {
  // asString trims, so a trailing space in frontmatter is a formatting
  // accident rather than an invalid mode.
  assert.equal(asPermissionMode("plan "), "plan");
});

test("the docs table lists EXACTLY the real modes, both directions", () => {
  const doc = readFileSync(join(REPO, "docs", "03-agents.md"), "utf8");
  // Bound the slice: running to EOF let unrelated prose satisfy the check,
  // so dropping the `default` or `plan` row still passed.
  const start = doc.indexOf("### permission-mode values");
  const rest = doc.slice(start);
  const end = rest.indexOf("\n## ");
  const section = end === -1 ? rest : rest.slice(0, end);

  const rows = new Set(
    [...section.matchAll(/^\| `([^`]+)` \|/gm)].map((r) => r[1]!),
  );
  assert.deepEqual(
    [...rows].sort(),
    [...PERMISSION_MODE_OPTS].sort(),
    "docs/03-agents.md's table must match PERMISSION_MODE_OPTS exactly — no missing modes, no invented ones",
  );
});
