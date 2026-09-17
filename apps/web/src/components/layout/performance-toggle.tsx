"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useTranslations } from "next-intl";
import { Icon, type IconName } from "@/components/ui/icon";
import { Portal } from "@/components/ui/portal";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/cn";
import { usePerformanceStore, type PerformanceMode } from "@/lib/performance-store";

/**
 * Top-bar performance toggle — sits next to the theme toggle. Reflects the
 * current rendering budget and lets the user switch between the three modes
 * or hand control back to auto (power-source driven).
 *
 * The button is deliberately not a static icon: when the budget is anything
 * other than `full` it grows into a labelled pill so a reduced mode — whether
 * the user chose it or `auto` switched it on a plug/unplug — is always
 * visible, never silent. A one-shot accent ping (driven by the store's
 * `autoSwitched` flag) draws the eye the moment auto flips the budget; it
 * clears as soon as the toggle is opened or a mode is picked.
 */

const MODE_META: Record<PerformanceMode, { icon: IconName; tone: "acc" | "amber" | "muted" }> = {
  full: { icon: "sparkle", tone: "acc" },
  lite: { icon: "zap", tone: "amber" },
  off: { icon: "minus", tone: "muted" },
};

const MODES: PerformanceMode[] = ["full", "lite", "off"];

const TONE_TEXT: Record<"acc" | "amber" | "muted", string> = {
  acc: "text-acc",
  amber: "text-amber",
  muted: "text-txt-3",
};

