// The one-time legacy decision: an install that finished the first-run wizard before providers
// existed keeps running on its subscription. Decided once, recorded in an internal ui_settings key,
// and deferred while the settings file exists but cannot be read.

import { getUiSetting, setUiSetting } from "../db/ui-settings";
import { log } from "../infra/log";
import { settingsFileState } from "../settings";
import { insertSelectionIfAbsent } from "./store";

export const MIGRATION_MARKER_KEY = "_provider_migration";

/** Boot never throws; a failure here means every run will be refused, so it is logged loudly. */
export function migrateAtBoot(): void {
  try {
    ensureProviderMigrated();
  } catch (err) {
    log.warn("provider.boot_migration_failed", { err: String(err) });
  }
}

export function ensureProviderMigrated(): void {
  if (getUiSetting(MIGRATION_MARKER_KEY)) return;
  const settings = settingsFileState();
  if (settings.state === "unreadable") {
    log.warn("provider.migration_deferred", { reason: "settings_unreadable" });
    return;
  }
  const legacy = settings.state === "readable" && settings.firstRunComplete;
  if (legacy) insertSelectionIfAbsent("subscription", "migrated");
  const outcome = legacy ? "subscription" : "fresh";
  setUiSetting(MIGRATION_MARKER_KEY, JSON.stringify({ decidedAt: Date.now(), outcome }));
  log.info("provider.migrated", { outcome });
}
