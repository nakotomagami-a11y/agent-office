// The two public price catalogs, parsed (never cast) into one shape: USD per million tokens, the
// highest tier of each rate, only `openai` and `anthropic` chat models. A model with a pricing
// field this code does not understand is left out, so its price is unknown rather than wrong.
import type { ModelPrice } from "../../../types/index";

export type PriceTable = Map<string, ModelPrice>;
type Rate = "input" | "output" | "cacheRead" | "cacheWrite";

const PER_MTOK = 1_000_000;
/** The one place a per-token price becomes a per-million one. */
export const perMTok = (perToken: number): number => Math.round(perToken * PER_MTOK * 1e6) / 1e6;

const RATE_OF: Record<string, Rate> = {
  input_cost_per_token: "input",
  output_cost_per_token: "output",
  output_cost_per_reasoning_token: "output",
  cache_read_input_token_cost: "cacheRead",
  cache_creation_input_token_cost: "cacheWrite",
};
const TIER_SUFFIX = /_above_\d+k_tokens$/;
/** Units and service tiers the gateway never requests (it sends no `service_tier`): they cannot bill a run. */
const IGNORED = /batches|flex|priority|ultrafast|audio|image|video|pdf|search|file|vector|tool|character|second|query|request|pixel|web|code_interpreter|computer_use|1hr/;

export const record = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

/** The highest rate per kind across tiers; null when a cost field is not understood. */
function litellmRates(entry: Record<string, unknown>): Partial<Record<Rate, number>> | null {
  const rates: Partial<Record<Rate, number>> = {};
  for (const [field, value] of Object.entries(entry)) {
    if (!field.includes("cost")) continue;
    const rate = RATE_OF[field.replace(TIER_SUFFIX, "")];
    if (!rate) {
      if (IGNORED.test(field)) continue;
      return null;
    }
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
    rates[rate] = Math.max(rates[rate] ?? 0, value);
  }
  return rates;
}

function toPrice(provider: ModelPrice["provider"], r: Partial<Record<Rate, number>>): ModelPrice | null {
  if (!r.input || !r.output) return null;
  return {
    provider,
    inputPerMTok: perMTok(r.input),
    outputPerMTok: perMTok(r.output),
    ...(r.cacheRead ? { cacheReadPerMTok: perMTok(r.cacheRead) } : {}),
    ...(r.cacheWrite ? { cacheWritePerMTok: perMTok(r.cacheWrite) } : {}),
  };
}

/** LiteLLM's `model_prices_and_context_window.json`. */
export function parseLiteLlm(raw: unknown): PriceTable {
  const table: PriceTable = new Map();
  for (const [model, value] of Object.entries(record(raw) ?? {})) {
    const entry = record(value);
    const provider = entry?.litellm_provider;
    if (!entry || model.includes("/") || (provider !== "openai" && provider !== "anthropic")) continue;
    if (entry.mode !== undefined && entry.mode !== "chat") continue;
    const rates = litellmRates(entry);
    const price = rates && toPrice(provider, rates);
    if (price) table.set(model, price);
  }
  return table;
}

const OPENROUTER_RATE: Record<string, Rate> = {
  prompt: "input",
  completion: "output",
  internal_reasoning: "output",
  input_cache_read: "cacheRead",
  input_cache_write: "cacheWrite",
};
const OPENROUTER_IGNORED = /^(?:overrides|min_prompt_tokens|web_search|input_cache_write_1h|image\w*|audio\w*)$/;

/** Prices are decimal strings; `overrides` holds the long-prompt tiers, so the highest wins. */
function openRouterRates(pricing: Record<string, unknown>): Partial<Record<Rate, number>> | null {
  const rates: Partial<Record<Rate, number>> = {};
  const tiers = [pricing, ...(Array.isArray(pricing.overrides) ? pricing.overrides : [])];
  for (const tier of tiers.map(record)) {
    if (!tier) return null;
    for (const [field, value] of Object.entries(tier)) {
      if (OPENROUTER_IGNORED.test(field)) continue;
      const rate = OPENROUTER_RATE[field];
      const n = typeof value === "string" || typeof value === "number" ? Number(value) : NaN;
      if (!rate || !Number.isFinite(n) || n < 0) return null;
      rates[rate] = Math.max(rates[rate] ?? 0, n);
    }
  }
  return rates;
}

/** OpenRouter's public `/api/v1/models`; ids like `anthropic/claude-sonnet-4.5` become `claude-sonnet-4-5`. */
export function parseOpenRouter(raw: unknown): PriceTable {
  const table: PriceTable = new Map();
  const data = record(raw)?.data;
  for (const item of Array.isArray(data) ? data : []) {
    const entry = record(item);
    const match = /^(openai|anthropic)\/([^:]+)$/.exec(typeof entry?.id === "string" ? entry.id : "");
    const pricing = record(entry?.pricing);
    if (!match || !pricing) continue;
    const provider = match[1] === "openai" ? "openai" : "anthropic";
    const model = provider === "anthropic" ? match[2]!.replace(/\./g, "-") : match[2]!;
    const rates = openRouterRates(pricing);
    const price = rates && toPrice(provider, rates);
    if (price) table.set(model, price);
  }
  return table;
}
