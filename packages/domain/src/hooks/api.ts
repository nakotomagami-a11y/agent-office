/**
 * Single fetch wrapper used by every React Query hook. Handles JSON parsing,
 * error normalization, and automatic 4xx/5xx → throw conversion.
 *
 * Hooks should call `apiFetch<TResponse>(url, init?)` - never bare `fetch()`.
 */

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly fields?: Record<string, string[]>,
    // Raw parsed response body for non-2xx responses. Callers can inspect
    // domain-specific fields (e.g. softCap on 409 INSTANCE_CAP_EXCEEDED).
    public readonly data?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface ApiInit extends Omit<RequestInit, "body"> {
  body?: unknown;
  asText?: boolean;
}

interface ErrorEnvelope {
  error?: string;
  fields?: Record<string, string[]>;
}

function parseErrorEnvelope(raw: unknown): ErrorEnvelope {
  if (!raw || typeof raw !== "object") return {};
  const obj = raw as Record<string, unknown>;
  const out: ErrorEnvelope = {};
  if (typeof obj.error === "string") out.error = obj.error;
  if (obj.fields && typeof obj.fields === "object" && !Array.isArray(obj.fields)) {
    const fields: Record<string, string[]> = {};
    for (const [key, value] of Object.entries(obj.fields as Record<string, unknown>)) {
      if (Array.isArray(value) && value.every((v) => typeof v === "string")) {
        fields[key] = value as string[];
      }
    }
    if (Object.keys(fields).length > 0) out.fields = fields;
  }
  return out;
}

export async function apiFetch<T>(url: string, init: ApiInit = {}): Promise<T> {
  const { body, asText, headers, ...rest } = init;
  const requestInit: RequestInit = {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...(headers ?? {}),
    },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  };

  const res = await fetch(url, requestInit);

  if (!res.ok) {
    let raw: unknown;
    let envelope: ErrorEnvelope = {};
    try {
      raw = await res.json();
      envelope = parseErrorEnvelope(raw);
    } catch {
      /* non-json error */
    }
    const message = envelope.error ?? res.statusText ?? `HTTP ${res.status}`;
    const data =
      raw && typeof raw === "object" && !Array.isArray(raw)
        ? (raw as Record<string, unknown>)
        : undefined;
    throw new ApiError(res.status, message, envelope.fields, data);
  }

  if (asText) {
    return (await res.text()) as T;
  }
  if (res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
}

export async function apiUpload<T>(url: string, file: File): Promise<T> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(url, { method: "POST", body: form });
  if (!res.ok) {
    throw new ApiError(res.status, res.statusText);
  }
  return (await res.json()) as T;
}
