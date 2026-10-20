/**
 * The resolver table (docs/architecture.md, "AI providers"): a choice is never swapped, garbage is
 * never a default, and "no row" means a different thing per settings-file state.
 *
 *   pnpm --filter @agent-office/domain test src/services/providers/resolve.test.ts
 */
import assert from "node:assert";
import { test } from "node:test";
import { presenceReason, resolveProvider, type ProviderPresence } from "./resolve";
import type { SettingsFileState } from "../settings";

const ready: ProviderPresence = { configValid: true, baseUrlValid: true, key: "present", tiersMapped: 3 };
const all = (): ProviderPresence => ready;
const absent: SettingsFileState = { state: "absent" };
const legacy: SettingsFileState = { state: "readable", firstRunComplete: true };
const midWizard: SettingsFileState = { state: "readable", firstRunComplete: false };
const unreadable: SettingsFileState = { state: "unreadable" };

test("no selection: absent or unfinished settings need setup", () => {
  for (const settings of [absent, midWizard]) {
    assert.deepStrictEqual(resolveProvider(undefined, settings, all), {
      provider: null, needsSetup: true, available: false, reason: "not_configured",
    });
  }
});

test("no selection after the first run is not_configured, never a default provider", () => {
  assert.deepStrictEqual(resolveProvider(undefined, legacy, all), {
    provider: null, needsSetup: false, available: false, reason: "not_configured",
  });
});

test("no selection with unreadable settings is invalid_config, never setup and never subscription", () => {
  assert.deepStrictEqual(resolveProvider(undefined, unreadable, all), {
    provider: null, needsSetup: false, available: false, reason: "invalid_config", detail: "settings_unreadable",
  });
});

test("a garbage stored value is invalid_config whatever else is available", () => {
  for (const settings of [absent, legacy, unreadable]) {
    const r = resolveProvider({ provider: "gpt-please" }, settings, all);
    assert.deepStrictEqual(r, { provider: null, needsSetup: false, available: false, reason: "invalid_config", detail: "unknown_provider" });
  }
});

test("a chosen provider stays chosen when it cannot run, even if another one could", () => {
  const presence = (p: string): ProviderPresence => (p === "openai" ? { ...ready, key: "missing" } : ready);
  assert.deepStrictEqual(resolveProvider({ provider: "openai" }, legacy, presence), {
    provider: "openai", needsSetup: false, available: false, reason: "key_missing",
  });
  assert.deepStrictEqual(resolveProvider({ provider: "subscription" }, legacy, presence), {
    provider: "subscription", needsSetup: false, available: true,
  });
});

test("presence per provider", () => {
  const none: ProviderPresence = { configValid: true, baseUrlValid: false, key: "missing", tiersMapped: 0 };
  assert.equal(presenceReason("subscription", none), undefined);
  assert.deepStrictEqual(presenceReason("anthropic_api", none), { reason: "key_missing" });
  assert.deepStrictEqual(presenceReason("anthropic_api", { ...ready, key: "unreadable" }), { reason: "key_unreadable" });
  assert.deepStrictEqual(presenceReason("openai", { ...ready, configValid: false }), { reason: "invalid_config" });
  assert.deepStrictEqual(presenceReason("openai", { ...ready, tiersMapped: 2 }), { reason: "invalid_config", detail: "tiers_unmapped" });
  assert.deepStrictEqual(presenceReason("local", none), { reason: "base_url_invalid" });
  assert.equal(presenceReason("local", { ...ready, key: "missing" }), undefined, "a local key is optional");
  assert.deepStrictEqual(presenceReason("local", { ...ready, key: "unreadable" }), { reason: "key_unreadable" });
});
