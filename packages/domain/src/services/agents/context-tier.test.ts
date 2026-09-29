/**
 * `phase` existed in the type from the start and every segment was hardcoded
 * "always" — the model knew context should be tiered and the assembler ignored
 * it. These lock the tiering in.
 */
import assert from "node:assert";
import { test } from "node:test";
import { tierBody, INLINE_MAX_CHARS } from "./context-tier";
import { composeAppendedPrompt } from "./agents";

const opts = { path: "/tmp/x.md", label: "Agent memory", why: "you need prior context" };

test("small bodies are inlined verbatim", () => {
  const r = tierBody({ ...opts, body: "short note" });
  assert.equal(r.tier, "inline");
  assert.equal(r.text, "short note");
  assert.equal(r.saved, 0);
});

test("large bodies become a pointer that costs a fraction", () => {
  const body = "x".repeat(INLINE_MAX_CHARS + 5000);
  const r = tierBody({ ...opts, body });
  assert.equal(r.tier, "pointer");
  assert.ok(r.chars < 400, `pointer should be small, was ${r.chars}`);
  assert.ok(r.saved > 5000, "must report what it kept out of context");
  assert.ok(r.text.includes(opts.path), "a pointer with no path is just a missing section");
  assert.ok(r.text.includes(opts.why), "must say when reading it is worth a turn");
});

test("empty bodies contribute nothing", () => {
  assert.equal(tierBody({ ...opts, body: "   " }).chars, 0);
});

test("the boundary is inclusive", () => {
  assert.equal(tierBody({ ...opts, body: "x".repeat(INLINE_MAX_CHARS) }).tier, "inline");
  assert.equal(tierBody({ ...opts, body: "x".repeat(INLINE_MAX_CHARS + 1) }).tier, "pointer");
});

test("assembled segments only use known phases", () => {
  for (const s of composeAppendedPrompt("developer", null)) {
    assert.ok(
      s.phase === "always" || s.phase === "first-turn" || s.phase === "on-demand",
      `segment ${s.key} has phase ${s.phase}`,
    );
  }
});

test("an on-demand segment never carries a full body", () => {
  for (const s of composeAppendedPrompt("developer", null)) {
    if (s.phase === "on-demand") {
      assert.ok(s.text.length < 600, `${s.key} is on-demand but ${s.text.length} chars — that is not a pointer`);
    }
  }
});
