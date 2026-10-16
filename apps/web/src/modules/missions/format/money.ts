import { MAX_USD } from "@agent-office/domain/config/missions";

/** Dollars, then at most two decimals after a `.` or a single `,` (a decimal comma, "2,50").
 *  "1,000" is refused, not read as $1, and nothing is ever stripped: stripping turned "2,50" into $250. */
const AMOUNT = /^(?:\d+(?:[.,]\d{0,2})?|[.,]\d{1,2})$/;

/** The amount typed, or null when it is not one. */
export function parseUsd(text: string): number | null {
  // NFKC folds full-width digits and separators (an IME types "２，５０") into the ones matched here.
  const t = text.normalize("NFKC").trim();
  return AMOUNT.test(t) ? Number(t.replace(",", ".")) : null;
}

/** The contract's `usd`: positive, at most MAX_USD. */
export const usdOk = (n: number | null): n is number => n !== null && n > 0 && n <= MAX_USD;
