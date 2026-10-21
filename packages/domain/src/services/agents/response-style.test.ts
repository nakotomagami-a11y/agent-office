import assert from "node:assert";
import { test } from "node:test";
import { buildAppendedPrompt, composeAppendedPrompt } from "./agents";
import { withProjectsConfig } from "../settings";
import { RESPONSE_STYLE } from "../../config/response-style";
import type { AppSettings } from "../../types/index";

test("every agent gets the response style, with no setting to turn it on", () => {
  for (const agent of ["developer", "qa-code-review", "an-agent-that-does-not-exist"]) {
    const seg = composeAppendedPrompt(agent, null).find((s) => s.key === "response-style");
    assert.equal(seg?.body, RESPONSE_STYLE, agent);
    assert.ok(buildAppendedPrompt(agent, null).includes(RESPONSE_STYLE), agent);
  }
});

test("the response style is built in, so Context & Cost shows it as not trimmable", () => {
  const seg = composeAppendedPrompt("developer", null).find((s) => s.key === "response-style");
  assert.equal(seg?.locked, true);
  assert.equal(seg?.phase, "always");
});

test("saving the projects root keeps integrations and feature flags", () => {
  const current: AppSettings = {
    projectsRoot: "/old",
    excluded: ["a"],
    firstRunComplete: false,
    features: { multiInstance: true },
    integrations: { "iso-view": true },
  };
  const next = withProjectsConfig(current, { projectsRoot: " /new ", excluded: [] });
  assert.deepEqual(next, { ...current, projectsRoot: "/new", excluded: [], firstRunComplete: true });
  assert.deepEqual(withProjectsConfig(null, { projectsRoot: "/r", excluded: [] }), {
    projectsRoot: "/r",
    excluded: [],
    firstRunComplete: true,
  });
});
