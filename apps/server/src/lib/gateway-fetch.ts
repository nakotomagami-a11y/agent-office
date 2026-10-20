import { GATEWAY_FIRST_BYTE_TIMEOUT_MS } from "@agent-office/domain/config/providers";

/** Test seams, never set by the route: production always uses the fixed limits and the official URL. */
export interface GatewayOptions {
  maxBodyBytes?: number;
  anthropicUrl?: string;
  firstByteTimeoutMs?: number;
}

export type FetchFailure = "aborted" | "timeout" | "connection_failed";

/**
 * fetch with a deadline for the response headers only (the body may stream as long as it likes),
 * aborted with the client. The failure kind tells Stop from an outage.
 */
export async function fetchUpstream(
  url: string, init: RequestInit, client: AbortSignal, opts: GatewayOptions,
): Promise<Response | FetchFailure> {
  const controller = new AbortController();
  const onClient = (): void => controller.abort();
  client.addEventListener("abort", onClient, { once: true });
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, opts.firstByteTimeoutMs ?? GATEWAY_FIRST_BYTE_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, redirect: "error", signal: controller.signal });
  } catch {
    if (client.aborted) return "aborted";
    return timedOut ? "timeout" : "connection_failed";
  } finally {
    clearTimeout(timer);
  }
}
