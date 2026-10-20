import {
  PROVIDER_STATUS_REASON_POLICY,
  isProviderStatusReason,
  normalizeBaseUrl,
  type CostBasis,
  type ProviderStatusReason,
} from "@agent-office/domain/config/providers";
import type { ModelPrice, ProviderModels } from "@agent-office/domain/types";
import { ApiError } from "@/lib/api/fetch";

/** What the user can do about a reason, which decides the button under its copy. */
export type ReasonAction = "recheck" | "sign_in" | "edit";

export const REASON_ACTION: Record<ProviderStatusReason, ReasonAction> = {
  not_configured: "edit",
  invalid_config: "edit",
  cli_missing: "recheck",
  not_signed_in: "sign_in",
  key_missing: "edit",
  key_unreadable: "edit",
  key_invalid: "edit",
  unreachable: "recheck",
  timeout: "recheck",
  empty_response: "recheck",
  no_models: "recheck",
  model_not_found: "edit",
  rate_limited: "edit",
  base_url_invalid: "edit",
  budget_unenforceable: "edit",
};

/** "Continue anyway" is offered only for reasons the server accepts too. */
export const canContinueAnyway = (reason: ProviderStatusReason | undefined): boolean =>
  reason !== undefined && PROVIDER_STATUS_REASON_POLICY[reason] === "accept";

/** The reason a provider call failed with: a 409 carries it as `reason`, a 400 as the message. */
export function reasonOfError(err: unknown): ProviderStatusReason | null {
  if (!(err instanceof ApiError)) return null;
  const fromBody = err.data?.["reason"];
  if (isProviderStatusReason(fromBody)) return fromBody;
  return isProviderStatusReason(err.message) ? err.message : null;
}

export type BaseUrlProblem = "invalid" | "credentials" | null;

/** Empty is fine (the provider's own address). Userinfo gets its own message because it is a likely paste. */
export function baseUrlProblem(raw: string): BaseUrlProblem {
  const v = raw.trim();
  if (!v) return null;
  if (normalizeBaseUrl(v) !== null) return null;
  try {
    const url = new URL(v);
    return url.username || url.password ? "credentials" : "invalid";
  } catch {
    return "invalid";
  }
}

/** Compare as the server binds a key: a trailing slash or host case is not a different address. */
export function sameBaseUrl(a: string | undefined, b: string | undefined): boolean {
  const left = a?.trim() ? normalizeBaseUrl(a) : "";
  const right = b?.trim() ? normalizeBaseUrl(b) : "";
  return left === right;
}

/** One model for every tier: the common local-server case. */
export function allTiersShare(models: ProviderModels): string | null {
  const ids = [models.haiku, models.sonnet, models.opus];
  return ids[0] && ids.every((m) => m === ids[0]) ? ids[0] : null;
}

export const withModelForAllTiers = (id: string): ProviderModels => ({ haiku: id, sonnet: id, opus: id });

export type CostDisplay =
  | { kind: "amount"; usd: number }
  | { kind: "estimated"; usd: number }
  | { kind: "unknown" }
  | { kind: "free" };

/**
 * How a run's cost reads. Legacy rows have no basis and read as the number they
 * always showed. `unknown` is never shown as $0, because it is not zero.
 */
export function costDisplay(usd: number, basis: CostBasis | undefined): CostDisplay {
  if (basis === "unknown") return { kind: "unknown" };
  if (basis === "free") return { kind: "free" };
  if (basis === "estimated") return { kind: "estimated", usd };
  return { kind: "amount", usd };
}

/** `$3.00/Mt`, or null when the catalog has no price, so the caller shows its own dash. */
export function formatPerMTok(price: number | undefined): string | null {
  if (price === undefined || !Number.isFinite(price)) return null;
  return price >= 10 ? `$${Math.round(price)}/Mt` : `$${price.toFixed(2)}/Mt`;
}

export const inputPriceOf = (entries: Record<string, ModelPrice> | undefined, modelId: string): number | undefined =>
  entries?.[modelId]?.inputPerMTok;
