// The output-cap parameter and its size, per (provider, model). Retried once, and only on the
// upstream's own complaint about it: any other 400 is the caller's real error.
import type { Provider } from "../../../config/providers";
import type { CapParam } from "./to-chat";

declare global {
  var __agentOfficeCapParams: Map<string, CapParam> | undefined;
}
const capParams: Map<string, CapParam> = globalThis.__agentOfficeCapParams ?? (globalThis.__agentOfficeCapParams = new Map());

export function capParamFor(provider: Provider, model: string): CapParam {
  return capParams.get(`${provider}|${model}`) ?? (provider === "openai" ? "max_completion_tokens" : "max_tokens");
}

/** Only after the retry with this name succeeded: a guess that failed must not stick. */
export function rememberCapParam(provider: Provider, model: string, param: CapParam): void {
  capParams.set(`${provider}|${model}`, param);
}

export function upstreamMessage(body: unknown): string {
  if (!body || typeof body !== "object" || !("error" in body)) return "";
  const error = body.error;
  if (typeof error === "string") return error;
  return error && typeof error === "object" && "message" in error && typeof error.message === "string" ? error.message : "";
}

export interface CapRetry {
  param: CapParam;
  /** Set when the upstream named the model's own ceiling. */
  maxTokens?: number;
}

const CEILING_RE = /(?:supports at most|at most|maximum(?: value)?(?: is| of)?|max(?:imum)? allowed(?: is)?)\s*:?\s*(\d{2,7})/i;
const UNSUPPORTED_RE = /unsupported|not supported|instead/i;

export function capRetry(sent: CapParam, sentTokens: number, body: unknown): CapRetry | null {
  const message = upstreamMessage(body);
  if (!message.includes(sent)) return null;
  const ceiling = CEILING_RE.exec(message);
  const max = ceiling ? Number(ceiling[1]) : NaN;
  if (Number.isFinite(max) && max > 0 && max < sentTokens) return { param: sent, maxTokens: max };
  if (!UNSUPPORTED_RE.test(message)) return null;
  return { param: sent === "max_tokens" ? "max_completion_tokens" : "max_tokens" };
}
