// Doc category catalog — the fixed set of categories a /docs entry can carry.
// Runtime const + derived type + guard live together (mirrors config/run-errors).
export const DOC_CATEGORIES = [
  "architecture",
  "plan",
  "notes",
  "postmortem",
  "context",
  "reference",
] as const;

export type DocCategory = (typeof DOC_CATEGORIES)[number];

export function isDocCategory(v: unknown): v is DocCategory {
  return typeof v === "string" && (DOC_CATEGORIES as readonly string[]).includes(v);
}
