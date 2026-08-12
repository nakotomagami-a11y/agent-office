"use client";

import { Icon } from "@/components/ui/icon";
import type { SkillManifestEntry } from "@/modules/skills/hooks/use-skills";
import { SkillCostPill } from "./skill-cost-pill";
import { truncate } from "./skill-format";

export type SkillSuggestionRowProps = {
  entry: SkillManifestEntry;
  active: boolean;
  selected: boolean;
  onPick: () => void;
  id: string;
};

/**
 * Row in the skill autocomplete dropdown. Fixed column layout so every row
 * scans on the same vertical rails regardless of description length or
 * whether the "added" chip is present:
 *
 *   Cost:     w-[44px] right-aligned  → tabular alignment across rows
 *   Slug:     shrink-0                → primary identifier, never wraps
 *   Category: shrink-0                → secondary label, mono-caps
 *   Desc:     flex-1 min-w-0 truncate → absorbs remaining width
 *   Status:   w-[52px] right-aligned  → always occupies the slot even when
 *                                        empty, so no reflow between added /
 *                                        not-added rows
 */
export function SkillSuggestionRow({ entry, active, selected, onPick, id }: SkillSuggestionRowProps) {
  return (
    <button
      id={id}
      type="button"
      role="option"
      aria-selected={active}
      onMouseDown={(e) => { e.preventDefault(); onPick(); }}
      className={[
        // pl-[14px] gives the leading cost pill breathing room from the row's
        // left edge (was pinned tight against px-[10px] which read as flush).
        "flex items-center gap-[10px] w-full text-left pl-[14px] pr-[10px] py-[6px] rounded-[5px]",
        "transition-[background-color] duration-[80ms]",
        active
          ? "bg-[var(--ao-accent-soft)] [box-shadow:inset_0_0_0_1px_var(--ao-accent-line)]"
          : "hover:bg-ao-bg-3",
        selected ? "text-ao-fg-2" : "",
      ].join(" ")}
    >
      <span className="w-[44px] shrink-0 flex justify-end">
        <SkillCostPill entry={entry} />
      </span>
      <span className={`font-mono text-[12px] shrink-0 ${selected ? "text-ao-fg-2" : "text-ao-fg-0"}`}>
        {entry.slug}
      </span>
      {entry.category ? (
        <span className="font-mono text-[9.5px] text-ao-fg-3 uppercase tracking-[0.08em] shrink-0">
          {entry.category}
        </span>
      ) : null}
      <span className="text-[11.5px] text-ao-fg-2 truncate flex-1 min-w-0">
        {truncate(entry.description, 60)}
      </span>
      <span className="w-[52px] shrink-0 flex items-center justify-end">
        {selected ? (
          <span className="inline-flex items-center gap-[3px] text-[10px] font-mono uppercase tracking-[0.06em] text-[var(--ao-accent)]">
            <Icon name="check" size={10} /> added
          </span>
        ) : null}
      </span>
    </button>
  );
}
