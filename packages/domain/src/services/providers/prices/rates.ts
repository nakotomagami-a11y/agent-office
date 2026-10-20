// Which catalog entry prices an agent's model under a provider. On openai and local an agent's
// `--model` is a Claude tier the gateway maps; the upstream model is what bills.
import { resolveModel, tierOf } from "../../../config/models";
import type { Provider } from "../../../types/index";
import { currentProvider } from "../current";
import { readProvider } from "../store";
import { priceFor } from "./catalog";

/** Null when the model has no mapping (an unknown family, or an unmapped tier). */
export function upstreamModelId(provider: Provider, model: string): string | null {
  if (provider === "openai" || provider === "local") {
    const tier = tierOf(model);
    return (tier && readProvider(provider)?.config?.models?.[tier]) || null;
  }
  return resolveModel(model)?.fullId ?? model;
}

export interface CacheRates {
  /** USD per token; 0 when unknown. */
  write: number;
  read: number;
  known: boolean;
}

/** System-prompt cache rates for the context-cost estimate, under the selected provider. */
export function contextCacheRates(model: string): CacheRates {
  const provider = currentProvider().provider;
  if (provider === "local") return { write: 0, read: 0, known: true };
  const id = provider ? upstreamModelId(provider, model) : null;
  const price = id ? priceFor(id) : null;
  if (!price) return { write: 0, read: 0, known: false };
  // OpenAI has no cache-write charge: the first turn bills the prompt as plain input.
  return {
    write: (price.cacheWritePerMTok ?? price.inputPerMTok) / 1_000_000,
    read: (price.cacheReadPerMTok ?? price.inputPerMTok) / 1_000_000,
    known: true,
  };
}
