// Pure presentation helpers for the Claude limits modal.

export const fmtUSD = (n: number, dec = 2): string => `$${n.toFixed(dec)}`;
export const fmtTok = (n: number): string => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));

export function modelLabel(raw: string): { name: string; sub: string } {
  const exact: Record<string, { name: string; sub: string }> = {
    "sonnet":              { name: "Sonnet",       sub: "claude-sonnet-4" },
    "opus":                { name: "Opus",          sub: "claude-opus-4" },
    "haiku":               { name: "Haiku",         sub: "claude-haiku-4" },
    "default":             { name: "Unknown",       sub: "model not captured" },
    "unknown":             { name: "Unknown",       sub: "model not captured" },
  };
  if (exact[raw]) return exact[raw];
  // claude-{family}-{version} full IDs → e.g. "claude-opus-4-7" → "Opus 4.7"
  const m = raw.match(/^claude-([a-z]+)-([\d]+)(?:-([\d]+))?/i);
  if (m) {
    const family = m[1]!.charAt(0).toUpperCase() + m[1]!.slice(1);
    const ver = m[3] ? `${m[2]}.${m[3]}` : m[2]!;
    return { name: `${family} ${ver}`, sub: raw };
  }
  return { name: raw, sub: raw };
}

export function modelBarGradient(modelId: string): string {
  const id = modelId.toLowerCase();
  if (id.includes("sonnet")) return "linear-gradient(90deg, #b6b3ff, #7a76e0)";
  if (id.includes("haiku"))  return "linear-gradient(90deg, #80e1c5, #2e8f73)";
  if (id.includes("opus"))   return "linear-gradient(90deg, #ffd591, #f0a548)";
  return "linear-gradient(90deg, color-mix(in oklab, var(--ao-accent) 80%, white), var(--ao-accent))";
}
