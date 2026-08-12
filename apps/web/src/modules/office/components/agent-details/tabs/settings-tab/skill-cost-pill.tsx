"use client";

import type { SkillManifestEntry } from "@/modules/skills/hooks/use-skills";
import { formatTokenCost, tierPillStyle } from "./skill-format";

/**
 * Compact token-cost pill. Layout / typography come from Tailwind utilities;
 * tier color is applied via inline style so Tailwind class extraction issues
 * can't ghost the signal. See skill-format.tierPillStyle for the rationale.
 */
export function SkillCostPill({ entry }: { entry: SkillManifestEntry | undefined }) {
  if (!entry) return null;
  const cost = formatTokenCost(entry.token_cost_est);
  if (!cost) return null;
  const emoji = entry.impact_emoji ?? "";
  const style = tierPillStyle(entry.impact_tier);
  const title = `${entry.impact_tier ?? "impact"} · ~${entry.token_cost_est ?? 0} tokens/invocation${entry.workflow_depth ? ` · ${entry.workflow_depth}` : ""}`;
  return (
    <span
      className="inline-flex items-center gap-[4px] text-[10.5px] font-mono tabular-nums rounded-full px-2 py-0.5 leading-none"
      style={style}
      title={title}
    >
      {emoji && <span>{emoji}</span>}
      <span>{cost}</span>
    </span>
  );
}
