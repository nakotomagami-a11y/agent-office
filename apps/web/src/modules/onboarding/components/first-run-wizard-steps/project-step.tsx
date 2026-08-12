"use client";

import { useTranslations } from "next-intl";
import type { ScannedEntry } from "@agent-office/domain/types";
import { Icon } from "@/components/ui/icon";
import { TextInput } from "@/components/ui/text-input";
import { cn } from "@/lib/cn";

export type ProjectStepProps = {
  candidates: ScannedEntry[];
  loading: boolean;
  root: string;
  chosen: Set<string>;
  onToggle: (entry: ScannedEntry) => void;
  projectName: string;
  onProjectNameChange: (v: string) => void;
};

/** Wizard step 5: pick folders to become projects. Multi-select. */
export function ProjectStep({ candidates, loading, root, chosen, onToggle, projectName, onProjectNameChange }: ProjectStepProps) {
  const t = useTranslations();
  return (
    <section>
      <h3 className="font-semibold m-0 mb-[6px] text-[15px]">{t("first_run.project_title")}</h3>
      <p className="text-txt-3 m-0 mb-[12px] text-[12.5px] leading-[1.5]">{t("first_run.project_hint")}</p>
      <CandidateList loading={loading} candidates={candidates} root={root} chosen={chosen} onToggle={onToggle} />
      {(chosen.size === 1 || (!loading && candidates.length === 0)) ? (
        <ProjectNameField
          projectName={projectName}
          onProjectNameChange={onProjectNameChange}
          label={candidates.length === 0 ? "Project name" : undefined}
          hint={candidates.length === 0 ? `Will be created inside ${root}` : undefined}
        />
      ) : null}
      {candidates.length > 0 ? (
        <p className="text-txt-3 m-0 text-[11.5px] leading-[1.5] mt-2">
          {t("first_run.project_skip_hint")}
        </p>
      ) : null}
    </section>
  );
}

function CandidateList({ loading, candidates, root, chosen, onToggle }: {
  loading: boolean;
  candidates: ScannedEntry[];
  root: string;
  chosen: Set<string>;
  onToggle: (entry: ScannedEntry) => void;
}) {
  const t = useTranslations();
  if (loading) return <p>{t("common.loading")}</p>;
  if (candidates.length === 0) {
    return (
      <p className="bg-bg-2 text-txt-3 px-[16px] py-[16px] rounded-[8px] text-[12.5px] mb-[10px]">
        {t("first_run.project_empty", { root })}
      </p>
    );
  }
  return (
    <div className="flex flex-col overflow-y-auto gap-[4px] max-h-[280px] mb-[10px]">
      {candidates.map((c) => (
        <CandidateRow key={c.id} entry={c} selected={chosen.has(c.id)} onToggle={() => onToggle(c)} />
      ))}
    </div>
  );
}

function CandidateRow({ entry, selected, onToggle }: { entry: ScannedEntry; selected: boolean; onToggle: () => void }) {
  return (
    <label
      className={cn(
        "flex items-center bg-bg-1 border border-line-2 cursor-pointer text-txt gap-[10px] px-[10px] py-[8px] rounded-[8px] text-[13px] hover:bg-bg-2 transition-colors",
        selected && "bg-acc-faint [border-color:var(--acc)]",
      )}
    >
      <input
        type="checkbox"
        className="shrink-0"
        checked={selected}
        onChange={onToggle}
      />
      <Icon name="folder" />
      <div className="min-w-0">
        <div className="font-medium text-[13px]">{entry.name}</div>
        <div className="text-txt-3 text-[11.5px] mt-[2px] leading-[1.4] truncate">{entry.fullPath}</div>
      </div>
    </label>
  );
}

function ProjectNameField({ projectName, onProjectNameChange, label, hint }: {
  projectName: string;
  onProjectNameChange: (v: string) => void;
  label?: string;
  hint?: string;
}) {
  const t = useTranslations();
  return (
    <div className="mt-2.5 mb-[10px]">
      <label className="text-txt-3 m-0 mb-[6px] text-[12.5px] leading-[1.5] block" htmlFor="fr-project-name">
        {label ?? t("first_run.project_name_label")}
      </label>
      <TextInput
        id="fr-project-name"
        value={projectName}
        onChange={(e) => onProjectNameChange(e.target.value)}
        placeholder="My Project"
      />
      {hint ? <p className="text-txt-3 text-[11px] mt-[4px] m-0">{hint}</p> : null}
    </div>
  );
}
