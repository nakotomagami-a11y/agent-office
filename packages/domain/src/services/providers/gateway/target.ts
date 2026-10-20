// Where a gateway request goes and with which key. The key is re-read for the exact normalized URL
// it was saved for, so a config changed mid-run can never carry it elsewhere (Q-50).
import { MODEL_TIERS, type Provider } from "../../../config/providers";
import { readProvider, readProviderKey } from "../store";
import { ANTHROPIC_API_URL, keyTargetUrl } from "../urls";

export interface GatewayTarget {
  ok: true;
  url: string;
  key?: string;
  model: string;
}

export interface GatewayRefusal {
  ok: false;
  status: number;
  type: "authentication_error" | "not_found_error" | "invalid_request_error";
  /** The run error a refusal stands for; fail-fast kills the run with it. */
  code: "provider_auth_failed" | "provider_model_not_found" | "provider_unavailable";
  detail: string;
}

const refuse = (status: number, type: GatewayRefusal["type"], code: GatewayRefusal["code"], detail: string): GatewayRefusal =>
  ({ ok: false, status, type, code, detail });

export function passthroughTarget(): GatewayTarget | GatewayRefusal {
  const key = readProviderKey("anthropic_api", ANTHROPIC_API_URL);
  if (!key.ok) return refuse(401, "authentication_error", "provider_auth_failed", key.reason);
  return { ok: true, url: `${ANTHROPIC_API_URL}/v1/messages`, key: key.key, model: "" };
}

/** Only a model the user mapped to a tier is forwarded; a `claude-*` id never leaves for another backend. */
export function chatTarget(provider: Exclude<Provider, "subscription" | "anthropic_api">, model: string): GatewayTarget | GatewayRefusal {
  const config = readProvider(provider)?.config;
  if (!config) return refuse(400, "invalid_request_error", "provider_unavailable", "invalid_config");
  const mapped = MODEL_TIERS.map((t) => config.models?.[t]).filter((m): m is string => !!m);
  if (!mapped.includes(model)) return refuse(404, "not_found_error", "provider_model_not_found", "model_not_mapped");
  const base = keyTargetUrl(provider, config);
  if (!base) return refuse(400, "invalid_request_error", "provider_unavailable", "base_url_invalid");
  const key = readProviderKey(provider, base);
  if (!key.ok && (provider === "openai" || key.reason === "key_unreadable")) {
    return refuse(401, "authentication_error", "provider_auth_failed", key.reason);
  }
  return { ok: true, url: `${base}/chat/completions`, key: key.ok ? key.key : undefined, model };
}
