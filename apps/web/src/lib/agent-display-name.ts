/**
 * Human-readable agent names.
 *
 * The real name is a per-agent field (`display-name` frontmatter, editable in
 * agent customization) exposed as `ApiAgent.displayName`. Prefer it via
 * `agentDisplayName(agent)`.
 *
 * `formatAgentDisplayName(slug)` is a dumb, generic FALLBACK for the two cases
 * where no stored name is available: (a) an agent that never set one, and
 * (b) call sites that only have a bare slug (run history, scheduled jobs).
 * It never encodes per-agent knowledge — just slug → title-case with a few
 * well-known abbreviations kept upper.
 */

// Tokens that should render fully capitalized after splitting on hyphen.
const ALL_CAPS_TOKENS = new Set([
  "qa", "ui", "ux", "ai", "api", "ml", "hr", "pm", "seo", "cto", "ceo", "cfo",
  "cpo", "cmo", "coo", "chro", "ciso", "gc", "cco", "cdo", "caio",
]);

// Suffixes that mark model/tier variants of a base agent.
const VARIANT_SUFFIXES = new Set(["lite", "fable", "haiku", "opus", "sonnet"]);

function titleCaseToken(token: string): string {
  const lower = token.toLowerCase();
  if (ALL_CAPS_TOKENS.has(lower)) return lower.toUpperCase();
  if (lower.length === 0) return lower;
  return lower[0]!.toUpperCase() + lower.slice(1);
}

/** Generic slug → readable label. Fallback only; not the source of truth. */
export function formatAgentDisplayName(slug: string | undefined | null): string {
  if (!slug) return "";
  const trimmed = slug.trim();
  if (!trimmed) return "";

  // `cs-<abbrev>` (2-4 chars) reads best as a bare initialism: "cs-ceo" → "CEO".
  const csMatch = trimmed.match(/^cs-([a-z]{2,4})$/i);
  if (csMatch) return csMatch[1]!.toUpperCase();

  // Variant suffix: "developer-lite" → "Developer (Lite)".
  const parts = trimmed.split("-");
  if (parts.length === 2 && VARIANT_SUFFIXES.has(parts[1]!.toLowerCase())) {
    return `${titleCaseToken(parts[0]!)} (${titleCaseToken(parts[1]!)})`;
  }

  return parts.map(titleCaseToken).join(" ");
}

/** Preferred display name for an agent: its stored name, else the slug fallback. */
export function agentDisplayName(agent: { name: string; displayName?: string | null }): string {
  return agent.displayName?.trim() || formatAgentDisplayName(agent.name);
}
