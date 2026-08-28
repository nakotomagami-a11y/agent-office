"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ModalShell } from "@/components/ui/modal-shell";
import { MemoryEditor } from "@/modules/memory/components/memory-editor";
import { useUpdateProject } from "../hooks/use-projects";

export type ProjectMemoryCardProps = {
  projectId: string;
  memory: string;
};

/**
 * Compact project-memory preview card, matching the mock: a dashed box that
 * shows either the placeholder (empty) or a 2-line ellipsis of the real
 * memory, plus an "Edit" link that opens the full `MemoryEditor` in a modal
 * where there's actually room to read and write it. Embedding the editor
 * inline (previous version) squashed it into an unusable sliver.
 *
 * Project memory is a DB column (`projects.memory`), not a file, so the save
 * just PUTs the project.
 */
export function ProjectMemoryCard({ projectId, memory }: ProjectMemoryCardProps) {
  const t = useTranslations();
  const update = useUpdateProject();
  const [editing, setEditing] = useState(false);

  const hasContent = memory.trim().length > 0;

  return (
    <div className="flex-1 rounded-[24px] surface-sheen shadow-[var(--lift)] px-[22px] py-[20px] flex flex-col">
      <div className="flex items-center gap-[10px]">
        <span className="text-[16px] font-bold whitespace-nowrap">Project memory</span>
        <span
          className={`text-[10.5px] font-bold px-[8px] py-[3px] rounded-full whitespace-nowrap shrink-0 ${
            hasContent ? "bg-acc-soft text-acc" : "bg-card-3 text-txt-4"
          }`}
        >
          {hasContent ? "SET" : "EMPTY"}
        </span>
        <span className="flex-1" />
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-[12.5px] font-semibold text-acc cursor-pointer bg-transparent border-none whitespace-nowrap"
        >
          Edit
        </button>
      </div>

      <button
        type="button"
        onClick={() => setEditing(true)}
        className="flex-1 mt-[14px] p-[14px] rounded-[15px] bg-card-2 border border-dashed border-edge-2 text-left cursor-pointer transition-colors duration-150 hover:border-acc-line"
      >
        <p
          className={`m-0 font-mono text-[11.5px] leading-[1.65] overflow-hidden ${hasContent ? "text-txt-2" : "text-txt-4"}`}
          style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}
        >
          {hasContent ? memory.trim() : "Project-wide context that prepends to every agent prompt."}
        </p>
      </button>

      {editing && (
        <ModalShell open onClose={() => setEditing(false)} bareContent maxWidth={720} className="rounded-[26px] h-[80vh] max-h-[720px]">
          <div className="flex items-center gap-[12px] px-[24px] py-[20px] border-b border-edge shrink-0">
            <span className="text-[17px] font-bold whitespace-nowrap">Project memory</span>
            <span className="font-mono text-[11px] text-txt-4">prepended to every agent prompt</span>
            <span className="flex-1" />
            <button
              type="button"
              onClick={() => setEditing(false)}
              aria-label="Close"
              className="w-[32px] h-[32px] flex items-center justify-center rounded-[10px] border-none bg-transparent text-txt-3 cursor-pointer transition-colors duration-150 hover:bg-card-2 hover:text-txt"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          </div>
          <div className="flex-1 min-h-0 flex flex-col">
            <MemoryEditor
              value={memory}
              onSave={(content) => update.mutateAsync({ id: projectId, patch: { memory: content } })}
              placeholder={t("project_detail.memory_placeholder")}
              scopeLabel="project memory"
              frameless
            />
          </div>
        </ModalShell>
      )}
    </div>
  );
}
