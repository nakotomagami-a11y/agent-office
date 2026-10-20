// What the CLI's stream says about the provider, read with guards: the stream is external input.
// Without this a gateway run with a rejected key retries ten times over minutes, then shows the
// subscription's "Not logged in" text (verified on CLI 2.1.296).
import type { Provider } from "../../../config/providers";
import type { RunErrorCode } from "../../../config/run-errors";
import { log } from "../../infra/log";

/** A refused connection is retried this many times before the run is ended as unreachable. */
export const MAX_CONNECT_RETRIES = 2;

export interface ProviderFailure {
  code: RunErrorCode;
  detail?: string;
}

const record = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

function byStatus(status: unknown): ProviderFailure | null {
  if (status === 401 || status === 403) return { code: "provider_auth_failed", detail: `http_${status}` };
  if (status === 404) return { code: "provider_model_not_found", detail: "http_404" };
  return null;
}

/** `system/init` names the model that actually runs: the mapped one on a gateway provider. */
export function initModel(evt: unknown): string | undefined {
  const e = record(evt);
  return e?.type === "system" && e.subtype === "init" && typeof e.model === "string" ? e.model : undefined;
}

/**
 * The key sources the env and pin exist to prevent. Anything else unknown is logged, not fatal: a
 * future CLI naming its OAuth login differently must not stop every subscription run.
 */
const FORBIDDEN_KEY_SOURCE = /^(?:apiKeyHelper|[A-Z][A-Z0-9_]*)$/;

/** Ends the run early. A mismatch counts for every provider: the env and pin promise `none`. */
export function failFastOnEvent(provider: Provider, evt: unknown): ProviderFailure | null {
  const e = record(evt);
  if (e?.type !== "system") return null;
  if (e.subtype === "init") {
    const source = e.apiKeySource;
    if (typeof source !== "string" || source === "none") return null;
    if (FORBIDDEN_KEY_SOURCE.test(source)) return { code: "provider_mismatch", detail: source };
    log.warn("run.unknown_key_source", { provider, source: source.slice(0, 40) });
    return null;
  }
  if (provider === "subscription" || e.subtype !== "api_retry") return null;
  const status = byStatus(e.error_status);
  if (status) return status;
  const connectionFailed = e.error_status === null || e.error_status === undefined;
  return connectionFailed && typeof e.attempt === "number" && e.attempt >= MAX_CONNECT_RETRIES
    ? { code: "provider_unreachable", detail: typeof e.error === "string" ? e.error : undefined }
    : null;
}

const UNREACHABLE_RE = /ECONNREFUSED|connection refused|ENOTFOUND|fetch failed|ETIMEDOUT/i;

/** A final `result` error on a non-subscription provider, by status first, its text second. */
export function classifyProviderResult(provider: Provider, evt: unknown): ProviderFailure | null {
  if (provider === "subscription") return null;
  const e = record(evt);
  if (e?.type !== "result" || e.is_error !== true) return null;
  const status = byStatus(e.api_error_status);
  if (status) return status;
  return typeof e.result === "string" && UNREACHABLE_RE.test(e.result) ? { code: "provider_unreachable" } : null;
}
