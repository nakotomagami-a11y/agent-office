// An upstream failure the gateway saw for a run. The CLI would otherwise retry ten times and then
// show its own text; the run listener ends the run at once with the provider's code instead.
import type { RunErrorCode } from "../../../config/run-errors";
import { capDetail, redactSecrets, scrubMaskedKeys } from "../../execution/runs/errors";

export type GatewayFailureListener = (ownerId: string, code: RunErrorCode, detail: string | undefined) => void;

declare global {
  var __agentOfficeGatewayFailureListeners: Set<GatewayFailureListener> | undefined;
}
const listeners: Set<GatewayFailureListener> =
  globalThis.__agentOfficeGatewayFailureListeners ?? (globalThis.__agentOfficeGatewayFailureListeners = new Set());

export function onGatewayFailure(listener: GatewayFailureListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * `detail` may be upstream text that echoes the key: the exact key (`secrets`, any shape, a local
 * server's too) and masked `sk-` keys are scrubbed, and it is capped, before anyone sees it.
 */
export function reportGatewayFailure(ownerId: string, code: RunErrorCode, detail?: string, secrets: readonly string[] = []): void {
  const safe = detail === undefined ? undefined : capDetail(scrubMaskedKeys(redactSecrets(detail, secrets) ?? ""));
  for (const listener of listeners) listener(ownerId, code, safe);
}

/** What the child sees for a rejected credential: fixed text, so no upstream wording reaches a transcript. */
export const UPSTREAM_REJECTED_CREDENTIAL = "upstream rejected the credential";

export const anthropicError = (type: string, message: string): Record<string, unknown> =>
  ({ type: "error", error: { type, message } });
