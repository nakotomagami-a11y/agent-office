/**
 * `permission-mode` reaches `--permission-mode` verbatim, and frontmatter is
 * hand-edited — it bypasses every zod schema on the API.
 *
 * `default` was never a real CLI value — `docs/03-agents.md` invented it, and
 * `agent-architect`'s template propagated it into every agent that tool writes.
 * (Checked before claiming worse: that template lives in the BODY, so no
 * frontmatter ever carried it and nothing malformed reached the CLI.)
 */
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { PERMISSION_MODE_OPTS } from "./agent-opts";
import { asPermissionMode } from "../services/agents/agents";

const REPO = resolve(import.meta.dirname, "../../../..");

test("every real mode round-trips", () => {
  for (const m of PERMISSION_MODE_OPTS) assert.equal(asPermissionMode(m), m);
});

test("a pasted option list is rejected, not forwarded", () => {
  assert.equal(asPermissionMode("default|plan|bypassPermissions"), undefined);
});

test("invented and malformed values are dropped, never passed through", () => {
  for (const bad of ["default", "", "BYPASSPERMISSIONS", "--dangerously-skip", 42, null]) {
    assert.equal(asPermissionMode(bad), undefined, `${String(bad)} must not reach --permission-mode`);
  }
});

test("YAML whitespace is tolerated, not rejected", () => {
  // asString trims, so a trailing space in frontmatter is a formatting
  // accident rather than an invalid mode.
  assert.equal(asPermissionMode("plan "), "plan");
});

test("the docs table lists exactly the real modes", () => {
  const doc = readFileSync(join(REPO, "docs", "03-agents.md"), "utf8");
  const section = doc.slice(doc.indexOf("### permission-mode values"));
  for (const m of PERMISSION_MODE_OPTS) {
    assert.ok(section.includes(`\`${m}\``), `docs/03-agents.md omits the real mode ${m}`);
  }
  assert.ok(
    !/^\| `default` \|/m.test(section),
    "docs/03-agents.md still documents `default`, which is not a CLI value — that table is what produced the malformed agent file",
  );
});
