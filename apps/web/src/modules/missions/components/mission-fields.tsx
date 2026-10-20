"use client";

import { useId, type AnchorHTMLAttributes, type ButtonHTMLAttributes, type KeyboardEvent, type ReactNode } from "react";
import { SEAT_ID, TO_ALL, TO_HUMAN, type SeatOs } from "@agent-office/domain/config/missions";
import { ApiError } from "@/lib/api/fetch";
import { cn } from "@/lib/cn";
import { openExternalUrl } from "@/lib/tauri-window";

export const DEVICE_LABEL: Record<SeatOs, string> = { any: "Any", win32: "Windows", darwin: "macOS", linux: "Linux" };
export const deviceName = (os: SeatOs) => (os === "any" ? "Any device" : DEVICE_LABEL[os]);

/** The contract's `usd`: positive, at most 1000. */
export const MAX_USD = 1000;
export const usdOk = (n: number) => n > 0 && n <= MAX_USD;
export const seatNameOk = (n: string) => SEAT_ID.test(n) && n !== TO_HUMAN && n !== TO_ALL;

export const FOCUS_RING = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acc";

/** Digits and at most one dot: `parseFloat("1.2.3")` would silently send 1.2. */
function money(v: string): string {
  const [whole = "", ...rest] = v.replace(/[^0-9.]/g, "").split(".");
  return rest.length ? `${whole}.${rest.join("")}` : whole;
}

export function MicroLabel({ children, id, htmlFor }: { children: ReactNode; id?: string; htmlFor?: string }) {
  const cls = "text-[9px] font-bold uppercase tracking-[0.09em] text-txt-4";
  return htmlFor ? <label id={id} htmlFor={htmlFor} className={cls}>{children}</label> : <span id={id} className={cls}>{children}</span>;
}

export function MoneyField({ label, value, onChange, note, invalid }: {
  label: string; value: string; onChange: (v: string) => void; note?: ReactNode; invalid?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex min-w-0 flex-1 basis-0 flex-col gap-1.5">
      <MicroLabel htmlFor={id}>{label}</MicroLabel>
      <span className={cn("flex h-10 items-center gap-1 rounded-[12px] border bg-card-2 px-[13px]", invalid ? "border-red" : "border-edge focus-within:border-acc-line")}>
        <span aria-hidden className="font-[family-name:var(--font-mono)] text-[13px] text-txt-4">$</span>
        <input id={id} inputMode="decimal" value={value} aria-invalid={invalid || undefined} aria-describedby={note ? `${id}-note` : undefined}
          onChange={(e) => onChange(money(e.target.value))}
          className="min-w-0 flex-1 border-none bg-transparent font-[family-name:var(--font-mono)] text-[13.5px] text-txt outline-none" />
        {note && <span id={`${id}-note`} className={cn("shrink-0 text-[10.5px]", invalid ? "text-red" : "text-txt-4")}>{note}</span>}
      </span>
    </div>
  );
}

export function ModalFooter({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex shrink-0 items-center gap-3 border-t border-edge px-[22px] pt-[14px] pb-4", className)}>{children}</div>;
}

export function PrimaryAction({ ready, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { ready: boolean }) {
  return (
    <button type="button" disabled={!ready} {...rest}
      className={cn(
        "whitespace-nowrap rounded-[11px] px-[18px] py-[10px] text-[12.5px] font-extrabold transition-all duration-[140ms]", FOCUS_RING,
        ready ? "cursor-pointer bg-acc-2 text-white shadow-[0_8px_22px_-10px_rgba(139,123,255,.8)] hover:bg-acc" : "cursor-default bg-card-3 text-txt-4",
        className,
      )} />
  );
}

/** `target="_blank"` does nothing in the desktop (Tauri) webview; this opens the system browser there. */
export function ExternalLink({ href, className, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" {...rest} className={cn(FOCUS_RING, "rounded-[4px]", className)}
      onClick={(e) => { e.preventDefault(); void openExternalUrl(href); }} />
  );
}

/** Arrow keys move the choice in a radiogroup or tablist; buttons carry `data-value`. */
export function arrowKeys(values: readonly string[], current: string | null, pick: (v: string) => void) {
  return (e: KeyboardEvent<HTMLElement>) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!step || values.length === 0) return;
    e.preventDefault();
    const at = current === null ? -1 : values.indexOf(current);
    const next = values[(at + step + values.length) % values.length]!;
    pick(next);
    e.currentTarget.querySelector<HTMLElement>(`[data-value="${CSS.escape(next)}"]`)?.focus();
  };
}

export function errorHint(e: unknown): string {
  if (e instanceof ApiError) {
    if (typeof e.data?.hint === "string") return e.data.hint;
    if (e.data?.error === "validation_failed" && e.fields) {
      return `The server refused: ${Object.entries(e.fields).map(([k, v]) => `${k} (${v.join(", ")})`).join("; ")}`;
    }
  }
  return e instanceof Error ? e.message : String(e);
}
