/**
 * RULE arch.parse-dont-cast — `JSON.parse` returns `any`, so `as SomeShape` is
 * a claim the runtime can break. These are the two narrowings that cover the
 * cases not worth a Zod schema: a single field read, or "is it even an object".
 *
 * Anything with a real shape (a config file, a persisted draft) belongs in
 * `validation-schemas.ts` instead — a schema also supplies defaults, which a
 * guard cannot.
 */

/** `JSON.parse`, typed honestly. Throws on malformed input like `JSON.parse`. */
export function parseJson(raw: string): unknown {
  return JSON.parse(raw) as unknown;
}

/** A plain object, or null. Arrays are not records. */
export function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** A string field off an unknown value, or undefined. */
export function strField(value: unknown, key: string): string | undefined {
  const v = asRecord(value)?.[key];
  return typeof v === "string" ? v : undefined;
}
