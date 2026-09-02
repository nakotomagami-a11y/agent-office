"use client";

import { useTranslations } from "next-intl";
import type { ScannedEntry } from "@agent-office/domain/types";
import { Icon } from "@/components/ui/icon";

export type RootStepProps = {
  root: string;
  onRootChange: (v: string) => void;
  placeholder: string;
  candidates: ScannedEntry[];
  loading: boolean;
};

/** Wizard step 2: pick the projects-root directory. */
export function RootStep({ root, onRootChange, placeholder, candidates, loading }: RootStepProps) {
  const t = useTranslations();
  const projects = candidates.filter((c) => !c.excluded).slice(0, 2);
  const ignored = candidates.find((c) => c.excluded);
  const showPreview = !loading && root.trim().length > 0 && (projects.length > 0 || ignored);

  return (
    <section>
      <h3 className="m-0 text-[16.5px] font-extrabold tracking-[-0.025em]">{t("first_run.root_title")}</h3>
      <p className="m-0 mt-[6px] max-w-[560px] text-[12.5px] leading-[1.6] text-txt-3 text-pretty">
        {t("first_run.root_hint")}
      </p>

      <div className="mt-4 flex items-center gap-[10px] rounded-2xl border border-edge bg-card-2 px-[14px] py-[11px] focus-within:border-acc">
        <Icon name="folder" size={16} className="shrink-0 text-acc" />
        <input
          value={root}
          onChange={(e) => onRootChange(e.target.value)}
          placeholder={placeholder}
          autoFocus
          className="min-w-0 flex-1 bg-transparent text-[13.5px] font-bold text-txt outline-none"
        />
        <span className="shrink-0 font-mono text-[10.5px] uppercase tracking-[0.06em] text-txt-4">
          {t("first_run.root_field_label")}
        </span>
      </div>
      <p className="m-0 mt-[8px] text-[11.5px] leading-[1.5] text-txt-4">{t("first_run.root_examples")}</p>

      {showPreview ? (
        <div className="mt-[14px] rounded-2xl border border-edge bg-card px-4 py-[13px]">
          <div className="text-[11.5px] font-bold text-txt-2">{t("first_run.root_preview_title")}</div>
          <div className="mt-[8px] flex flex-col gap-[6px]">
            <PreviewRow dot="bg-acc" name={root} tag={t("first_run.root_preview_root_tag")} tagClass="text-txt-4" />
            {projects.map((c) => (
              <PreviewRow
                key={c.id}
                dot="bg-green"
                name={`${c.name}/`}
                tag={t("first_run.root_preview_project_tag")}
                tagClass="text-green"
              />
            ))}
            {ignored ? (
              <PreviewRow
                dot="bg-txt-4"
                name={`${ignored.name}/`}
                tag={t("first_run.root_preview_ignored_tag")}
                tagClass="text-txt-4"
              />
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function PreviewRow({ dot, name, tag, tagClass }: { dot: string; name: string; tag: string; tagClass: string }) {
  return (
    <div className="flex items-center gap-[9px] font-mono text-[11.5px]">
      <span className={`h-[6px] w-[6px] shrink-0 rounded-full ${dot}`} aria-hidden />
      <span className="min-w-0 truncate text-txt-2">{name}</span>
      <span className={`shrink-0 ${tagClass}`}>{tag}</span>
    </div>
  );
}
