"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Portal } from "@/components/ui/portal";
import { cn } from "@/lib/cn";

/**
 * A themed date + time picker that replaces the native `datetime-local` input
 * (whose OS popup is unstyleable and clashes with the app). Emits the same
 * `YYYY-MM-DDTHH:mm` string a `datetime-local` input would, so callers that do
 * `new Date(value)` keep working unchanged.
 *
 * Fully custom — calendar, month nav and time control are all app-styled
 * (no native `<input type="time">`, so no OS popup and no theme-mismatched
 * indicator icon). Layout is flexbox-only (house rule — no CSS grid); colours
 * are tokens so light/dark are automatic. Structural pixel dimensions use
 * inline `style` rather than arbitrary Tailwind classes so a freshly-added file
 * doesn't depend on the dev server's incremental class scan.
 */

const pad = (n: number) => n.toString().padStart(2, "0");
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function toValue(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fromValue(v: string): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}
function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
/** 42 cells (6 weeks) starting on the Sunday on/of the month's first week. */
function monthGrid(view: Date): Date[] {
  const first = new Date(view.getFullYear(), view.getMonth(), 1);
  const start = new Date(first);
  start.setDate(1 - first.getDay());
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}
/** Default when the user picks a day before choosing a time: next round hour. */
function defaultDateTime(): Date {
  const d = new Date();
  d.setHours(d.getHours() + 1, 0, 0, 0);
  return d;
}

const PRESETS: { label: string; make: () => Date }[] = [
  { label: "In 1 hour", make: () => new Date(Date.now() + 60 * 60 * 1000) },
  { label: "In 3 hours", make: () => new Date(Date.now() + 3 * 60 * 60 * 1000) },
  {
    label: "Tonight 8 PM",
    make: () => {
      const d = new Date();
      d.setHours(20, 0, 0, 0);
      if (d.getTime() < Date.now()) d.setDate(d.getDate() + 1);
      return d;
    },
  },
  {
    label: "Tomorrow 9 AM",
    make: () => {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      d.setHours(9, 0, 0, 0);
      return d;
    },
  },
];

function CalendarGlyph({ className }: { className?: string }) {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <rect x="3" y="4.5" width="18" height="16" rx="2.5" />
      <path d="M3 9h18M8 3v3M16 3v3" />
    </svg>
  );
}

function Chevron({ dir, className }: { dir: "left" | "right"; className?: string }) {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d={dir === "left" ? "M15 6l-6 6 6 6" : "M9 6l6 6-6 6"} />
    </svg>
  );
}

export type DateTimePickerProps = {
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  className?: string;
};

