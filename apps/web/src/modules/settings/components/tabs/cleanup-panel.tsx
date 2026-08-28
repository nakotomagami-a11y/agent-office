"use client";

/**
 * Cleanup panel — surgical resets. Each row runs its own confirm flow
 * (idle -> confirming -> done) inline; "Everything" is hoisted into its own
 * danger footer and gated by typing ERASE, since it also wipes analytics.
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Icon, type IconName } from "@/components/ui/icon";
import { cn } from "@/lib/cn";
import { useCleanup, type CleanupKind } from "../../hooks/use-cleanup";

interface CleanupRow {
  kind: CleanupKind;
  /** Underscored `kind`, used as the `row_<key>_label`/`row_<key>_desc`
   *  i18n key stem — `kind` itself can't be a key segment as-is (hyphens). */
  key: string;
  icon: IconName;
}

const ROWS: CleanupRow[] = [
  { kind: "transcripts", key: "transcripts", icon: "eye" },
  { kind: "drafts", key: "drafts", icon: "pen" },
  { kind: "orphaned-runs", key: "orphaned_runs", icon: "refresh" },
  { kind: "agent-memory", key: "agent_memory", icon: "memory" },
  { kind: "user-analysis", key: "user_analysis", icon: "identity" },
  { kind: "skill-cache", key: "skill_cache", icon: "sparkle" },
  { kind: "ui-settings", key: "ui_settings", icon: "settings" },
];

type RowState = "idle" | "confirming" | "done";

function CleanupRowView({ row }: { row: CleanupRow }) {
  const t = useTranslations("cleanup_panel");
  const cleanup = useCleanup();
  const [state, setState] = useState<RowState>("idle");

  const run = () => {
    cleanup.mutate(row.kind, {
      onSuccess: () => {
        setState("done");
        setTimeout(() => setState("idle"), 1500);
      },
      onError: () => setState("idle"),
    });
  };

  return (
    <div className="flex items-center gap-[13px] px-[20px] py-[13px] border-b border-edge transition-colors duration-150 hover:bg-card-2">
      <span className="w-[30px] h-[30px] shrink-0 flex items-center justify-center rounded-[10px] bg-card-2 shadow-[inset_0_0_0_1px_var(--edge)] text-txt-4">
        <Icon name={row.icon} size={13} />
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-bold whitespace-nowrap">{t(`row_${row.key}_label`)}</div>
        <div className="text-[11px] leading-[1.5] text-txt-4 mt-[3px] text-pretty">{t(`row_${row.key}_desc`)}</div>
      </div>
      <div className="flex items-center gap-[6px] shrink-0">
        {state === "done" ? (
          <span className="flex items-center gap-[7px] py-[7px] px-[13px] rounded-[11px] bg-green-soft text-green text-[11.5px] font-bold whitespace-nowrap">
            <Icon name="check" size={11} /> {t("cleared")}
          </span>
        ) : state === "confirming" ? (
          <>
            <span className="text-[11px] font-semibold text-red whitespace-nowrap">{t("confirm_prompt")}</span>
            <button
              type="button"
              onClick={() => setState("idle")}
              className="py-[6px] px-[11px] rounded-[10px] bg-card-2 border border-edge text-txt-3 text-[11.5px] font-semibold whitespace-nowrap cursor-pointer"
            >
              {t("cancel")}
            </button>
            <button
              type="button"
              onClick={run}
              disabled={cleanup.isPending}
              className="py-[6px] px-[12px] rounded-[10px] bg-red text-white text-[11.5px] font-bold whitespace-nowrap cursor-pointer disabled:opacity-50"
            >
              {cleanup.isPending ? t("working") : t("run")}
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setState("confirming")}
            className="py-[7px] px-[15px] rounded-[11px] bg-card-2 border border-edge shadow-[var(--inset-hi)] text-txt-2 text-[11.5px] font-semibold whitespace-nowrap cursor-pointer transition-all duration-150 hover:text-txt hover:border-txt-4"
          >
            {t("run")}
          </button>
        )}
      </div>
    </div>
  );
}

function EraseEverything() {
  const t = useTranslations("cleanup_panel");
  const cleanup = useCleanup();
  const [text, setText] = useState("");
  const [done, setDone] = useState(false);
  const canErase = text.trim() === "ERASE";

  const run = () => {
    if (!canErase) return;
    cleanup.mutate("everything", {
      onSuccess: () => {
        setDone(true);
        setText("");
        setTimeout(() => setDone(false), 1500);
      },
    });
  };

  return (
    <div className="flex items-center gap-[13px] px-[20px] py-[16px] rounded-[22px] surface-sheen shadow-[var(--lift)] border border-red">
      <span className="w-[34px] h-[34px] shrink-0 flex items-center justify-center rounded-[12px] bg-red-soft text-red">
        <Icon name="trash" size={16} />
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-[13.5px] font-bold text-red whitespace-nowrap">{t("erase_title")}</div>
        <div className="text-[11px] leading-[1.5] text-txt-3 mt-[3px] text-pretty">
          {t("erase_desc")}
        </div>
      </div>
      {done ? (
        <span className="flex items-center gap-[7px] py-[7px] px-[13px] rounded-[11px] bg-green-soft text-green text-[11.5px] font-bold whitespace-nowrap shrink-0">
          <Icon name="check" size={11} /> {t("erased")}
        </span>
      ) : (
        <>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t("erase_placeholder")}
            spellCheck={false}
            className="w-[160px] shrink-0 bg-transparent border-none outline-none font-mono text-[11px] text-txt text-right placeholder:text-txt-4"
          />
          <button
            type="button"
            onClick={run}
            disabled={!canErase || cleanup.isPending}
            className={cn(
              "py-[10px] px-[20px] rounded-[12px] text-white text-[12.5px] font-bold whitespace-nowrap shrink-0 transition-opacity duration-150",
              canErase && !cleanup.isPending ? "bg-red cursor-pointer" : "bg-red opacity-40 cursor-not-allowed",
            )}
          >
            {cleanup.isPending ? t("working") : t("erase_button")}
          </button>
        </>
      )}
    </div>
  );
}

export function CleanupPanel() {
  const t = useTranslations("cleanup_panel");
  return (
    <div className="flex flex-col gap-[14px]">
      <div className="relative overflow-hidden rounded-[22px] surface-sheen shadow-[var(--lift)] px-[22px] py-[20px]">
        <div
          className="absolute -right-[60px] -top-[90px] w-[280px] h-[220px] pointer-events-none"
          style={{ background: "radial-gradient(circle at 50% 50%, rgba(248,113,113,.10), transparent 66%)" }}
          aria-hidden
        />
        <div className="relative">
          <div className="text-[19px] font-extrabold tracking-[-0.025em]">{t("title")}</div>
          <div className="text-[12px] leading-[1.6] text-txt-3 mt-[6px] max-w-[540px] text-pretty">
            {t("hero_sub")}
          </div>
        </div>
      </div>

      <div className="rounded-[22px] surface-sheen shadow-[var(--lift)] overflow-hidden">
        {ROWS.map((row) => (
          <CleanupRowView key={row.kind} row={row} />
        ))}
      </div>

      <EraseEverything />
    </div>
  );
}
