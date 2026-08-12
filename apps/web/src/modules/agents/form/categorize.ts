import type { ApiAgent } from "@agent-office/domain/types";

/**
 * Derive a coarse-grained "department" tag for an agent so the gallery can
 * filter by team. Honours the agent's `room` frontmatter when set, otherwise
 * falls back to name-prefix heuristics. Returns "Other" if nothing matches.
 */
export function categorize(agent: ApiAgent): string {
  if (agent.room && agent.room.trim()) return agent.room.trim();

  const id = agent.name.toLowerCase();
  const skills = agent.skills.map((s) => s.toLowerCase());
  const has = (...words: string[]) => words.some((w) => id.includes(w) || skills.includes(w));

  if (
    id.startsWith("backend-") ||
    id.startsWith("frontend-") ||
    id.startsWith("fullstack-") ||
    id.startsWith("infra-") ||
    has("devops", "refactor")
  ) {
    return "Engineering";
  }
  if (id.startsWith("qa-") || has("qa", "test")) return "QA";
  if (has("design", "a11y") && !id.startsWith("frontend-")) return "Design";
  if (has("ml", "data", "ai", "llm") || id.startsWith("claude-")) return "AI & Data";
  if (has("security", "audit")) return "Security";
  if (has("docs", "scribe", "writer", "release")) return "Docs";
  if (has("marketing", "growth", "seo")) return "Marketing";
  if (has("research", "explorer", "research-deep")) return "Research";
  return "Other";
}

/** Brand color for a department/category tag. Falls back to a neutral grey. */
export function categoryColor(cat: string): string {
  const m: Record<string, string> = {
    Engineering: "#3b82f6", QA: "#10b981", Design: "#ec4899",
    "AI & Data": "#8b5cf6", Security: "#ef4444", Docs: "#f59e0b",
    Marketing: "#f97316", Research: "#06b6d4", Strategy: "#8b5cf6",
    Build: "#e95420",
  };
  return m[cat] ?? "#8A8079";
}

/**
 * Count agents per category. Used by the filter chips to show how many
 * agents are in each bucket.
 */
export function tallyCategories(agents: ApiAgent[]): Record<string, number> {
  const tally: Record<string, number> = {};
  for (const a of agents) {
    const c = categorize(a);
    tally[c] = (tally[c] ?? 0) + 1;
  }
  return tally;
}
