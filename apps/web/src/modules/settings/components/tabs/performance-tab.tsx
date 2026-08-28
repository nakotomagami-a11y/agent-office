"use client";

import { useTranslations } from "next-intl";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";
import {
  usePerformanceStore,
  type PerformanceMode,
} from "@/lib/performance-store";

/**
 * Performance tab of the Settings page. 3-card mode picker + a feature x mode
 * support matrix, both derived from the same MODES/FEATURES tables below.
 * Persisted to `ui_settings.performance-mode`; takes effect immediately via
 * the `[data-perf]` attribute the store writes on `<html>`.
 *
 * `label`/`note`/`name`/`detail` are i18n key stems (see `performance_tab.*`
 * in messages/en.json), not display strings — translated at render time.
 */

interface ModeOption {
  id: PerformanceMode;
  key: string;
}

const MODES: ModeOption[] = [
  { id: "full", key: "full" },
  { id: "lite", key: "lite" },
  { id: "off", key: "off" },
];

interface FeatureRow {
  key: string;
  /** Which modes render this feature, in MODES order. */
  supported: readonly [boolean, boolean, boolean];
}

const FEATURES: FeatureRow[] = [
  { key: "office_renderer", supported: [true, false, false] },
  { key: "framer_motion", supported: [true, false, false] },
  { key: "backdrop_blur", supported: [true, false, false] },
  { key: "planet_icons", supported: [true, true, false] },
  { key: "hover_transitions", supported: [true, true, false] },
  { key: "auto_scroll", supported: [true, true, false] },
  { key: "status_leds", supported: [true, true, true] },
];