export function PerformanceToggle() {
  const t = useTranslations("perf_toggle");
  const tp = useTranslations("performance_tab");

  const mode = usePerformanceStore((s) => s.mode);
  const setMode = usePerformanceStore((s) => s.setMode);
  const auto = usePerformanceStore((s) => s.auto);
  const setAuto = usePerformanceStore((s) => s.setAuto);
  const autoSwitched = usePerformanceStore((s) => s.autoSwitched);
  const acknowledge = usePerformanceStore((s) => s.acknowledgeAutoSwitch);

  const [open, setOpen] = useState(false);
  const [style, setStyle] = useState<CSSProperties>({});
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const meta = MODE_META[mode];
  const reduced = mode !== "full";
  const modeLabel = tp(`mode_${mode}_label`);

  // Position + outside-click/Escape, portalled to <body> to escape any modal
  // stacking context — same pattern as the account menu in MainTopBar.
  useEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      setStyle({
        position: "fixed",
        top: rect.bottom + 8,
        right: window.innerWidth - rect.right,
        width: 256,
      });
    };
    place();
    const onMouse = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!triggerRef.current?.contains(target) && !panelRef.current?.contains(target)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    const onScroll = () => setOpen(false);
    document.addEventListener("mousedown", onMouse);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, { passive: true, capture: true });
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("mousedown", onMouse);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open]);

  const handleOpen = () => {
    acknowledge();
    setOpen((v) => !v);
  };

  return (
    <div className="relative shrink-0">
      <Tooltip content={t("tooltip", { mode: modeLabel })} side="bottom" className="shrink-0">
        <button
          ref={triggerRef}
          type="button"
          onClick={handleOpen}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={t("aria", { mode: modeLabel })}
          className={cn(
            "group surface-sheen relative h-[38px] flex items-center justify-center rounded-full shadow-[var(--lift)] transition-[transform,box-shadow,color,width] duration-200 hover:-translate-y-px active:translate-y-0 active:shadow-[var(--lift)] hover:shadow-[0_28px_58px_-26px_rgba(0,0,0,0.95),0_4px_16px_-4px_color-mix(in_srgb,var(--acc)_32%,transparent),inset_0_1px_0_rgba(255,255,255,0.12)]",
            reduced ? "gap-[7px] pl-[12px] pr-[14px]" : "w-[38px] text-txt-2 hover:text-txt",
            reduced && TONE_TEXT[meta.tone],
            reduced && "shadow-[0_0_0_1px_var(--acc-line),var(--lift)]",
          )}
        >
          <Icon
            name={meta.icon}
            size={16}
            className="shrink-0 transition-transform duration-300 ease-out group-hover:scale-110"
          />
          {reduced ? (
            <span className="text-[12px] font-bold tracking-[-0.01em] whitespace-nowrap">{modeLabel}</span>
          ) : null}
          {autoSwitched ? (
            <span className="absolute -top-[2px] -right-[2px] flex h-[9px] w-[9px]">
              <span className="absolute inline-flex h-full w-full rounded-full bg-amber opacity-75 animate-ping" />
              <span className="relative inline-flex h-[9px] w-[9px] rounded-full bg-amber shadow-[0_0_0_2px_var(--bg-1)]" />
            </span>
          ) : null}
        </button>
      </Tooltip>

      {open ? (
        <Portal>
          <div
            ref={panelRef}
            style={style}
            role="menu"
            className="p-[7px] surface-sheen rounded-[18px] shadow-[var(--lift)] z-[9999]"
          >
            <div className="flex items-center gap-[8px] px-[9px] pt-[6px] pb-[9px]">
              <span className="text-[12.5px] font-bold tracking-[-0.01em]">{t("title")}</span>
              <span className="flex-1" />
              {autoSwitched ? (
                <span className="text-[9.5px] font-bold tracking-[0.06em] uppercase text-amber whitespace-nowrap">
                  {t("switched_badge")}
                </span>
              ) : null}
            </div>

            {MODES.map((m) => {
              const active = m === mode;
              const mMeta = MODE_META[m];
              return (
                <button
                  key={m}
                  type="button"
                  role="menuitemradio"
                  aria-checked={active}
                  onClick={() => { setMode(m); setOpen(false); }}
                  className={cn(
                    "w-full flex items-start gap-[10px] text-left px-[9px] py-[8px] rounded-[11px] cursor-pointer transition-colors duration-150",
                    active ? "bg-acc-soft" : "hover:bg-card-2",
                  )}
                >
                  <span
                    className={cn(
                      "w-[26px] h-[26px] shrink-0 rounded-[9px] flex items-center justify-center",
                      active ? cn("bg-card-2", TONE_TEXT[mMeta.tone]) : "bg-card-2 text-txt-4",
                    )}
                  >
                    <Icon name={mMeta.icon} size={14} />
                  </span>
                  <span className="flex-1 min-w-0 leading-[1.25]">
                    <span className={cn("block text-[12.5px] font-bold", active ? "text-txt" : "text-txt-2")}>
                      {tp(`mode_${m}_label`)}
                    </span>
                    <span className="block text-[10.5px] text-txt-4 mt-[2px] text-pretty">{tp(`mode_${m}_note`)}</span>
                  </span>
                  {active ? (
                    <Icon name="check" size={13} className="mt-[6px] shrink-0 text-acc" />
                  ) : null}
                </button>
              );
            })}

            <div className="h-px bg-edge my-[6px] mx-[3px]" />

            <button
              type="button"
              role="menuitemcheckbox"
              aria-checked={auto}
              onClick={() => setAuto(!auto)}
              className="w-full flex items-center gap-[10px] text-left px-[9px] py-[8px] rounded-[11px] cursor-pointer hover:bg-card-2 transition-colors duration-150"
            >
              <span className="w-[26px] h-[26px] shrink-0 rounded-[9px] flex items-center justify-center bg-card-2 text-acc">
                <Icon name="zap" size={14} />
              </span>
              <span className="flex-1 min-w-0 leading-[1.25]">
                <span className="block text-[12.5px] font-bold text-txt-2">{t("auto_label")}</span>
                <span className="block text-[10.5px] text-txt-4 mt-[2px] text-pretty">{t("auto_sub")}</span>
              </span>
              <span className={cn("relative w-[34px] h-[20px] shrink-0 mt-[2px] rounded-full transition-colors duration-150", auto ? "bg-acc" : "bg-edge-2")}>
                <span
                  className={cn(
                    "absolute top-[3px] w-[14px] h-[14px] rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.3)] transition-transform duration-150",
                    auto ? "translate-x-[17px]" : "translate-x-[3px]",
                  )}
                />
              </span>
            </button>
          </div>
        </Portal>
      ) : null}
    </div>
  );
}
