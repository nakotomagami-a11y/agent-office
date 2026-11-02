/**
 * Sanitisers for text a CLONED REPO authors — `.ao.json`, `package.json`, branch
 * names, script names. It reaches the system prompt of an agent spawned with
 * bypassPermissions, so it is DATA, never markup. Shared rather than copied per
 * caller: a weaker copy in one of them is the whole bug class.
 */

/** At most `max` UTF-16 units, never splitting a surrogate pair. */
function cut(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, /[\uD800-\uDBFF]/.test(s[max - 1]!) ? max - 1 : max);
}

/** `Cs` too: a lone surrogate already in the value renders as a replacement
 *  char and defeats `cut`'s pair check. */
export function clean(s: string, max = 80): string {
  return cut(s.replace(/[\p{Cc}\p{Cf}\p{Cs}]/gu, " "), max).trim();
}

/** GFM links these unaided, so stripping `[`/`]` does not cover a heading. */
const LINKIFIERS = [/\b[a-z][a-z0-9+.-]*:\/\//gi, /\bwww\./gi, /[\w.+-]+@[\w-]+\.[\w.-]+/g];

/**
 * Inert in a heading, a table cell and a prompt line alike: structural markup,
 * anything a renderer auto-links, and Minecraft's `§` format codes all go. U+2028/9
 * survive the `Cf` strip but `\s+` eats them.
 */
export function inert(s: string, max: number): string {
  let out = clean(s, max);
  for (const re of LINKIFIERS) out = out.replace(re, " ");
  return out.replace(/[|<>`[\]*_~§]/g, " ").replace(/\s+/g, " ").trim();
}