export function PerformanceTab() {
  const t = useTranslations("performance_tab");
  const mode = usePerformanceStore((s) => s.mode);
  const setMode = usePerformanceStore((s) => s.setMode);
  const autoDetected = usePerformanceStore((s) => s.autoDetected);

  const modeIdx = MODES.findIndex((m) => m.id === mode);
  const onCount = FEATURES.filter((f) => f.supported[modeIdx]).length;

  return (
    <div className="flex flex-col gap-[14px]">
      <div className="relative overflow-hidden rounded-[22px] surface-sheen shadow-[var(--lift)] px-[22px] py-[20px]">
        <div
          className="absolute -right-[60px] -top-[90px] w-[280px] h-[220px] pointer-events-none"
          style={{ background: "radial-gradient(circle at 50% 50%, rgba(52,211,153,.12), transparent 66%)" }}
          aria-hidden
        />
        <div className="relative flex items-center gap-[18px]">
          <div className="flex-1 min-w-0">
            <div className="text-[19px] font-extrabold tracking-[-0.025em]">{t("title")}</div>
            <div className="text-[12px] leading-[1.6] text-txt-3 mt-[6px] max-w-[520px] text-pretty">
              {t("hero_sub")}
            </div>
          </div>
          <div className="flex items-center gap-[22px] shrink-0">
            <div className="text-right leading-[1.25]">
              <div className="font-mono text-[15px] font-bold text-acc whitespace-nowrap">{mode}</div>
              <div className="text-[8.5px] font-bold tracking-[0.08em] uppercase text-txt-4 whitespace-nowrap">{t("stat_mode")}</div>
            </div>
            <div className="text-right leading-[1.25]">
              <div className="font-mono text-[15px] font-bold text-txt whitespace-nowrap">{onCount}/{FEATURES.length}</div>
              <div className="text-[8.5px] font-bold tracking-[0.08em] uppercase text-txt-4 whitespace-nowrap">{t("stat_effects_on")}</div>
            </div>
          </div>
        </div>
      </div>

      {autoDetected && (
        <div className="flex items-start gap-[10px] px-[16px] py-[12px] rounded-[14px] surface-sheen shadow-[var(--lift)] text-[12px] text-txt-2 leading-[1.55]">
          <Icon name="help-circle" size={14} className="mt-[2px] shrink-0 text-acc" />
          <span>
            {t("auto_detected_before")} <strong>{t("mode_lite_label")}</strong> {t("auto_detected_after")}
          </span>
        </div>
      )}

      <div className="flex flex-wrap gap-[12px]">
        {MODES.map((option) => {
          const active = option.id === mode;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => setMode(option.id)}
              className={cn(
                "flex-1 basis-[220px] min-w-0 text-left rounded-[20px] surface-sheen px-[17px] py-[16px] cursor-pointer transition-transform duration-150 hover:-translate-y-px",
                active ? "shadow-[0_0_0_1px_var(--acc-line),var(--lift)]" : "shadow-[var(--lift)]",
              )}
            >
              <div className="flex items-center gap-[9px]">
                <span
                  className={cn(
                    "w-[16px] h-[16px] shrink-0 rounded-full flex items-center justify-center",
                    active ? "bg-acc" : "shadow-[inset_0_0_0_1.5px_var(--edge-2)]",
                  )}
                >
                  {active ? <span className="w-[6px] h-[6px] rounded-full bg-white" /> : null}
                </span>
                <span className={cn("text-[15px] font-extrabold tracking-[-0.02em] whitespace-nowrap", active ? "text-txt" : "text-txt-2")}>
                  {t(`mode_${option.key}_label`)}
                </span>
              </div>
              <div className="text-[11.5px] leading-[1.55] text-txt-3 mt-[8px] text-pretty">{t(`mode_${option.key}_note`)}</div>
            </button>
          );
        })}
      </div>

      <div className="rounded-[22px] surface-sheen shadow-[var(--lift)] overflow-hidden">
        <div className="flex items-center gap-[11px] px-[20px] py-[14px] border-b border-edge">
          <div className="flex-1 min-w-0 leading-[1.3]">
            <div className="text-[14px] font-bold whitespace-nowrap">{t("matrix_title")}</div>
            <div className="text-[10.5px] text-txt-4 whitespace-nowrap">{t("matrix_sub")}</div>
          </div>
          <div className="flex items-center shrink-0">
            {MODES.map((m, i) => (
              <span
                key={m.id}
                className={cn(
                  "w-[70px] text-center text-[9px] font-extrabold tracking-[0.08em] uppercase whitespace-nowrap",
                  i === modeIdx ? "text-acc" : "text-txt-4",
                )}
              >
                {t(`mode_${m.key}_label`)}
              </span>
            ))}
          </div>
        </div>

        {FEATURES.map((feature) => (
          <div
            key={feature.key}
            className="flex items-center gap-[11px] px-[20px] py-[11px] border-b border-edge transition-colors duration-150 hover:bg-card-2"
          >
            <div className="flex-1 min-w-0">
              <div className="text-[12.5px] font-semibold whitespace-nowrap">{t(`feature_${feature.key}_name`)}</div>
              <div className="font-mono text-[10px] text-txt-4 mt-[3px] whitespace-nowrap overflow-hidden text-ellipsis">
                {t(`feature_${feature.key}_detail`)}
              </div>
            </div>
            <div className="flex items-center shrink-0">
              {feature.supported.map((on, i) => (
                <span key={i} className="w-[70px] flex items-center justify-center">
                  {on ? (
                    <span className="w-[18px] h-[18px] rounded-[6px] flex items-center justify-center bg-acc-soft text-acc">
                      <Icon name="check" size={11} />
                    </span>
                  ) : (
                    <span className="w-[12px] h-[1.5px] rounded-full bg-edge-2" />
                  )}
                </span>
              ))}
            </div>
          </div>
        ))}

        <div className="flex items-center gap-[10px] px-[20px] py-[13px] bg-card-2">
          <span className="font-mono text-[10.5px] text-txt-4 whitespace-nowrap">
            {t("footer_note")}
          </span>
        </div>
      </div>
    </div>
  );
}
