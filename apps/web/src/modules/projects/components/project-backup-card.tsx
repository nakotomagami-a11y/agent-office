"use client";

import type { ChangeEvent, RefObject } from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";

export type ProjectBackupCardProps = {
  projectName: string;
  includeHistory: boolean;
  onIncludeHistoryChange: (value: boolean) => void;
  onExport: () => void;
  importing: boolean;
  importStatus: { ok: boolean; msg: string } | null;
  fileInputRef: RefObject<HTMLInputElement | null>;
  onImportFile: (e: ChangeEvent<HTMLInputElement>) => void;
};

/**
 * Export/import card — a two-column real capability, not a mock: export
 * writes an `.agent-office.json` save file, import restores one via the
 * existing `importState` API.
 */
export function ProjectBackupCard({
  projectName,
  includeHistory,
  onIncludeHistoryChange,
  onExport,
  importing,
  importStatus,
  fileInputRef,
  onImportFile,
}: ProjectBackupCardProps) {
  const t = useTranslations();

  return (
    <div className="rounded-[24px] surface-sheen shadow-[var(--lift)] p-[22px]">
      <div className="flex items-center gap-[10px] mb-[18px]">
        <span className="text-[16px] font-bold whitespace-nowrap">Backup &amp; portability</span>
      </div>
      <div className="flex flex-wrap gap-[22px]">
        <div className="flex-1 min-w-[260px] flex flex-col gap-[14px]">
          <div className="flex items-center gap-[13px]">
            <span className="w-[44px] h-[44px] rounded-[13px] flex items-center justify-center shrink-0 text-white shadow-[0_10px_22px_-10px_rgba(139,123,255,0.75)] bg-[linear-gradient(150deg,var(--acc-cta),var(--acc-2))]">
              <Icon name="download" size={19} />
            </span>
            <div className="flex-1 min-w-0 leading-tight">
              <div className="text-[14.5px] font-bold whitespace-nowrap">{t("project_detail.save_card_title")}</div>
              <div className="font-mono text-[10.5px] text-txt-4 overflow-hidden text-ellipsis whitespace-nowrap">
                → {projectName}.agent-office.json
              </div>
            </div>
          </div>
          <label className="flex items-center gap-[9px] px-[12px] py-[9px] rounded-[11px] bg-card-2 border border-edge shadow-[var(--inset-hi)] cursor-pointer">
            <input
              type="checkbox"
              className="hidden"
              checked={includeHistory}
              onChange={(e) => onIncludeHistoryChange(e.target.checked)}
            />
            <span
              className={cn(
                "flex items-center justify-center shrink-0 w-[16px] h-[16px] rounded-[4px] border",
                includeHistory ? "bg-acc text-white border-acc" : "border-edge-2 text-transparent",
              )}
            >
              <Icon name="check" size={10} />
            </span>
            <span className="text-[12px] text-txt-2 whitespace-nowrap">{t("project_detail.save_include_history")}</span>
          </label>
          <button
            type="button"
            onClick={onExport}
            className="self-start flex items-center gap-[8px] px-[18px] py-[10px] rounded-[12px] border-none bg-[linear-gradient(120deg,var(--acc-cta),var(--acc-2))] text-white text-[12.5px] font-bold cursor-pointer whitespace-nowrap shadow-[0_12px_26px_-12px_rgba(139,123,255,0.8)] transition-transform duration-150 hover:-translate-y-[2px]"
          >
            <Icon name="download" size={13} /> {t("project_detail.save_export_button")}
          </button>
        </div>

        <span className="w-px self-stretch bg-edge" />

        <div className="flex-1 min-w-[260px] flex flex-col gap-[14px]">
          <div className="flex items-center gap-[13px]">
            <span className="w-[44px] h-[44px] rounded-[13px] flex items-center justify-center shrink-0 text-cyan bg-[rgba(34,211,238,.14)]">
              <Icon name="upload" size={19} />
            </span>
            <div className="flex-1 min-w-0 leading-tight">
              <div className="text-[14.5px] font-bold whitespace-nowrap">Import project</div>
              <div className="font-mono text-[10.5px] text-txt-4 overflow-hidden text-ellipsis whitespace-nowrap">
                restore a .agent-office.json save file
              </div>
            </div>
          </div>
          <div
            onClick={() => fileInputRef.current?.click()}
            className="flex-1 flex flex-col items-center justify-center gap-[8px] p-[18px] rounded-[13px] bg-card-2 border border-dashed border-edge-2 text-txt-4 cursor-pointer transition-colors duration-150 hover:border-acc-line hover:text-acc hover:bg-acc-soft"
          >
            <span className="w-[32px] h-[32px] rounded-[10px] flex items-center justify-center bg-card-3">
              <Icon name="upload" size={16} />
            </span>
            <span className="font-mono text-[11px] whitespace-nowrap">drop a save file, or click to browse</span>
          </div>
          {importStatus && (
            <span className={`text-[12px] ${importStatus.ok ? "text-green" : "text-red"}`}>{importStatus.msg}</span>
          )}
          <button
            type="button"
            disabled={importing}
            onClick={() => fileInputRef.current?.click()}
            className="self-start flex items-center gap-[8px] px-[16px] py-[9px] rounded-[11px] border border-edge-2 bg-card text-txt-2 text-[12.5px] font-semibold cursor-pointer whitespace-nowrap transition-colors duration-150 hover:text-txt hover:border-txt-4 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <Icon name="folder" size={13} /> {importing ? t("common.loading") : t("project_detail.save_import_button")}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={onImportFile}
          />
        </div>
      </div>
    </div>
  );
}
