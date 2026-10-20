/**
 * A provider failure that has no copy renders as a blank card, which is worse than the failure.
 * Every code the server can name, and every word the setup screens use, must exist in en.json.
 */
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { wizardDraftSchema } from "@agent-office/api-contract";
import { RUN_ERROR_CODES } from "@agent-office/domain/config/run-errors";
import { MODEL_TIERS, PROVIDERS, PROVIDER_STATUS_REASONS } from "@agent-office/domain/config/providers";
import { z } from "zod";

const text = z.string().min(1);
const pair = z.object({ title: text, body: text });
const messages = z
  .object({
    errors: z.object({
      provider: z.record(z.string(), pair),
      run: z.record(z.string(), z.record(z.string(), z.string())),
    }),
    providers: z.record(z.string(), z.string()),
    first_run: z.record(z.string(), z.string()),
    settings_nav: z.record(z.string(), z.string()),
  })
  .parse(JSON.parse(readFileSync(join(process.cwd(), "messages", "en.json"), "utf8")));

test("every status reason has a title and a body", () => {
  for (const reason of PROVIDER_STATUS_REASONS) assert.ok(messages.errors.provider[reason], `errors.provider.${reason}`);
  assert.deepEqual(Object.keys(messages.errors.provider).sort(), [...PROVIDER_STATUS_REASONS].sort(), "a stale reason has copy but no code");
});

test("every provider run error code has a title, a body and the Settings action", () => {
  const codes = RUN_ERROR_CODES.filter((c) => c.startsWith("provider_"));
  assert.ok(codes.length >= 5, "the provider run codes are missing");
  for (const code of codes) {
    const copy = messages.errors.run[code];
    assert.ok(copy?.["title"] && copy["body"] && copy["action"], `errors.run.${code} needs title, body and action`);
  }
});

test("every provider and model tier the pickers show has its words", () => {
  for (const id of PROVIDERS) {
    for (const key of [`option_${id}_name`, `option_${id}_tag`, `privacy_${id}`]) assert.ok(messages.providers[key], `providers.${key}`);
  }
  for (const tier of MODEL_TIERS) assert.ok(messages.providers[`tier_${tier}`], `providers.tier_${tier}`);
});

test("the wizard step and the settings tab are named", () => {
  assert.ok(messages.first_run["step_provider"]);
  assert.ok(messages.settings_nav["nav_provider_label"]);
});

test("a wizard draft keeps the provider choice and never a key", () => {
  const KEY = "sk-sentinel-DO-NOT-STORE-1234567890";
  const parsed = wizardDraftSchema.parse({
    step: "provider",
    provider: "openai",
    baseUrl: "https://example.test/v1",
    models: { opus: "gpt-5" },
    apiKey: KEY,
    key: KEY,
  });
  assert.equal(parsed.provider, "openai");
  assert.equal(parsed.baseUrl, "https://example.test/v1");
  assert.deepEqual(parsed.models, { opus: "gpt-5" });
  assert.ok(!JSON.stringify(parsed).includes(KEY), "a key survived into the draft");
  assert.equal(wizardDraftSchema.parse({ step: "root" }).provider, null, "an old draft reads as no choice");
});

test("the setup hook never puts a key in the mutation cache", () => {
  const source = readFileSync(join(process.cwd(), "src", "modules", "providers", "hooks", "use-provider-setup.ts"), "utf8");
  assert.ok(!source.includes("useMutation"), "keys must travel in plain async calls, not react-query mutations");
});
