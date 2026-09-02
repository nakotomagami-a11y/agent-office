"use client";

import { useTranslations } from "next-intl";
import type { ScannedEntry } from "@agent-office/domain/types";
import { Checkbox } from "@/components/ui/checkbox";
import { Icon } from "@/components/ui/icon";
import { relativeTime } from "@/modules/projects/format/format";
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

/** Wizard step 6: pick folders to become projects. Multi-select. */
export function ProjectStep({ candidates, loading, root, chosen, onToggle, projectName, onProjectNameChange }: ProjectStepProps) {
  const t = useTranslations();
  return (
    <section>
      <h3 className="m-0 text-[16.5px] font-extrabold tracking-[-0.025em]">{t("first_run.project_title")}</h3>
      <p className="m-0 mt-[6px] max-w-[560px] text-[12.5px] leading-[1.6] text-txt-3 text-pretty">
        {t("first_run.project_hint")}
      </p>

      <CandidateList loading={loading} candidates={candidates} root={root} chosen={chosen} onToggle={onToggle} />

      {(chosen.size === 1 || (!loading && candidates.length === 0)) ? (
        <ProjectNameField
          projectName={projectName}
          onProjectNameChange={onProjectNameChange}
          hint={candidates.length === 0 ? t("first_run.project_name_hint", { root }) : undefined}
        />
      ) : null}

      <p className="m-0 mt-[14px] text-[11.5px] leading-[1.6] text-txt-4">{t("first_run.project_skip_hint")}</p>
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
  if (loading) return <p className="mt-4 text-[12.5px] text-txt-3">{t("common.loading")}</p>;
  if (candidates.length === 0) {
    return (
      <p className="mt-4 rounded-2xl border border-edge bg-card px-4 py-[13px] text-[12.5px] text-txt-3">
        {t("first_run.project_empty", { root })}
      </p>
    );
  }
  return (
    <div className="mt-4 flex max-h-[280px] flex-col gap-[5px] overflow-y-auto">
      {candidates.map((c) => (
        <CandidateRow key={c.id} entry={c} selected={chosen.has(c.id)} onToggle={() => onToggle(c)} />
      ))}
    </div>
  );
}

function CandidateRow({ entry, selected, onToggle }: { entry: ScannedEntry; selected: boolean; onToggle: () => void }) {
  const t = useTranslations();
  return (
    <label
      className={cn(
        "flex cursor-pointer items-center gap-[11px] rounded-2xl border px-[13px] py-[10px] transition-colors",
        selected ? "border-acc-line bg-acc-soft" : "border-edge bg-card",
      )}
    >
      <Checkbox checked={selected} onChange={onToggle} />
      <Icon name="folder" size={15} className={selected ? "shrink-0 text-acc" : "shrink-0 text-txt-4"} />
      <div className="min-w-0 flex-1">
        <div className="text-[12.5px] font-bold">{entry.name}</div>
        <div className="mt-[2px] truncate font-mono text-[10.5px] text-txt-4">{entry.fullPath}</div>
      </div>
      <span className="shrink-0 font-mono text-[10px] text-txt-4">
        {entry.hasGit ? `git · ${relativeTime(entry.mtimeMs)}` : t("first_run.project_no_git")}
      </span>
    </label>
  );
}

function ProjectNameField({ projectName, onProjectNameChange, hint }: {
  projectName: string;
  onProjectNameChange: (v: string) => void;
  hint?: string;
}) {
  const t = useTranslations();
  return (
    <div className="mt-[14px]">
      <label className="mb-[7px] block text-[11.5px] font-semibold text-txt-3" htmlFor="fr-project-name">
        {t("first_run.project_name_label")}
      </label>
      <input
        id="fr-project-name"
        value={projectName}
        onChange={(e) => onProjectNameChange(e.target.value)}
        placeholder="My Project"
        className="w-full rounded-2xl border border-edge bg-card-2 px-[14px] py-[11px] text-[13.5px] font-bold text-txt outline-none focus:border-acc"
      />
      {hint ? <p className="m-0 mt-[4px] text-[11px] text-txt-4">{hint}</p> : null}
    </div>
  );
}
