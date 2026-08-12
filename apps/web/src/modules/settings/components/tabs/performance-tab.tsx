"use client";

import { Icon } from "@/components/ui/icon";
import {
  usePerformanceStore,
  type PerformanceMode,
} from "@/lib/performance-store";

/**
 * Performance tab of the Settings page. Radio-group control over the
 * global rendering budget. Persisted to `ui_settings.performance-mode`;
 * takes effect immediately via the `[data-perf]` attribute the store
 * writes on `<html>`.
 */

interface ModeOption {
  id: PerformanceMode;
  label: string;
  headline: string;
  bullets: string[];
}

const MODES: ModeOption[] = [
  {
    id: "full",
    label: "Full",
    headline: "Everything on. Best-looking UI.",
    bullets: [
      "Isometric office renderer via PixiJS",
      "All CSS animations + framer-motion transitions",
      "Backdrop blur, drop shadows, procedural planet icons",
      "Hover transitions on every interactive surface",
    ],
  },
  {
    id: "lite",
    label: "Lite",
    headline: "Fast on slow machines. Looks flat.",
    bullets: [
      "Office view forced to cards (no PixiJS)",
      "Non-essential CSS animations off",
      "Framer-motion transitions collapse to 0 ms",
      "Backdrop blur removed; planet icons render as flat color",
      "Status LEDs still animate (essential feedback)",
    ],
  },
  {
    id: "off",
    label: "Off",
    headline: "Minimal render load. Utilitarian.",
    bullets: [
      "Everything from Lite, plus:",
      "No hover transitions",
      "No shimmer, no message-in animations",
      "No auto-scroll smoothing",
    ],
  },
];

export function PerformanceTab() {
  const mode = usePerformanceStore((s) => s.mode);
  const setMode = usePerformanceStore((s) => s.setMode);
  const autoDetected = usePerformanceStore((s) => s.autoDetected);

  return (
    <div className="flex flex-col gap-[14px]">
      <div className="flex flex-col gap-[6px]">
        <h2 className="m-0 text-[15px] font-semibold text-txt tracking-[-0.01em]">
          Rendering budget
        </h2>
        <p className="m-0 text-[12.5px] text-txt-3 leading-[1.55]">
          Choose how much rendering the app should do. Applies immediately —
          no reload needed. Persisted to <code className="font-[var(--font-mono)] text-[11.5px] text-txt-2 bg-bg-3 px-[5px] py-[1px] rounded-[4px]">ui_settings.performance-mode</code>.
        </p>
      </div>

      {autoDetected && (
        <div className="flex items-start gap-[10px] px-[12px] py-[10px] rounded-[8px] border border-[var(--acc-tint)] bg-[var(--acc-faint)] text-[12.5px] text-txt-2 leading-[1.55]">
          <Icon name="help-circle" size={14} className="mt-[2px] shrink-0 text-acc" />
          <span>
            We auto-picked <strong>Lite</strong> because your OS is set to reduced motion.
            Change it below and this notice disappears.
          </span>
        </div>
      )}

      <fieldset className="flex flex-col gap-[10px] m-0 p-0 border-0">
        <legend className="sr-only">Performance mode</legend>
        {MODES.map((option) => {
          const active = mode === option.id;
          return (
            <label
              key={option.id}
              className={[
                "flex gap-[12px] p-[14px] rounded-[10px] border cursor-pointer",
                "transition-[background-color,border-color] duration-[120ms]",
                active
                  ? "border-[var(--acc-tint)] bg-[var(--acc-faint)]"
                  : "border-line bg-bg-2 hover:bg-bg-3 hover:border-line-2",
              ].join(" ")}
            >
              <input
                type="radio"
                name="performance-mode"
                value={option.id}
                checked={active}
                onChange={() => setMode(option.id)}
                className="mt-[4px] shrink-0 accent-[var(--acc)] cursor-pointer"
              />
              <div className="flex flex-col gap-[6px] min-w-0 flex-1">
                <div className="flex items-baseline gap-[10px] flex-wrap">
                  <span className={`text-[14px] font-semibold ${active ? "text-acc" : "text-txt"}`}>
                    {option.label}
                  </span>
                  <span className="text-[12px] text-txt-3">{option.headline}</span>
                </div>
                <ul className="m-0 pl-[18px] flex flex-col gap-[3px] text-[12px] text-txt-2 leading-[1.55]">
                  {option.bullets.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              </div>
            </label>
          );
        })}
      </fieldset>
    </div>
  );
}
