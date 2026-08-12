/**
 * Convert an agent slug into a human-readable display name.
 *
 * Rules (checked in order):
 *   1. Exact overrides — see DISPLAY_OVERRIDES. Used for names that don't fit
 *      the generic rules cleanly (e.g. "cs-boardroom" → "Boardroom", not
 *      "CS BOARDROOM").
 *   2. `cs-<abbrev>` where <abbrev> is 2-4 chars → uppercase the abbrev.
 *      "cs-ceo" → "CEO", "cs-cmo" → "CMO", "cs-cpo" → "CPO".
 *   3. `<base>-<variant>` where variant ∈ {lite, fable, haiku} → "Base (Variant)".
 *      "developer-lite" → "Developer (Lite)", "developer-haiku" → "Developer (Haiku)".
 *   4. Fallback — split on "-", title-case each token, preserve well-known
 *      all-caps abbreviations (QA, UI, UX, AI, API, ML, HR, PM, SEO).
 *
 * The slug itself is still used as the ID everywhere (React keys, URL params,
 * search matching, DB rows). This helper only affects what humans read.
 */

// Explicit overrides for slugs whose default derivation isn't quite right.
// Keep this list SHORT — prefer teaching the rules over accumulating exceptions.
const DISPLAY_OVERRIDES: Record<string, string> = {
  "cs-boardroom": "Boardroom",
  "agent-architect": "Agent Architect",
  "web-qa": "Web QA",
  "qa-codebase": "QA — Codebase",
  "qa-code-review": "QA — Code Review",
  "qa-pen-testing": "QA — Pen Testing",
  "qa-visual": "QA — Visual",
};

// Tokens that should render fully capitalized after splitting on hyphen.
// Extend when a new abbreviation appears in an agent slug.
const ALL_CAPS_TOKENS = new Set([
  "qa", "ui", "ux", "ai", "api", "ml", "hr", "pm", "seo", "cto", "ceo", "cfo",
  "cpo", "cmo", "coo", "chro", "ciso", "gc", "cco", "cdo", "caio",
]);

// Suffixes that mark model/tier variants of a base agent.
const VARIANT_SUFFIXES = new Set(["lite", "fable", "haiku", "opus", "sonnet"]);

/** Title-case a single word, preserving known all-caps tokens. */
function titleCaseToken(token: string): string {
  const lower = token.toLowerCase();
  if (ALL_CAPS_TOKENS.has(lower)) return lower.toUpperCase();
  if (lower.length === 0) return lower;
  return lower[0]!.toUpperCase() + lower.slice(1);
}

/**
 * Format an agent slug for human display.
 *
 * @param slug - The kebab-case agent ID (e.g. "backend-builder", "cs-ceo").
 * @returns A human-readable name, or the slug unchanged if it's empty/invalid.
 */
export function formatAgentDisplayName(slug: string | undefined | null): string {
  if (!slug) return "";
  const trimmed = slug.trim();
  if (!trimmed) return "";

  // Rule 1 — explicit overrides.
  const override = DISPLAY_OVERRIDES[trimmed];
  if (override) return override;

  // Rule 2 — cs-<abbrev>. C-suite roles read best as bare initialisms.
  const csMatch = trimmed.match(/^cs-([a-z]{2,4})$/i);
  if (csMatch) return csMatch[1]!.toUpperCase();

  // Rule 3 — variant suffix ("developer-lite" → "Developer (Lite)").
  const parts = trimmed.split("-");
  if (parts.length === 2 && VARIANT_SUFFIXES.has(parts[1]!.toLowerCase())) {
    return `${titleCaseToken(parts[0]!)} (${titleCaseToken(parts[1]!)})`;
  }

  // Rule 4 — generic hyphen split with title case.
  return parts.map(titleCaseToken).join(" ");
}
