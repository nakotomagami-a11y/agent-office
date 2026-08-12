/**
 * Shared axios instance for every browser → API-route call.
 *
 * Axios is the HTTP client for the frontend. API calls live in dedicated
 * modules under `src/lib/api/<resource>.ts` and are consumed by TanStack
 * Query hooks — never call `apiClient` (or bare `fetch`) directly from a
 * component.
 *
 * The response interceptor normalizes every non-2xx into the shared
 * `ApiError` (the same error the legacy `apiFetch` throws), so React Query
 * hooks and error handling that inspect `.status` / `.fields` / `.data`
 * keep working regardless of which transport made the call.
 */

import axios, { type AxiosError } from "axios";
import { ApiError } from "@agent-office/domain/hooks/api";

export { ApiError };

export const apiClient = axios.create({
  headers: { "Content-Type": "application/json" },
});

function fieldsFrom(raw: unknown): Record<string, string[]> | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const candidate = (raw as Record<string, unknown>).fields;
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return undefined;
  const out: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(candidate as Record<string, unknown>)) {
    if (Array.isArray(value) && value.every((v) => typeof v === "string")) {
      out[key] = value as string[];
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

apiClient.interceptors.response.use(
  (res) => res,
  (error: AxiosError) => {
    const res = error.response;
    if (!res) {
      // No response — network failure, CORS, or aborted request.
      throw new ApiError(0, error.message || "Network error");
    }
    const raw = res.data;
    const message =
      (raw && typeof raw === "object" && typeof (raw as Record<string, unknown>).error === "string"
        ? ((raw as Record<string, unknown>).error as string)
        : undefined) ?? res.statusText ?? `HTTP ${res.status}`;
    const data =
      raw && typeof raw === "object" && !Array.isArray(raw)
        ? (raw as Record<string, unknown>)
        : undefined;
    throw new ApiError(res.status, message, fieldsFrom(raw), data);
  },
);
