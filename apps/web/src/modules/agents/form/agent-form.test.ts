/**
 * An agent with no `permission-mode` used to load into the editor as
 * `bypassPermissions` — the most permissive mode — so merely opening and
 * saving it PERSISTED bypass on an agent that never asked for it. Unset must
 * round-trip as unset-equivalent, never as an escalation.
 */
import assert from "node:assert";
import { test } from "node:test";
import type { ApiAgent } from "@agent-office/domain/types";
import { fromApi, toBody } from "./agent-form";

const agent = (over: Partial<ApiAgent> = {}) =>
  ({ id: "a", name: "a", description: "", skills: [], tools: [], ...over }) as ApiAgent;

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

test("saving an edit goes to the agent's own file, whatever its frontmatter name or display name", () => {
  // `name` used to be the id, so `qa_bot.md` saying `name: Reviewer` was written to `reviewer.md`.
  const v = fromApi(agent({ id: "qa_bot", name: "Reviewer", displayName: "Code Reviewer" }), "body");
  assert.equal(toBody(v).id, "qa_bot");
  assert.equal(toBody({ ...v, name: "Renamed" }).id, "qa_bot");
});

test("a new agent's id is still slugged from what was typed", () => {
  assert.equal(toBody({ ...fromApi(agent(), "b"), fileId: undefined, id: "", name: "My Agent" }).id, "my-agent");
});
