// The price catalog the app reads: last good cache, refreshed at boot when a day old and then daily.
// The off switch is a setting, not an env var: with it off nothing is fetched and every price is
// unknown, so capped openai runs are refused instead of priced from an old file (D-22).
import type { ModelPrice, ModelPricesResponse } from "../../../types/index";
import { getUiSetting, setUiSetting } from "../../db/ui-settings";
import { log } from "../../infra/log";
import { mergePrices, readCatalogFile, writeCatalogFile, type CatalogFile } from "./cache";
import { fetchPriceTable, type FetchFn } from "./fetch";

export const PRICE_FETCH_ENABLED_KEY = "_price_fetch_enabled";
const DAY_MS = 24 * 60 * 60_000;
export const STALE_AFTER_MS = 7 * DAY_MS;
export const REFRESH_MIN_INTERVAL_MS = 60_000;

interface CatalogState {
  /** undefined: not read from disk yet. */
  file: CatalogFile | null | undefined;
  lastAttemptAt: number;
  inflight: Promise<boolean> | null;
}

declare global {
  var __agentOfficePriceCatalog: CatalogState | undefined;
}
const state: CatalogState =
  globalThis.__agentOfficePriceCatalog ?? (globalThis.__agentOfficePriceCatalog = { file: undefined, lastAttemptAt: -Infinity, inflight: null });

function catalog(): CatalogFile | null {
  if (state.file === undefined) state.file = readCatalogFile();
  return state.file;
}

/** Tests only: drop the in-memory copy so the next read goes to disk. */
export function forgetPriceCatalog(): void {
  state.file = undefined;
  state.lastAttemptAt = -Infinity;
  state.inflight = null;
}

export const priceFetchEnabled = (): boolean => getUiSetting(PRICE_FETCH_ENABLED_KEY) !== "false";

export function pricesView(now = Date.now()): ModelPricesResponse {
  const file = priceFetchEnabled() ? catalog() : null;
  return {
    source: file?.source ?? null,
    fetchedAt: file?.fetchedAt ?? null,
    stale: file ? now - file.fetchedAt > STALE_AFTER_MS : false,
    fetchEnabled: priceFetchEnabled(),
    entries: file?.entries ?? {},
  };
}

/** Null is unknown: no catalog, fetching off, or a model the catalog does not price. */
export function priceFor(model: string): ModelPrice | null {
  if (!priceFetchEnabled()) return null;
  return catalog()?.entries[model] ?? null;
}

/** When the catalog that priced these models was fetched; undefined when unknown. */
export const priceTableDate = (): number | undefined => (priceFetchEnabled() ? catalog()?.fetchedAt : undefined);

async function fetchAndStore(fetchFn: FetchFn, now: number): Promise<boolean> {
  const fetched = await fetchPriceTable(fetchFn);
  if (!fetched) return false;
  const next: CatalogFile = { source: fetched.source, fetchedAt: now, entries: mergePrices(catalog()?.entries ?? {}, fetched.table) };
  try {
    writeCatalogFile(next);
  } catch (err) {
    log.warn("prices.cache_write_failed", { err: String(err) });
  }
  state.file = next;
  return true;
}

function refreshNow(fetchFn: FetchFn, now: number): Promise<boolean> {
  state.lastAttemptAt = now;
  state.inflight ??= fetchAndStore(fetchFn, now)
    .catch((err: unknown) => {
      log.warn("prices.refresh_failed", { err: String(err) });
      return false;
    })
    .finally(() => { state.inflight = null; });
  return state.inflight;
}

export type RefreshResult = { ok: true; view: ModelPricesResponse } | { ok: false; error: "price_fetch_disabled" | "rate_limited" | "price_fetch_failed" };

/** The manual "Refresh prices": one upstream attempt per minute however often it is called. */
export async function refreshPrices(fetchFn: FetchFn = fetch, now = Date.now()): Promise<RefreshResult> {
  if (!priceFetchEnabled()) return { ok: false, error: "price_fetch_disabled" };
  if (!state.inflight && now - state.lastAttemptAt < REFRESH_MIN_INTERVAL_MS) return { ok: false, error: "rate_limited" };
  return (await refreshNow(fetchFn, now)) ? { ok: true, view: pricesView(now) } : { ok: false, error: "price_fetch_failed" };
}

/** Boot and the hourly tick: fetch only when on and the cache is a day old (or absent). */
export async function refreshPricesIfDue(fetchFn: FetchFn = fetch, now = Date.now()): Promise<void> {
  if (!priceFetchEnabled() || state.inflight) return;
  const file = catalog();
  if (file && now - file.fetchedAt < DAY_MS) return;
  if (now - state.lastAttemptAt < 60 * 60_000) return;
  await refreshNow(fetchFn, now);
}

export function setPriceFetchEnabled(enabled: boolean): ModelPricesResponse {
  setUiSetting(PRICE_FETCH_ENABLED_KEY, enabled ? "true" : "false");
  log.info("prices.fetch_enabled_changed", { enabled });
  return pricesView();
}

/** Never blocks boot: the first fetch runs in the background, then an unref'd hourly check. */
export function startPriceRefresh(): void {
  void refreshPricesIfDue();
  setInterval(() => void refreshPricesIfDue(), 60 * 60_000).unref();
}
