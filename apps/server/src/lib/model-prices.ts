import type { ModelPricesResponse } from "@agent-office/domain/types";

/** No catalog yet: every price is unknown. */
export const EMPTY_CATALOG: ModelPricesResponse = { source: null, fetchedAt: null, stale: false, entries: {} };
