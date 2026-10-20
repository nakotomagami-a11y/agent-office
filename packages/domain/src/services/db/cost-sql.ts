// `cost_usd` is summed only where it is a cost. An `unknown` row (an unpriced openai model) stores 0
// and is counted instead, so no total passes an unknown off as $0. NULL is a pre-v28 row: notional.
export const KNOWN_COST = "COALESCE(cost_basis,'notional') <> 'unknown'";
export const KNOWN_COST_USD = `(CASE WHEN ${KNOWN_COST} THEN COALESCE(cost_usd,0) ELSE 0 END)`;
export const UNKNOWN_COST_RUNS = `COALESCE(SUM(CASE WHEN ${KNOWN_COST} THEN 0 ELSE 1 END),0)`;
