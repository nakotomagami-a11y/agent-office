/**
 * An agent with no `permission-mode` used to load into the editor as
 * `bypassPermissions` — the most permissive mode — so merely opening and
 * saving it PERSISTED bypass on an agent that never asked for it. Unset must
 * round-trip as unset-equivalent, never as an escalation.
 */
import assert from "node:assert";
import { test } from "node:test";
import type { ApiAgent } from "@agent-office/domain/types";
import { fromApi } from "./agent-form";

const agent = (over: Partial<ApiAgent> = {}) =>
  ({ name: "a", description: "", skills: [], tools: [], ...over }) as ApiAgent;

test("an agent with no permission-mode does not load as bypassPermissions", () => {
  const v = fromApi(agent({ permissionMode: undefined }), "");
  assert.notEqual(v.pm, "bypassPermissions", "opening and saving would escalate this agent to full bypass");
  assert.equal(v.pm, "default");
});

test("an explicit mode is preserved verbatim", () => {
  for (const m of ["bypassPermissions", "plan", "acceptEdits"]) {
    assert.equal(fromApi(agent({ permissionMode: m }), "").pm, m);
  }
});
