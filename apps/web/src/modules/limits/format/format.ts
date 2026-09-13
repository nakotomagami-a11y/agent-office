// Pure presentation helpers for the Claude limits modal.

import { resolveModelAlias, familyOf } from "@agent-office/domain/config/models";

export const fmtUSD = (n: number, dec = 2): string => `$${n.toFixed(dec)}`;
export const fmtTok = (n: number): string => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));

const GENERIC_GRADIENT = "linear-gradient(90deg, color-mix(in oklab, var(--ao-accent) 80%, white), var(--ao-accent))";

export function modelLabel(raw: string): { name: string; sub: string } {
  if (raw === "default" || raw === "unknown") return { name: "Unknown", sub: "model not captured" };
  // Bare alias ("sonnet"/"opus"/"haiku"/"fable") → the catalog's deliberately
  // vague generic sub (we don't know which exact version ran from this alone).
  const exact = resolveModelAlias(raw);
  if (exact) return { name: exact.label, sub: exact.genericSub };
  // claude-{family}-{version} full IDs → e.g. "claude-opus-4-7" → "Opus 4.7"
  // (a precise version the catalog may not even know about yet, e.g. a
  // deprecated release — this regex fallback stays generic on purpose).
  const m = raw.match(/^claude-([a-z]+)-([\d]+)(?:-([\d]+))?/i);
  if (m) {
    const family = m[1]!.charAt(0).toUpperCase() + m[1]!.slice(1);
    const ver = m[3] ? `${m[2]}.${m[3]}` : m[2]!;
    return { name: `${family} ${ver}`, sub: raw };
  }
  return { name: raw, sub: raw };
}

export function modelBarGradient(modelId: string): string {
  return familyOf(modelId)?.gradient ?? GENERIC_GRADIENT;
}
