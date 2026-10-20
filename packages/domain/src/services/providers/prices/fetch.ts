// The only outbound price calls: two fixed URLs, no redirects, a timeout and a size cap. A failure
// is logged and the next source is tried; nothing here throws.
import { log } from "../../infra/log";
import { readCapped } from "../read-capped";
import type { PriceSource } from "./cache";
import { parseLiteLlm, parseOpenRouter, type PriceTable } from "./parse";

export const LITELLM_URL = "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json";
export const OPENROUTER_URL = "https://openrouter.ai/api/v1/models";
/** The LiteLLM file was 2.9 MB in 2026-10; room to grow, not to stream someone's disk image. */
export const MAX_CATALOG_BYTES = 16 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 20_000;

const SOURCES: ReadonlyArray<{ source: PriceSource; url: string; parse: (raw: unknown) => PriceTable }> = [
  { source: "litellm", url: LITELLM_URL, parse: parseLiteLlm },
  { source: "openrouter", url: OPENROUTER_URL, parse: parseOpenRouter },
];

export type FetchFn = typeof fetch;

async function fetchOne(fetchFn: FetchFn, url: string, parse: (raw: unknown) => PriceTable): Promise<PriceTable | string> {
  try {
    const res = await fetchFn(url, { redirect: "error", signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) {
      void res.body?.cancel().catch(() => {});
      return `http_${res.status}`;
    }
    const { text, complete } = await readCapped(res, MAX_CATALOG_BYTES);
    if (!complete) return "too_large_or_cut";
    const table = parse(JSON.parse(text));
    return table.size > 0 ? table : "no_prices";
  } catch (err) {
    return err instanceof SyntaxError ? "not_json" : (err as Error).name || "fetch_failed";
  }
}

/** The first source that yields any price, or null when both failed. */
export async function fetchPriceTable(fetchFn: FetchFn = fetch): Promise<{ source: PriceSource; table: PriceTable } | null> {
  for (const { source, url, parse } of SOURCES) {
    const result = await fetchOne(fetchFn, url, parse);
    if (typeof result !== "string") return { source, table: result };
    log.warn("prices.fetch_failed", { source, reason: result });
  }
  return null;
}
