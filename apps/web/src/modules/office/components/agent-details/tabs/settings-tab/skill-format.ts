import type { SkillManifestEntry, SkillCompatibility } from "@/modules/skills/hooks/use-skills";

/**
 * Pure formatting + filtering helpers for the agent-settings skill picker.
 * Kept out of the component per CLAUDE.md (logic in `format/`-style modules,
 * components stay presentational).
 */

export function formatTokenCost(n: number | undefined): string {
  if (!n || n <= 0) return "";
  if (n < 1000) return String(n);
  return `${(n / 1000).toFixed(1)}k`;
}

export function truncate(s: string | undefined, n: number): string {
  if (!s) return "";
  return s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s;
}

/**
 * Substring match across slug + category + description. Empty query returns
 * every entry unchanged so the caller can render the full manifest.
 */
export function filterSkillEntries(entries: SkillManifestEntry[], query: string): SkillManifestEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return entries;
  return entries.filter((e) => {
    if (e.slug.toLowerCase().includes(q)) return true;
    if (e.category && e.category.toLowerCase().includes(q)) return true;
    if (e.description && e.description.toLowerCase().includes(q)) return true;
    return false;
  });
}

// ── Cost pill tier styling ─────────────────────────────────────────────────
//
// Inline styles instead of Tailwind classes: dynamic emerald/amber/orange/red
// utility classes are not always emitted into the built stylesheet, so tier
// signals silently disappeared. Inline style bypasses that entirely.

export type TierStyle = {
  color: string;
  background: string;
  boxShadow: string;
};

export function tierPillStyle(tier: string | undefined): TierStyle {
  const make = (rgb: string, fg: string): TierStyle => ({
    color: fg,
    background: `rgba(${rgb}, 0.12)`,
    boxShadow: `inset 0 0 0 1px rgba(${rgb}, 0.55)`,
  });
  switch (tier) {
    case "low":     return make("16, 185, 129", "#6ee7b7"); // emerald-300
    case "medium":  return make("245, 158, 11", "#fcd34d"); // amber-300
    case "high":    return make("249, 115, 22", "#fdba74"); // orange-300
    case "extreme": return make("239, 68, 68",  "#fca5a5"); // red-300
    default:        return make("100, 116, 139", "var(--ao-fg-2)"); // slate-500
  }
}

// ── Skill compatibility ────────────────────────────────────────────────────

export type ConflictSeverity = "low" | "medium" | "high";

export type SkillConflict = {
  a: string;
  b: string;
  severity: ConflictSeverity;
  reason: string;
};

export function isConflict(raw: unknown): raw is SkillConflict {
  if (!raw || typeof raw !== "object") return false;
  const o = raw as Record<string, unknown>;
  const sev = o.severity;
  return (
    typeof o.a === "string" &&
    typeof o.b === "string" &&
    typeof o.reason === "string" &&
    (sev === "low" || sev === "medium" || sev === "high")
  );
}

export function findActiveConflicts(
  selected: string[],
  compat: SkillCompatibility | undefined,
): SkillConflict[] {
  if (!compat || !Array.isArray(compat.conflicts) || selected.length < 2) return [];
  const selectedSet = new Set(selected);
  return compat.conflicts.filter(isConflict).filter((c) => selectedSet.has(c.a) && selectedSet.has(c.b));
}

/** Highest severity in a conflict set — drives the warning row's color. */
export function peakSeverity(conflicts: SkillConflict[]): ConflictSeverity {
  if (conflicts.some((c) => c.severity === "high")) return "high";
  if (conflicts.some((c) => c.severity === "medium")) return "medium";
  return "low";
}

export function severityClasses(sev: ConflictSeverity): string {
  switch (sev) {
    case "high":   return "bg-[rgba(217,83,79,0.10)] border-[rgba(217,83,79,0.35)] text-ao-bad";
    case "medium": return "bg-[var(--ao-warn-soft)] border-[rgba(230,179,90,0.35)] text-[var(--ao-warn)]";
    case "low":    return "bg-[rgba(230,179,90,0.06)] border-[rgba(230,179,90,0.22)] text-[var(--ao-warn)]";
  }
}
