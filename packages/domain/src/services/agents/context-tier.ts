// Context tiering — decide whether a piece of context is worth its residency.
//
// `PromptSegment.phase` has carried `"always" | "first-turn"` since the type was
// written, and every segment was hardcoded `"always"`: the data model knew
// context should be tiered and the assembler ignored it.
//
// The rule is the one the skills classifier already proved: small things are
// inlined, large things become a one-line pointer the agent reads on demand.
// A pointer costs ~100 chars instead of several KB, and unlike an inlined blob
// it cannot go stale — the file is read at the moment it is needed.

/** Above this, a body is referenced rather than inlined. Matches the skills
 *  classifier's threshold so the two tiers behave identically. */
export const INLINE_MAX_CHARS = 1500;

export type Tier = "inline" | "pointer";

export interface TieredBody {
  tier: Tier;
  /** What goes into the prompt: the body itself, or a pointer line. */
  text: string;
  /** Characters this contributes — the point of the exercise. */
  chars: number;
  /** Characters saved by pointing instead of inlining. 0 when inlined. */
  saved: number;
}

/**
 * Inline `body`, or replace it with a pointer to `path`.
 *
 * `label` names the thing ("Agent memory"); `why` tells the agent when reading
 * it is worth a turn. Without that, a pointer is just a missing section.
 */
export function tierBody(opts: {
  body: string;
  path: string;
  label: string;
  why: string;
  maxChars?: number;
}): TieredBody {
  const body = opts.body.trim();
  const max = opts.maxChars ?? INLINE_MAX_CHARS;
  if (body.length === 0) return { tier: "inline", text: "", chars: 0, saved: 0 };
  if (body.length <= max) {
    return { tier: "inline", text: body, chars: body.length, saved: 0 };
  }
  const text =
    `${opts.label} is large (${body.length.toLocaleString()} chars) and is not loaded by default.\n` +
    `Read it when ${opts.why}: \`${opts.path}\``;
  return { tier: "pointer", text, chars: text.length, saved: body.length - text.length };
}
