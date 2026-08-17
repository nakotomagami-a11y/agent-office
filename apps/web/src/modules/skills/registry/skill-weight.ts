import type { RegistrySkill } from "@agent-office/domain/types";

/**
 * Skill "weight" — how much context/token cost a skill carries when the agent
 * loads it. Derived from the `SKILL.md` byte size the GitHub tree API reports at
 * scan time (~4 bytes per token). Tiers mirror the manifest's cost_indicator_scale:
 *   🟢 low <500 · 🟡 medium 500–2000 · 🟠 high 2000–5000 · 🔴 extreme >5000 tokens.
 */
export type WeightTier = "low" | "medium" | "high" | "extreme";

export interface SkillWeight {
  tokens: number;
  tier: WeightTier;
  /** Short label, e.g. "820" or "1.2k". */
  label: string;
  /** Tailwind token classes for the tier colour. */
  dotClass: string;
  textClass: string;
  /** Full human sentence for the tooltip. */
  title: string;
}

const TIER_META: Record<WeightTier, { word: string; range: string; dotClass: string; textClass: string }> = {
  low: { word: "Light", range: "< 500 tokens", dotClass: "bg-ao-ok", textClass: "text-ao-ok" },
  medium: { word: "Medium", range: "500–2,000 tokens", dotClass: "bg-ao-warn", textClass: "text-ao-warn" },
  high: { word: "Heavy", range: "2,000–5,000 tokens", dotClass: "bg-status-thinking", textClass: "text-status-thinking" },
  extreme: { word: "Extreme", range: "> 5,000 tokens", dotClass: "bg-ao-bad", textClass: "text-ao-bad" },
};

function tierFor(tokens: number): WeightTier {
  if (tokens < 500) return "low";
  if (tokens < 2000) return "medium";
  if (tokens < 5000) return "high";
  return "extreme";
}

function formatTokens(tokens: number): string {
  if (tokens < 1000) return String(tokens);
  return `${(tokens / 1000).toFixed(tokens < 10_000 ? 1 : 0)}k`;
}

/** Estimate a skill's weight, or null if size isn't known yet (stale cache). */
export function skillWeight(skill: Pick<RegistrySkill, "size">): SkillWeight | null {
  if (!skill.size || skill.size <= 0) return null;
  const tokens = Math.round(skill.size / 4);
  const tier = tierFor(tokens);
  const meta = TIER_META[tier];
  return {
    tokens,
    tier,
    label: formatTokens(tokens),
    dotClass: meta.dotClass,
    textClass: meta.textClass,
    title: `${meta.word} skill · ≈${tokens.toLocaleString()} tokens (${meta.range} per load)`,
  };
}
