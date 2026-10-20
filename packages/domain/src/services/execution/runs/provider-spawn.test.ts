/**
 * The spawn's cost rules per provider: a cap on openai is accepted only when every mapped model has
 * a catalog price (the gateway then enforces it), Claude model ids become tier aliases on the
 * gateway providers, and a run's cost says what it is. No `claude` is spawned.
 *
 *   pnpm --filter @agent-office/domain test src/services/execution/runs/provider-spawn.test.ts
 */
import assert from "node:assert";
import { test } from "node:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const sandbox = mkdtempSync(join(tmpdir(), "ao-provider-spawn-"));
process.env.HOME = sandbox;
process.env.USERPROFILE = sandbox;

const { prepareProviderSpawn, releaseProviderSpawn, runCost, settleRunCost } = await import("./provider-spawn");
const store = await import("../../providers/store");
const { chargeGatewayRun, gatewaySpend, reserveGatewayRun } = await import("../../providers/gateway-tokens");
const { forgetPriceCatalog, PRICE_FETCH_ENABLED_KEY } = await import("../../providers/prices/catalog");
const { PRICE_CATALOG_FILE } = await import("../../infra/paths");
const { setUiSetting } = await import("../../db/ui-settings");

const price = { provider: "openai", inputPerMTok: 1, outputPerMTok: 2 };
mkdirSync(dirname(PRICE_CATALOG_FILE), { recursive: true });
writeFileSync(PRICE_CATALOG_FILE, JSON.stringify({ source: "litellm", fetchedAt: Date.now(), entries: { "gpt-a": price, "gpt-b": price } }));
forgetPriceCatalog();
store.saveProviderConfig("openai", { apiKey: "sk-proj-spawn-test-000000000000", models: { haiku: "gpt-a", sonnet: "gpt-a", opus: "gpt-b" } });
store.setSelection("openai", "chosen");

const spawn = (owner: string, args: string[]) =>
  prepareProviderSpawn(owner, { agentId: "t", agentName: "T", prompt: "p", model: "m", effort: "e", args, stdin: "p" });

test("openai: a cap is enforced by the gateway when every mapped model is priced; the CLI never sees it", () => {
  const plan = spawn("cap-ok", ["-p", "--max-budget-usd", "1.5", "--", "--max-budget-usd"]);
  assert.ok(plan.ok);
  assert.deepStrictEqual(plan.args.slice(2), ["-p", "--", "--max-budget-usd"], "the prompt after -- is left alone");
  assert.equal(gatewaySpend("cap-ok")?.budgetUsd, 1.5);
  releaseProviderSpawn("cap-ok", plan.pinFile);
});

test("openai: a cap with an unpriced mapped model, fetching off, or a junk value is refused", () => {
  store.saveProviderConfig("openai", { models: { opus: "gpt-unpriced" } });
  assert.deepStrictEqual(spawn("cap-unpriced", ["-p", "--max-budget-usd", "1"]), { ok: false, provider: "openai", reason: "budget_unenforceable" });
  store.saveProviderConfig("openai", { models: { opus: "gpt-b" } });
  setUiSetting(PRICE_FETCH_ENABLED_KEY, "false");
  assert.equal(spawn("cap-off", ["-p", "--max-budget-usd", "1"]).ok, false);
  setUiSetting(PRICE_FETCH_ENABLED_KEY, "true");
  assert.equal(spawn("cap-junk", ["-p", "--max-budget-usd", "lots"]).ok, false);
});

test("gateway providers: a Claude model id becomes its tier alias, fable runs as opus", () => {
  for (const [model, tier] of [["claude-fable-5", "opus"], ["claude-sonnet-4-6", "sonnet"], ["haiku", "haiku"], ["mystery", "mystery"]]) {
    const plan = spawn(`tier-${model}`, ["-p", "--model", model!, "--", "--model"]);
    assert.ok(plan.ok);
    assert.deepStrictEqual(plan.args.slice(2), ["-p", "--model", tier, "--", "--model"], model);
    releaseProviderSpawn(`tier-${model}`, plan.pinFile);
  }
  store.saveProviderConfig("anthropic_api", { apiKey: "sk-ant-api03-spawn-test-00000000" });
  for (const provider of ["subscription", "anthropic_api"] as const) {
    store.setSelection(provider, "chosen");
    const plan = spawn(`claude-${provider}`, ["-p", "--model", "claude-fable-5", "--max-budget-usd", "1"]);
    assert.ok(plan.ok, provider);
    assert.deepStrictEqual(plan.args.slice(2), ["-p", "--model", "claude-fable-5", "--max-budget-usd", "1"], `${provider}: the CLI keeps the exact id and enforces the cap itself`);
    assert.equal(gatewaySpend(`claude-${provider}`)?.budgetUsd, undefined);
    releaseProviderSpawn(`claude-${provider}`, plan.pinFile);
  }
  store.setSelection("openai", "chosen");
});

test("a run's cost: the CLI's for Claude models, the gateway's estimate for openai, 0 when unknown or free", () => {
  assert.deepStrictEqual(runCost("x", "subscription", 0.5), { cost: 0.5, costBasis: "notional" });
  assert.deepStrictEqual(runCost("x", "anthropic_api", 0.5), { cost: 0.5, costBasis: "billed" });
  assert.deepStrictEqual(runCost("x", "local", 0.5), { cost: 0, costBasis: "free" });
  const plan = spawn("cost", ["-p"]);
  assert.ok(plan.ok);
  chargeGatewayRun("cost", 0.25);
  chargeGatewayRun("cost", 0.5);
  assert.deepStrictEqual(runCost("cost", "openai", 9), { cost: 0.75, costBasis: "estimated" });
  chargeGatewayRun("cost", null);
  assert.deepStrictEqual(runCost("cost", "openai", 9), { cost: 0, costBasis: "unknown" });
  releaseProviderSpawn("cost", plan.pinFile);
  assert.deepStrictEqual(runCost("cost", "openai", 9), { cost: 0, costBasis: "unknown" }, "no token: nothing to vouch for");
});

test("at run end a call still in flight (cut by Stop) counts at its held worst case", () => {
  const plan = spawn("stop-held", ["-p"]);
  assert.ok(plan.ok);
  chargeGatewayRun("stop-held", 0.1);
  reserveGatewayRun("stop-held", 0.4);
  assert.deepStrictEqual(runCost("stop-held", "openai", 0), { cost: 0.1, costBasis: "estimated" }, "live figure: real spend only");
  assert.deepStrictEqual(settleRunCost("stop-held", "openai", 0), { cost: 0.5, costBasis: "estimated" });
  assert.equal(gatewaySpend("stop-held")?.reservedUsd, 0);
  releaseProviderSpawn("stop-held", plan.pinFile);
});
