import { NextResponse } from "next/server";
import type { z } from "zod";

export type ValidationResult<T> =
  | { data: T; error: null }
  | { data: null; error: NextResponse };

export function validateBody<S extends z.ZodTypeAny>(
  schema: S,
  raw: unknown,
): ValidationResult<z.output<S>> {
  const parsed = schema.safeParse(raw);
  if (parsed.success) return { data: parsed.data as z.output<S>, error: null };

  const fieldErrors: Record<string, string[]> = {};
  for (const issue of parsed.error.issues) {
    const key = issue.path.join(".") || "_";
    (fieldErrors[key] ??= []).push(issue.message);
  }
  return {
    data: null,
    error: NextResponse.json({ error: "validation_failed", fields: fieldErrors }, { status: 400 }),
  };
}

export function validateQuery<S extends z.ZodTypeAny>(
  schema: S,
  search: URLSearchParams,
): ValidationResult<z.output<S>> {
  const obj: Record<string, string> = {};
  search.forEach((value, key) => {
    obj[key] = value;
  });
  return validateBody(schema, obj);
}
