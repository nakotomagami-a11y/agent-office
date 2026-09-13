// Local, zero-dependency token estimate — NOT a real tokenizer. Anthropic's
// actual count comes from `POST /v1/messages/count_tokens`, but that's a
// network call keyed to a specific account's credentials, so it doesn't fit
// a synchronous "what does my system prompt look like" breakdown. This is a
// fast, good-enough approximation using the commonly-cited ~4 characters per
// token rule of thumb for English/code content — good enough to compare
// sections against each other and spot what's heavy, not to bill against.
export function estimateTokens(text: string): number {
  return estimateTokensFromChars(text.length);
}

/** Same estimate, for a caller that already has a char count (e.g. a skill's
 *  resolved body measured elsewhere) and would otherwise have to materialize
 *  a same-length string just to call `estimateTokens`. */
export function estimateTokensFromChars(chars: number): number {
  return chars > 0 ? Math.max(1, Math.round(chars / 4)) : 0;
}
