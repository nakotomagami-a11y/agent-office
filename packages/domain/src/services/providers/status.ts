// Live provider checks: one cheap authenticated call, classified into a status reason. Only ever run
// on an explicit test or a selection change; GET /api/providers and health read the cache.

import { MODEL_TIERS, PROVIDER_PROBE_TIMEOUT_MS } from "../../config/providers";
import type { Provider, ProviderConfig, ProviderStatus, ProviderStatusReason, ProviderTestResult } from "../../types/index";
import { keyTargetUrl } from "./urls";

const MAX_MODELS_BYTES = 2 * 1024 * 1024;

export interface ProbeTarget {
  config: ProviderConfig;
  /** The key to send, already checked to belong to the target URL. */
  key?: string;
}

export interface ProbeDeps {
  fetch: typeof fetch;
  /** `claude auth status --json`, parsed; null when the CLI could not run. */
  authStatus: () => Promise<unknown>;
}

const fail = (reason: ProviderStatusReason, started: number, detail?: string): ProviderTestResult =>
  ({ ok: false, reason, detail, latencyMs: Date.now() - started });

function reasonForStatus(status: number): ProviderStatusReason {
  if (status === 401 || status === 403) return "key_invalid";
  if (status === 404) return "no_models";
  if (status === 429) return "rate_limited";
  return "unreachable";
}

function modelIds(body: unknown): string[] {
  if (!body || typeof body !== "object" || !("data" in body) || !Array.isArray(body.data)) return [];
  return body.data.flatMap((m: unknown) => (m && typeof m === "object" && "id" in m && typeof m.id === "string" ? [m.id] : []));
}

/** The URL is user-chosen, so its body is read under a cap, never whole. */
async function boundedJson(res: Response): Promise<unknown> {
  const reader = res.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_MODELS_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return null;
  }
}

function headersFor(provider: Provider, key: string | undefined): Record<string, string> {
  if (provider === "anthropic_api") return { "x-api-key": key ?? "", "anthropic-version": "2023-06-01" };
  return key ? { authorization: `Bearer ${key}` } : {};
}

async function probeHttp(provider: Provider, target: ProbeTarget, deps: ProbeDeps): Promise<ProviderTestResult> {
  const started = Date.now();
  const base = keyTargetUrl(provider, target.config);
  if (!base) return fail("base_url_invalid", started);
  let res: Response;
  try {
    res = await deps.fetch(`${base}/${provider === "anthropic_api" ? "v1/models" : "models"}`, {
      headers: headersFor(provider, target.key),
      redirect: "error",
      signal: AbortSignal.timeout(PROVIDER_PROBE_TIMEOUT_MS),
    });
  } catch (err) {
    return fail(err instanceof Error && err.name === "TimeoutError" ? "timeout" : "unreachable", started);
  }
  if (!res.ok) return fail(reasonForStatus(res.status), started, `http_${res.status}`);
  const models = modelIds(await boundedJson(res));
  if (models.length === 0) return fail("no_models", started);
  const unmapped = MODEL_TIERS.map((t) => target.config.models?.[t]).filter((m): m is string => !!m && !models.includes(m));
  if (provider !== "anthropic_api" && unmapped.length > 0) {
    return { ok: false, reason: "model_not_found", detail: unmapped[0], latencyMs: Date.now() - started, availableModels: models };
  }
  return { ok: true, latencyMs: Date.now() - started, availableModels: models };
}

async function probeSubscription(deps: ProbeDeps): Promise<ProviderTestResult> {
  const started = Date.now();
  const raw = await deps.authStatus();
  if (!raw || typeof raw !== "object") return fail("cli_missing", started);
  if (!("loggedIn" in raw) || raw.loggedIn !== true) return fail("not_signed_in", started);
  if ("apiProvider" in raw && raw.apiProvider !== "firstParty") return fail("invalid_config", started, "not_first_party");
  return { ok: true, latencyMs: Date.now() - started };
}

export function probeProvider(provider: Provider, target: ProbeTarget, deps: ProbeDeps): Promise<ProviderTestResult> {
  return provider === "subscription" ? probeSubscription(deps) : probeHttp(provider, target, deps);
}

export const toStatus = (r: ProviderTestResult, checkedAt = Date.now()): ProviderStatus =>
  r.ok ? { available: true, checkedAt } : { available: false, reason: r.reason, detail: r.detail, checkedAt };
