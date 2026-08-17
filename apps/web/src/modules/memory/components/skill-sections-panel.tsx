"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { useSkillCustomization, useSetSkillSections } from "@/modules/skills/hooks/use-skills";

/**
 * Section toggles for a read-only skill (Phase 1 of skill customization).
 * Unchecking a `##` section drops it from what the agent actually receives
 * (see buildSkillsPrompt). Global: the choice applies to every agent using
 * this skill. Non-destructive — the upstream SKILL.md is never modified, so
 * updates can't clobber it.
 */
export function SkillSectionsPanel({ slug }: { slug: string }) {
  const q = useSkillCustomization(slug);
  const mut = useSetSkillSections(slug);
  const data = q.data;
  if (!data || data.sections.length === 0) return null;

  // Reflect the in-flight toggle immediately for a snappy feel.
  const disabled = new Set(mut.isPending && mut.variables ? mut.variables : data.disabledSections);
  const onCount = data.sections.length - data.sections.filter((s) => disabled.has(s.slug)).length;

  const toggle = (sectionSlug: string, on: boolean) => {
    const next = new Set(data.disabledSections);
    if (on) next.delete(sectionSlug);
    else next.add(sectionSlug);
    mut.mutate([...next]);
  };

  return (
    <div className="mb-3 rounded-[var(--r-md)] border border-line bg-bg-2 p-3">
      <div className="flex items-baseline gap-2 mb-2">
        <span className="text-[12px] font-semibold text-txt">Sections</span>
        <span className="text-[11px] text-txt-3">
          {onCount}/{data.sections.length} on · applies to every agent
        </span>
      </div>
      <div className="flex flex-col gap-1">
        {data.sections.map((s) => (
          <Checkbox
            key={s.slug}
            checked={!disabled.has(s.slug)}
            onChange={(e) => toggle(s.slug, e.target.checked)}
            label={s.heading}
          />
        ))}
      </div>
    </div>
  );
}
