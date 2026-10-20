/**
 * A provider key is bound to the URL it was saved for (Q-50): it is only ever read back for that
 * URL, a URL change clears it, and nothing hands out more than its last four characters.
 *
 *   pnpm --filter @agent-office/domain test src/services/providers/store.test.ts
 */
import assert from "node:assert";
import { test } from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const sandbox = mkdtempSync(join(tmpdir(), "ao-provider-store-"));
process.env.HOME = sandbox;
process.env.USERPROFILE = sandbox;

const store = await import("./store");
const { getDb } = await import("../db/connection");

const KEY = "sk-proj-SENTINEL-abcdef123456wxyz";

test("a key is read back only for the normalized URL it was saved for", () => {
  assert.deepStrictEqual(store.saveProviderConfig("openai", { baseUrl: "https://API.example.com/v1/", apiKey: KEY }), { ok: true });
  assert.deepStrictEqual(store.readProviderKey("openai", "https://api.example.com/v1"), { ok: true, key: KEY });
  for (const other of ["https://api.example.com.evil.test/v1", "https://api.example.com/v2", "http://api.example.com/v1", "nonsense"]) {
    assert.deepStrictEqual(store.readProviderKey("openai", other), { ok: false, reason: "key_missing" }, other);
  }
});

test("changing the URL without a new key clears the key; with a new key binds the new one", () => {
  store.saveProviderConfig("local", { baseUrl: "http://localhost:11434/v1", apiKey: KEY });
  store.saveProviderConfig("local", { models: { haiku: "a", sonnet: "b", opus: "c" } });
  assert.equal(store.keyState("local"), "present", "a save that keeps the URL keeps the key");
  store.saveProviderConfig("local", { baseUrl: "http://localhost:1234/v1" });
  assert.equal(store.keyState("local"), "missing");
  assert.equal(store.readProvider("local")?.keyBaseUrl, null);
  store.saveProviderConfig("local", { baseUrl: "http://localhost:4000/v1", apiKey: "another-key-9876" });
  assert.deepStrictEqual(store.readProviderKey("local", "http://localhost:4000/v1"), { ok: true, key: "another-key-9876" });
  assert.deepStrictEqual(store.readProvider("local")?.config?.models, { haiku: "a", sonnet: "b", opus: "c" });
});

test("anthropic_api keys go only to the official URL, which is not settable", () => {
  assert.deepStrictEqual(store.saveProviderConfig("anthropic_api", { baseUrl: "https://evil.test" }), { ok: false, reason: "invalid_config" });
  store.saveProviderConfig("anthropic_api", { apiKey: KEY });
  assert.deepStrictEqual(store.readProviderKey("anthropic_api", "https://api.anthropic.com/"), { ok: true, key: KEY });
  assert.equal(store.keyHint("anthropic_api"), "wxyz");
});

test("the stored secret is ciphertext and never the key", () => {
  const rows = getDb().prepare("SELECT secret FROM provider_configs").all() as Array<{ secret: string | null }>;
  for (const { secret } of rows) assert.ok(!secret || (secret.startsWith("aes1:") && !secret.includes("SENTINEL")));
});

test("a secret that is not aes1: ciphertext is unreadable, not a 500 and not a plaintext key", () => {
  getDb().prepare("UPDATE provider_configs SET secret = ? WHERE provider = 'anthropic_api'").run("plain-legacy-value");
  assert.equal(store.keyState("anthropic_api"), "unreadable");
  assert.deepStrictEqual(store.readProviderKey("anthropic_api", "https://api.anthropic.com"), { ok: false, reason: "key_unreadable" });
  assert.equal(store.keyHint("anthropic_api"), undefined);
});

test("deleting a key clears its URL binding", () => {
  store.deleteProviderKey("openai");
  assert.equal(store.keyState("openai"), "missing");
  assert.equal(store.readProvider("openai")?.keyBaseUrl, null);
});

test("an invalid base URL is refused and nothing is written", () => {
  const before = store.readProvider("openai");
  assert.deepStrictEqual(store.saveProviderConfig("openai", { baseUrl: "http://u:p@host/v1" }), { ok: false, reason: "base_url_invalid" });
  assert.deepStrictEqual(store.readProvider("openai"), before);
});

test("garbage config JSON reads as null config, so the resolver reports invalid_config", () => {
  getDb().prepare("UPDATE provider_configs SET config = ? WHERE provider = 'local'").run('{"models":{"opus":42}}');
  assert.equal(store.readProvider("local")?.config, null);
});

test("the selection: insert-if-absent never overwrites a choice", () => {
  assert.equal(store.getSelection(), undefined);
  store.setSelection("openai", "chosen");
  store.insertSelectionIfAbsent("subscription", "migrated");
  assert.equal(store.getSelection()?.provider, "openai");
  assert.equal(store.getSelection()?.source, "chosen");
});

test("re-pointing or re-keying the selected provider moves its last-changed time; a null tier unmaps it", async () => {
  store.setSelection("local", "chosen");
  getDb().prepare("UPDATE provider_selection SET changed_at = 1").run();
  store.saveProviderConfig("local", { baseUrl: "http://localhost:5000/v1" });
  assert.ok(store.getSelection()!.changedAt > 1);
  store.saveProviderConfig("local", { models: { haiku: "a", sonnet: "b", opus: "c" } });
  store.saveProviderConfig("local", { models: { opus: null } });
  assert.deepStrictEqual(store.readProvider("local")?.config?.models, { haiku: "a", sonnet: "b" });
});

test("a short key never gets a hint, so a hint can never be most of the key", () => {
  store.saveProviderConfig("openai", { apiKey: "short-key-12345" });
  assert.equal(store.keyHint("openai"), undefined);
});

test("re-choosing the selected provider, or re-saving its address unchanged, is no change: same time, no audit line", () => {
  const warned: string[] = [];
  const stderrWrite = process.stderr.write.bind(process.stderr);
  const quietly = (fn: () => void): void => {
    process.stderr.write = ((chunk: string | Uint8Array) => { warned.push(String(chunk)); return true; }) as typeof process.stderr.write;
    try { fn(); } finally { process.stderr.write = stderrWrite; }
  };
  store.saveProviderConfig("local", { baseUrl: "http://localhost:7000/v1" });
  store.setSelection("local", "migrated");
  getDb().prepare("UPDATE provider_selection SET changed_at = 1").run();
  quietly(() => {
    store.setSelection("local", "chosen");
    store.saveProviderConfig("local", { baseUrl: "http://localhost:7000/v1", models: { haiku: "q" } });
  });
  assert.deepStrictEqual([store.getSelection()?.changedAt, store.getSelection()?.source], [1, "chosen"]);
  assert.ok(!warned.some((l) => l.includes("provider.changed")), warned.join(""));
  quietly(() => store.setSelection("subscription", "chosen"));
  assert.ok(store.getSelection()!.changedAt > 1, "a real switch still moves it");
  assert.ok(warned.some((l) => l.includes("provider.changed")), "and is audited");
});
