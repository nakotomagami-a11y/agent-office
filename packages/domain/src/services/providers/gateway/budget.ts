// An openai run's spend: charged after every response from its real usage at the catalog price,
// each rate at its highest tier. OpenAI counts reasoning inside completion_tokens and cached tokens
// inside prompt_tokens, so both are billed. A capped run is checked before every upstream call.
import type { ModelPrice } from "../../../types/index";
import { chargeGatewayRun, gatewaySpend, reserveGatewayRun } from "../gateway-tokens";
import { priceFor } from "../prices/catalog";

export interface MessageUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number;
}

export interface CallBound {
  requestBytes: number;
  maxTokens: number;
}

export const NO_USAGE: MessageUsage = { input_tokens: 0, output_tokens: 0 };

export function usageCostUsd(price: ModelPrice, u: MessageUsage): number {
  const cached = u.cache_read_input_tokens ?? 0;
  const read = price.cacheReadPerMTok ?? price.inputPerMTok;
  return (u.input_tokens * price.inputPerMTok + cached * read + u.output_tokens * price.outputPerMTok) / 1_000_000;
}

/** The most a call can cost: a token per request byte, the full output cap. */
const worstUsage = (bound: CallBound): MessageUsage => ({ input_tokens: bound.requestBytes, output_tokens: bound.maxTokens });

const usd = (n: number): string => `$${n.toFixed(4)}`;

function refusalOf(ownerId: string, priced: boolean): string | null {
  const spend = gatewaySpend(ownerId);
  if (spend?.budgetUsd === undefined) return null;
  if (spend.unpriced || !priced) return "budget_exceeded: the price is unknown";
  if (spend.spentUsd + spend.reservedUsd < spend.budgetUsd) return null;
  const inFlight = spend.reservedUsd > 0 ? ` (+${usd(spend.reservedUsd)} in flight)` : "";
  return `budget_exceeded: spent ${usd(spend.spentUsd)}${inFlight} of $${spend.budgetUsd.toFixed(2)}`;
}

/**
 * Opens one upstream call. Its worst case is held until it settles, so parallel sub-agents cannot
 * all pass the cap check before any of them is charged; the call that crosses the cap still runs,
 * as with the CLI's own cap. `settle` runs once: the real usage, or the worst case when none came.
 */
export function openCharge(ownerId: string, model: string, bound: CallBound): { refusal: string } | { settle: (usage: MessageUsage | null) => void } {
  const price = priceFor(model);
  const refusal = refusalOf(ownerId, price !== null);
  if (refusal) return { refusal };
  const held = price ? usageCostUsd(price, worstUsage(bound)) : 0;
  reserveGatewayRun(ownerId, held);
  let settled = false;
  return {
    settle(usage) {
      if (settled) return;
      settled = true;
      reserveGatewayRun(ownerId, -held);
      chargeGatewayRun(ownerId, price && usageCostUsd(price, usage ?? worstUsage(bound)));
    },
  };
}
