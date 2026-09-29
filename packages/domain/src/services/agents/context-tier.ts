// Is a piece of context worth its residency? Small bodies are inlined, large
// ones become a pointer read on demand — the rule the skills classifier already
// proved. A pointer also cannot go stale: the file is read when it is needed.

/** Matches the skills classifier so both tiers behave identically. */
export const INLINE_MAX_CHARS = 1500;

export type Tier = "inline" | "pointer";

export interface TieredBody {
  tier: Tier;
  text: string;
  chars: number;
  /** Characters kept out of context. 0 when inlined. */
  saved: number;
}

/** `why` tells the agent when reading it is worth a turn — without it, a
 *  pointer is just a missing section. */
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
