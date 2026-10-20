import type { CostBasis } from "@agent-office/domain/config/providers";
import { costDisplay } from "./provider-format";
import { formatCost } from "../../runs/format/format-run-meta";

/** The words a cost can take besides a number, supplied by the caller so this stays translation-free. */
export interface CostWords {
  unknown: string;
  free: string;
  estimated: (amount: string) => string;
}

/**
 * A run's cost as text. Legacy rows (no basis) read as the number they always showed; `unknown`
 * is a dash and never `$0`, and `free` says so, because neither is a price of zero dollars.
 */
export function formatRunCost(cost: number, basis: CostBasis | undefined, words: CostWords): string {
  const shown = costDisplay(cost, basis);
  switch (shown.kind) {
    case "unknown":
      return words.unknown;
    case "free":
      return words.free;
    case "estimated":
      return words.estimated(formatCost(shown.usd));
    case "amount":
      return formatCost(shown.usd);
  }
}
