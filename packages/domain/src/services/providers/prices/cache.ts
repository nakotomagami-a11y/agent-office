// The last good catalog on disk. Read with a guard (a corrupt or hand-edited file is no cache) and
// merged with each fetch under the sanity rules, so one bad upstream day cannot reprice a run.
import { readFileSync, statSync } from "node:fs";
import type { ModelPrice } from "../../../types/index";
import { writeFileAtomic } from "../../infra/fs-atomic";
import { log } from "../../infra/log";
import { PRICE_CATALOG_FILE } from "../../infra/paths";
import { record, type PriceTable } from "./parse";

export type PriceSource = "litellm" | "openrouter";

export interface CatalogFile {
  source: PriceSource;
  fetchedAt: number;
  entries: Record<string, ModelPrice>;
}

const MAX_CACHE_BYTES = 4 * 1024 * 1024;
/** A rate more than this many times off its previous value is a broken upstream, not a price change. */
const MAX_CHANGE = 100;
const RATES = ["inputPerMTok", "outputPerMTok", "cacheReadPerMTok", "cacheWritePerMTok"] as const;

const positive = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v > 0;

function asPrice(v: unknown): ModelPrice | null {
  const p = record(v);
  if (!p) return null;
  if (p.provider !== "openai" && p.provider !== "anthropic") return null;
  if (!positive(p.inputPerMTok) || !positive(p.outputPerMTok)) return null;
  const optional = (k: string) => (p[k] === undefined || positive(p[k]));
  if (!optional("cacheReadPerMTok") || !optional("cacheWritePerMTok")) return null;
  const price: ModelPrice = { provider: p.provider, inputPerMTok: p.inputPerMTok, outputPerMTok: p.outputPerMTok };
  if (positive(p.cacheReadPerMTok)) price.cacheReadPerMTok = p.cacheReadPerMTok;
  if (positive(p.cacheWritePerMTok)) price.cacheWritePerMTok = p.cacheWritePerMTok;
  return price;
}

export function readCatalogFile(file = PRICE_CATALOG_FILE): CatalogFile | null {
  try {
    if (!statSync(file).isFile() || statSync(file).size > MAX_CACHE_BYTES) return null;
    const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
    const raw = record(parsed);
    if (!raw || (raw.source !== "litellm" && raw.source !== "openrouter") || !positive(raw.fetchedAt)) return null;
    const entries: Record<string, ModelPrice> = Object.create(null);
    for (const [model, value] of Object.entries(record(raw.entries) ?? {})) {
      const price = asPrice(value);
      if (price) entries[model] = price;
    }
    return { source: raw.source, fetchedAt: raw.fetchedAt, entries };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") log.warn("prices.cache_unreadable", { err: String(err) });
    return null;
  }
}

export function writeCatalogFile(catalog: CatalogFile, file = PRICE_CATALOG_FILE): void {
  writeFileAtomic(file, JSON.stringify(catalog));
}

function wildChange(prev: ModelPrice, next: ModelPrice): boolean {
  return RATES.some((rate) => {
    const a = prev[rate];
    const b = next[rate];
    return a !== undefined && b !== undefined && (b / a > MAX_CHANGE || a / b > MAX_CHANGE);
  });
}

/** A 100x jump keeps the last good value, as does a model the new table lacks; one it cannot price is dropped. */
export function mergePrices(prev: Record<string, ModelPrice>, next: PriceTable): Record<string, ModelPrice> {
  const merged: Record<string, ModelPrice> = Object.assign(Object.create(null), prev);
  for (const [model, price] of next) {
    const old = Object.hasOwn(prev, model) ? prev[model] : undefined;
    if (!price) {
      delete merged[model];
      continue;
    }
    if (old && wildChange(old, price)) {
      log.warn("prices.rejected", { model, reason: "change_over_100x" });
      continue;
    }
    merged[model] = price;
  }
  return merged;
}
