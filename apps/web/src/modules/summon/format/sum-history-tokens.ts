import type { ThreadItem } from "@agent-office/domain/types";

/**
 * Sum `tokensIn + tokensOut` across all committed system-done items in the
 * thread. The live stream's usage is added on top by the caller.
 */
export function sumHistoryTokens(thread: ThreadItem[]): number {
  let total = 0;
  for (const item of thread) {
    if (item.kind === "system-done") {
      total += (item.tokensIn ?? 0) + (item.tokensOut ?? 0);
    }
  }
  return total;
}