export function DateTimePicker({ value, onChange, ariaLabel, className }: DateTimePickerProps) {
  const selected = fromValue(value);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<Date>(() => selected ?? new Date());
  const [style, setStyle] = useState<CSSProperties>({});
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  // Local time-control state (12h). Synced from the committed value.
  const [hStr, setHStr] = useState("");
  const [mStr, setMStr] = useState("");
  const [mer, setMer] = useState<"AM" | "PM">("AM");
  useEffect(() => {
    if (!selected) return;
    const h = selected.getHours();
    setHStr(String((h % 12) || 12));
    setMStr(pad(selected.getMinutes()));
    setMer(h < 12 ? "AM" : "PM");
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps -- derive from committed value only

  useEffect(() => {
    if (!open) return;
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const margin = 8;
    // Measure the real popover height (it's already mounted); fall back to an
    // estimate on the first frame. Anchor by `top` and clamp into the viewport
    // so a flipped-up popover can't run off the top edge and clip its content.
    const popH = popRef.current?.offsetHeight || 430;
    const spaceBelow = window.innerHeight - rect.bottom - margin;
    const spaceAbove = rect.top - margin;
    let top: number;
    if (spaceBelow >= popH) top = rect.bottom + 6;
    else if (spaceAbove >= popH) top = rect.top - 6 - popH;
    else top = margin; // fits neither side fully → pin to top, cap height below
    top = clamp(top, margin, Math.max(margin, window.innerHeight - popH - margin));
    setStyle({
      position: "fixed",
      top,
      left: Math.min(rect.left, window.innerWidth - 300 - margin),
      maxHeight: window.innerHeight - margin * 2,
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const commitDay = (day: Date) => {
    const base = selected ?? defaultDateTime();
    const d = new Date(day);
    d.setHours(base.getHours(), base.getMinutes(), 0, 0);
    onChange(toValue(d));
  };
  const commitTime = (h: string, m: string, ap: "AM" | "PM") => {
    const h12 = clamp(parseInt(h || "12", 10) || 12, 1, 12);
    const min = clamp(parseInt(m || "0", 10) || 0, 0, 59);
    const H = (h12 % 12) + (ap === "PM" ? 12 : 0);
    const d = selected ? new Date(selected) : startOfDay(new Date());
    d.setHours(H, min, 0, 0);
    onChange(toValue(d));
  };
  const commitPreset = (d: Date) => {
    onChange(toValue(d));
    setView(d);
    setOpen(false);
  };

  const now = new Date();
  const minDay = startOfDay(now);
  const grid = monthGrid(view);
  const label = selected
    ? selected.toLocaleString([], { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : null;

  const timeInputCls = "w-[38px] h-[30px] text-center bg-bg-1 border border-line-2 rounded-[8px] text-[13px] text-txt outline-none focus:border-acc [font:inherit] placeholder:text-txt-3";

  return (
    <div className={cn("relative", className)}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="w-full h-8 px-[10px] inline-flex items-center justify-between gap-[7px] bg-bg-1 border border-line-2 rounded-[var(--r-md)] shadow-1 text-[13px] cursor-pointer hover:border-acc focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acc transition-colors"
      >
        <span className={cn("truncate", label ? "text-txt" : "text-txt-3")}>{label ?? "Pick date & time"}</span>
        <CalendarGlyph className="text-txt-3 shrink-0" />
      </button>

      {open && (
        <Portal>
          {/* Shade — separates the popover from the page (it blended on dark).
              Inline background so it never depends on arbitrary-class generation. */}
          <div className="fixed inset-0 z-[9998]" style={{ background: "rgba(0,0,0,0.5)" }} aria-hidden onMouseDown={() => setOpen(false)} />
          <div
            ref={popRef}
            role="dialog"
            aria-label={ariaLabel}
            style={{ ...style, width: 300 }}
            className="bg-bg-1 border border-line-2 rounded-[var(--r-lg)] shadow-[var(--shadow-3)] p-3 z-[9999] flex flex-col gap-[10px]"
          >
            {/* Quick presets — the common case for scheduling. */}
            <div className="flex flex-wrap gap-[6px]">
              {PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => commitPreset(p.make())}
                  className="text-[11.5px] px-[9px] py-[4px] rounded-full border border-line bg-bg-2 text-txt-2 hover:border-acc hover:text-acc transition-colors cursor-pointer"
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* Month navigation. */}
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-semibold text-txt">{MONTHS[view.getMonth()]} {view.getFullYear()}</span>
              <div className="flex items-center gap-[2px]">
                <button type="button" aria-label="Previous month" onClick={() => setView((v) => new Date(v.getFullYear(), v.getMonth() - 1, 1))} className="w-[26px] h-[26px] inline-flex items-center justify-center rounded-[6px] text-txt-3 hover:bg-bg-2 hover:text-txt cursor-pointer">
                  <Chevron dir="left" />
                </button>
                <button type="button" aria-label="Next month" onClick={() => setView((v) => new Date(v.getFullYear(), v.getMonth() + 1, 1))} className="w-[26px] h-[26px] inline-flex items-center justify-center rounded-[6px] text-txt-3 hover:bg-bg-2 hover:text-txt cursor-pointer">
                  <Chevron dir="right" />
                </button>
              </div>
            </div>

            {/* Weekday header. */}
            <div className="flex flex-wrap" style={{ width: 276 }}>
              {WEEKDAYS.map((w, i) => (
                <div key={i} className="flex items-center justify-center text-[10.5px] font-mono text-txt-3" style={{ width: 39.4, height: 22 }}>{w}</div>
              ))}
            </div>

            {/* Day grid. */}
            <div className="flex flex-wrap" style={{ width: 276 }}>
              {grid.map((d, i) => {
                const inMonth = d.getMonth() === view.getMonth();
                const disabled = startOfDay(d) < minDay;
                const isSel = selected !== null && sameDay(d, selected);
                const isToday = sameDay(d, now);
                return (
                  <button
                    key={i}
                    type="button"
                    disabled={disabled}
                    onClick={() => commitDay(d)}
                    style={{ width: 39.4, height: 34 }}
                    className={cn(
                      "flex items-center justify-center text-[12.5px] rounded-[8px] transition-colors",
                      disabled
                        ? "text-txt-4 opacity-40 cursor-not-allowed"
                        : cn(
                            "cursor-pointer",
                            isSel
                              ? "bg-acc text-[var(--acc-ink)] font-semibold"
                              : cn(inMonth ? "text-txt" : "text-txt-4", "hover:bg-bg-2", isToday && "ring-1 ring-inset ring-[var(--acc)]"),
                          ),
                    )}
                  >
                    {d.getDate()}
                  </button>
                );
              })}
            </div>

            {/* Custom time control — no native time input (its OS popup overflowed
                and its indicator icon didn't follow the theme). */}
            <div className="flex items-center gap-[8px] border-t border-line pt-[10px]">
              <span className="text-[10.5px] font-mono uppercase tracking-[0.06em] text-txt-3">Time</span>
              <div className="ml-auto flex items-center gap-[6px]">
                <input
                  inputMode="numeric"
                  aria-label="Hour"
                  placeholder="HH"
                  value={hStr}
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, "").slice(0, 2);
                    setHStr(v);
                    commitTime(v, mStr, mer);
                  }}
                  className={timeInputCls}
                />
                <span className="text-txt-3 text-[13px]">:</span>
                <input
                  inputMode="numeric"
                  aria-label="Minute"
                  placeholder="MM"
                  value={mStr}
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, "").slice(0, 2);
                    setMStr(v);
                    commitTime(hStr, v, mer);
                  }}
                  className={timeInputCls}
                />
                <div className="flex h-[30px] rounded-[8px] border border-line-2 overflow-hidden">
                  {(["AM", "PM"] as const).map((x) => (
                    <button
                      key={x}
                      type="button"
                      onClick={() => { setMer(x); commitTime(hStr, mStr, x); }}
                      className={cn(
                        "px-[9px] text-[12px] font-medium cursor-pointer transition-colors",
                        mer === x ? "bg-acc text-[var(--acc-ink)]" : "bg-bg-1 text-txt-2 hover:bg-bg-2",
                      )}
                    >
                      {x}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </Portal>
      )}
    </div>
  );
}
