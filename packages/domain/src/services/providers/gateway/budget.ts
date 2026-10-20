// An openai run's spend: charged after every response from its real usage at the catalog price,
// each rate at its highest tier. OpenAI counts reasoning inside completion_tokens and cached tokens
// inside prompt_tokens, so both are billed. A capped run is checked before every upstream call.
import type { ModelPrice } from "../../../types/index";
import { chargeGatewayRun, gatewaySpend } from "../gateway-tokens";
import { priceFor } from "../prices/catalog";

export interface MessageUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number;
}

export function usageCostUsd(price: ModelPrice, u: MessageUsage): number {
  const cached = u.cache_read_input_tokens ?? 0;
  const read = price.cacheReadPerMTok ?? price.inputPerMTok;
  return (u.input_tokens * price.inputPerMTok + cached * read + u.output_tokens * price.outputPerMTok) / 1_000_000;
}

/** No usage (a cut stream) is charged the most the call could cost: a token per request byte, the full output cap. */
export function chargeResponse(ownerId: string, model: string, usage: MessageUsage | null, bound: { requestBytes: number; maxTokens: number }): void {
  const price = priceFor(model);
  chargeGatewayRun(ownerId, price && usageCostUsd(price, usage ?? { input_tokens: bound.requestBytes, output_tokens: bound.maxTokens }));
}

/** A capped run that reached its cap, or whose price became unknown mid-run (fetching turned off). */
export function budgetRefusal(ownerId: string): string | null {
  const spend = gatewaySpend(ownerId);
  if (spend?.budgetUsd === undefined) return null;
  if (spend.unpriced) return "budget_exceeded: the price became unknown";
  return spend.spentUsd >= spend.budgetUsd ? `budget_exceeded: spent $${spend.spentUsd.toFixed(4)} of $${spend.budgetUsd.toFixed(2)}` : null;
}
