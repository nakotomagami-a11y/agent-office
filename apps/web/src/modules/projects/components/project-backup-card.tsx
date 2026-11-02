"use client";

import { useState, type ChangeEvent, type DragEvent, type RefObject } from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";

export type ProjectBackupCardProps = {
  onExport: () => void;
  exportFileName: string;
  exportError: string | null;
  /** Session-local: true once an export succeeded since the page mounted. */
  exported: boolean;
  importing: boolean;
  importStatus: { ok: boolean; msg: string } | null;
  fileInputRef: RefObject<HTMLInputElement | null>;
  onImportFile: (e: ChangeEvent<HTMLInputElement>) => void;
  onDropFile: (file: File) => void;
};

const TILE = "flex flex-col justify-center p-[16px] rounded-[16px] bg-card-2 min-w-0";

function TileIcon({ src }: { src: string }) {
  return (
    <span className="w-[64px] h-[64px] flex items-center justify-center shrink-0">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" className="max-w-full max-h-full object-contain [image-rendering:pixelated]" />
    </span>
  );
}

function TileText({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="flex-1 min-w-0 flex flex-col gap-[2px]">
      <span className="text-[13.5px] font-bold whitespace-nowrap">{title}</span>
      <span className="font-mono text-[10.5px] text-txt-4 overflow-hidden text-ellipsis whitespace-nowrap">{sub}</span>
    </div>
  );
}

/**
 * Export/import card: export writes an `.agent-office.json` save file, import restores one through
 * `importState`. A file dragged anywhere over the card can be dropped to import.
 */
export function ProjectBackupCard({
  onExport,
  exportFileName,
  exportError,
  exported,
  importing,
  importStatus,
  fileInputRef,
  onImportFile,
  onDropFile,
}: ProjectBackupCardProps) {
  const t = useTranslations();
  const [dragging, setDragging] = useState(false);
  const browse = () => {
    if (!importing) fileInputRef.current?.click();
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    if (!e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
    if (!dragging) setDragging(true);
  };
  // dragleave also fires when the pointer moves onto a child; only leaving the card counts.
  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
  };
  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && !importing) onDropFile(file);
  };

  return (
    <div
      onDragEnter={handleDragOver}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="relative rounded-[24px] surface-sheen shadow-[var(--lift)] px-[22px] py-[20px] flex flex-col gap-[16px]"
    >
      <div className="flex items-center gap-[12px]">
        <span className="text-[16px] font-bold whitespace-nowrap">Backup &amp; portability</span>
        <span className="font-mono text-[11px] font-semibold px-[8px] py-[3px] rounded-full bg-card-3 text-txt-3 whitespace-nowrap">
          {t(exported ? "project_detail.backup_status_exported" : "project_detail.backup_status_none")}
        </span>
      </div>

      <div className="flex flex-wrap gap-[12px]">
        <div className="flex-1 basis-[340px] min-w-0 flex flex-col gap-[8px]">
          <div className={cn(TILE, "flex-1 border border-edge shadow-[var(--inset-hi)]")}>
            <div className="flex items-center gap-[12px] min-w-0">
              <TileIcon src="/icons/tome-backup.png" />
              <TileText title={t("project_detail.save_card_title")} sub={`→ ${exportFileName}`} />
              <button
                type="button"
                onClick={onExport}
                className="shrink-0 h-[32px] px-[14px] flex items-center gap-[7px] border-none rounded-[10px] bg-[linear-gradient(120deg,var(--acc-cta),var(--acc-2))] text-white font-[inherit] text-[12.5px] font-bold cursor-pointer whitespace-nowrap shadow-[0_12px_26px_-12px_rgba(139,123,255,.8)] transition-[filter] duration-150 hover:brightness-110 focus-visible:outline-2 focus-visible:outline-acc focus-visible:outline-offset-2"
              >
                <Icon name="download" size={13} />
                {t("project_detail.save_export_button")}
              </button>
            </div>
          </div>
          {exportError && <p role="alert" className="m-0 px-[4px] text-[12px] leading-[1.5] text-red">{exportError}</p>}
        </div>

        <div className="flex-1 basis-[340px] min-w-0 flex flex-col gap-[8px]">
          <div
            onClick={browse}
            className={cn(
              TILE,
              "flex-1 border border-dashed border-edge-2 cursor-pointer transition-all duration-150 hover:border-acc-line hover:bg-acc-soft",
              importing && "cursor-progress",
            )}
          >
            <div className="flex items-center gap-[12px] min-w-0">
              <TileIcon src="/icons/tome-import.png" />
              <TileText title={t("project_detail.import_card_title")} sub={t("project_detail.import_card_sub")} />
              <button
                type="button"
                disabled={importing}
                onClick={(e) => {
                  e.stopPropagation();
                  browse();
                }}
                className="shrink-0 h-[32px] px-[14px] flex items-center gap-[7px] rounded-[10px] border border-edge-2 bg-card text-txt-2 font-[inherit] text-[12.5px] font-semibold cursor-pointer whitespace-nowrap transition-colors duration-150 hover:text-txt hover:border-txt-4 disabled:opacity-60 disabled:cursor-progress focus-visible:outline-2 focus-visible:outline-acc focus-visible:outline-offset-2"
              >
                <Icon name="folder" size={13} />
                {importing ? t("common.loading") : t("project_detail.save_import_button")}
              </button>
            </div>
          </div>
          {importStatus && (
            <p role={importStatus.ok ? "status" : "alert"} className={cn("m-0 px-[4px] text-[12px] leading-[1.5]", importStatus.ok ? "text-green" : "text-red")}>
              {importStatus.msg}
            </p>
          )}
          <input ref={fileInputRef} type="file" accept=".json,application/json" className="hidden" onChange={onImportFile} />
        </div>
      </div>

      {dragging && (
        <div className="absolute inset-[6px] rounded-[19px] border-[1.5px] border-dashed border-acc bg-[color-mix(in_srgb,var(--acc)_14%,var(--card))] flex flex-col items-center justify-center gap-[10px] pointer-events-none animate-[aoFade_120ms_ease-out]">
          <span className="w-[44px] h-[44px] rounded-[14px] flex items-center justify-center bg-acc text-white">
            <Icon name="upload" size={20} />
          </span>
          <span className="text-[14px] font-bold">{t("project_detail.import_drop_title")}</span>
          <span className="font-mono text-[10.5px] text-txt-3">{t("project_detail.import_drop_sub")}</span>
        </div>
      )}
    </div>
  );
}
