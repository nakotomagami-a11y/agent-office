/**
 * Both catalogs parse from fixtures trimmed from the real files (2026-10): openai and anthropic chat
 * models only, per-MTok, the highest tier, and an unknown pricing field makes a model unknown.
 *
 *   pnpm --filter @agent-office/domain test src/services/providers/prices/parse.test.ts
 */
import assert from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { parseLiteLlm, parseOpenRouter, perMTok } from "./parse";

const fixture = (name: string): unknown => JSON.parse(readFileSync(new URL(`./${name}.fixture.json`, import.meta.url), "utf8"));
const litellm = fixture("litellm") as Record<string, Record<string, unknown>>;

test("per-token prices become per-million in one place, without float noise", () => {
  assert.equal(perMTok(0.00000125), 1.25);
  assert.equal(perMTok(3e-7), 0.3);
  assert.equal(perMTok(1e-7 / 3), 0.033333);
  assert.equal(perMTok(0.0000075), 7.5);
});

test("LiteLLM: only bare openai/anthropic chat models are kept", () => {
  const table = parseLiteLlm(litellm);
  assert.deepStrictEqual(table.get("gpt-5"), { provider: "openai", inputPerMTok: 1.25, outputPerMTok: 10, cacheReadPerMTok: 0.125 });
  assert.deepStrictEqual(table.get("claude-opus-5-5")?.provider, "anthropic");
  for (const dropped of ["sample_spec", "text-embedding-3-small", "azure/gpt-4o", "gpt-4o-mini-tts", "ai21.j2-mid-v1"]) {
    assert.equal(table.has(dropped), false, dropped);
  }
});

test("LiteLLM: a tiered model is priced at its highest tier; service tiers are ignored", () => {
  assert.deepStrictEqual(parseLiteLlm(litellm).get("gpt-6-astra"), {
    provider: "openai", inputPerMTok: 20, outputPerMTok: 75, cacheReadPerMTok: 2, cacheWritePerMTok: 25,
  });
});

test("LiteLLM: a pricing field this code does not understand makes the model unknown, not cheaper", () => {
  assert.equal(parseLiteLlm(litellm).has("gpt-6-luna"), false);
  const odd = { "x-1": { litellm_provider: "openai", mode: "chat", input_cost_per_token: 1e-6, output_cost_per_token: 2e-6, output_cost_per_thought: 1 } };
  assert.equal(parseLiteLlm(odd).size, 0);
});

test("LiteLLM: one malformed entry drops only itself", () => {
  const table = parseLiteLlm({
    ...litellm,
    broken: "not an object",
    "gpt-neg": { litellm_provider: "openai", input_cost_per_token: -1, output_cost_per_token: 1e-6 },
    "gpt-nan": { litellm_provider: "openai", input_cost_per_token: "0.1", output_cost_per_token: 1e-6 },
    "gpt-zero": { litellm_provider: "openai", input_cost_per_token: 0, output_cost_per_token: 1e-6 },
  });
  assert.ok(table.has("gpt-5"));
  for (const bad of ["broken", "gpt-neg", "gpt-nan", "gpt-zero"]) assert.equal(table.has(bad), false, bad);
  assert.equal(parseLiteLlm(null).size, 0);
  assert.equal(parseLiteLlm([1, 2]).size, 0);
});

test("OpenRouter: provider/model ids map to the bare ids, at the highest override tier", () => {
  const table = parseOpenRouter(fixture("openrouter"));
  assert.deepStrictEqual([...table.keys()].sort(), ["claude-haiku-5-5", "claude-sonnet-4-5", "gpt-5"]);
  assert.deepStrictEqual(table.get("claude-sonnet-4-5"), {
    provider: "anthropic", inputPerMTok: 6, outputPerMTok: 22.5, cacheReadPerMTok: 0.6, cacheWritePerMTok: 7.5,
  });
  assert.deepStrictEqual(table.get("gpt-5"), { provider: "openai", inputPerMTok: 1.25, outputPerMTok: 10, cacheReadPerMTok: 0.125 });
});

test("OpenRouter: an unknown field, a bad tier or a bad number makes the model unknown", () => {
  const entry = (pricing: unknown) => parseOpenRouter({ data: [{ id: "openai/x", pricing }] }).size;
  assert.equal(entry({ prompt: "0.000001", completion: "0.000002" }), 1);
  assert.equal(entry({ prompt: "0.000001", completion: "0.000002", per_thought: "1" }), 0);
  assert.equal(entry({ prompt: "0.000001", completion: "0.000002", overrides: ["x"] }), 0);
  assert.equal(entry({ prompt: "free", completion: "0.000002" }), 0);
  assert.equal(entry({ prompt: "-1", completion: "-1" }), 0);
  assert.equal(parseOpenRouter({ data: "nope" }).size, 0);
});
