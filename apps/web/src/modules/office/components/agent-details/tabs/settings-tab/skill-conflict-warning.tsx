"use client";

import { Icon } from "@/components/ui/icon";
import { peakSeverity, severityClasses, type SkillConflict } from "./skill-format";

/**
 * Compact warning row shown above the skill picker when the currently-selected
 * skill set has known compatibility conflicts. Hover for the full conflict
 * detail (comes from `_skills/_compatibility.json`).
 */
export function SkillConflictWarning({ conflicts }: { conflicts: SkillConflict[] }) {
  if (conflicts.length === 0) return null;
  const sev = peakSeverity(conflicts);
  const detail = conflicts
    .map((c) => `${c.a}  ⇄  ${c.b}  [${c.severity}]\n  ${c.reason}`)
    .join("\n\n");
  const label = conflicts.length === 1 ? "1 conflict" : `${conflicts.length} conflicts`;
  return (
    <div
      className={`flex items-center gap-2 px-[10px] py-[6px] rounded-ao-md border text-[11.5px] font-mono ${severityClasses(sev)}`}
      title={detail}
      role="status"
    >
      <Icon name="shield" size={12} />
      <span>
        <span className="font-semibold">{label}</span> between selected skills — hover to see details
      </span>
    </div>
  );
}
