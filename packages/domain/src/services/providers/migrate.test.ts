/**
 * The legacy decision is made once: an install that finished the wizard keeps its subscription; a
 * fresh one must choose; an unreadable settings file defers it; a deleted row is never re-filled.
 *
 *   pnpm --filter @agent-office/domain test src/services/providers/migrate.test.ts
 */
import assert from "node:assert";
import { test } from "node:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const sandbox = mkdtempSync(join(tmpdir(), "ao-provider-migrate-"));
process.env.HOME = sandbox;
process.env.USERPROFILE = sandbox;
const settingsFile = join(sandbox, ".claude", "agent-office-settings.json");
mkdirSync(join(sandbox, ".claude"), { recursive: true });

const { ensureProviderMigrated, MIGRATION_MARKER_KEY } = await import("./migrate");
const { currentProvider } = await import("./current");
const { getSelection } = await import("./store");
const { getDb } = await import("../db/connection");
const { getUiSetting } = await import("../db/ui-settings");

function reset(): void {
  getDb().prepare("DELETE FROM provider_selection").run();
  getDb().prepare("DELETE FROM ui_settings WHERE key = ?").run(MIGRATION_MARKER_KEY);
  rmSync(settingsFile, { force: true });
}

test("a finished legacy install becomes subscription, once", () => {
  reset();
  writeFileSync(settingsFile, JSON.stringify({ projectsRoot: "/x", excluded: [], firstRunComplete: true }));
  ensureProviderMigrated();
  assert.deepStrictEqual({ ...getSelection(), changedAt: 0 }, { provider: "subscription", source: "migrated", changedAt: 0 });
  assert.equal(currentProvider().available, true);
});

test("after the marker, a deleted row is never re-filled", () => {
  getDb().prepare("DELETE FROM provider_selection").run();
  ensureProviderMigrated();
  assert.equal(getSelection(), undefined);
  assert.deepStrictEqual(currentProvider(), { provider: null, needsSetup: false, available: false, reason: "not_configured" });
});

test("a fresh install gets no row and needs setup", () => {
  reset();
  ensureProviderMigrated();
  assert.equal(getSelection(), undefined);
  assert.ok(getUiSetting(MIGRATION_MARKER_KEY)?.includes('"fresh"'));
  assert.equal(currentProvider().needsSetup, true);
});

test("an unreadable settings file defers the decision, and a readable one later decides it", () => {
  reset();
  writeFileSync(settingsFile, "{ not json");
  ensureProviderMigrated();
  assert.equal(getUiSetting(MIGRATION_MARKER_KEY), null);
  assert.deepStrictEqual(currentProvider(), {
    provider: null, needsSetup: false, available: false, reason: "invalid_config", detail: "settings_unreadable",
  });
  writeFileSync(settingsFile, JSON.stringify({ projectsRoot: "/x", excluded: [], firstRunComplete: true }));
  ensureProviderMigrated();
  assert.equal(getSelection()?.provider, "subscription");
});

test("a choice already made is never overwritten by the migration", () => {
  reset();
  getDb().prepare("INSERT INTO provider_selection (id, provider, source, changed_at) VALUES (1, 'local', 'chosen', 1)").run();
  writeFileSync(settingsFile, JSON.stringify({ projectsRoot: "/x", excluded: [], firstRunComplete: true }));
  ensureProviderMigrated();
  assert.equal(getSelection()?.provider, "local");
});

test("the marker is internal: hidden from the ui-settings listing", async () => {
  const { getAllUiSettings } = await import("../db/ui-settings");
  assert.ok(!(MIGRATION_MARKER_KEY in getAllUiSettings()));
});
