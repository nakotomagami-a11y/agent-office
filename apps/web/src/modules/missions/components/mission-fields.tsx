"use client";

import { useId, type AnchorHTMLAttributes, type ButtonHTMLAttributes, type KeyboardEvent, type ReactNode } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { MAX_USD } from "@agent-office/domain/config/missions";
import { cn } from "@/lib/cn";
import { openExternalUrl } from "@/lib/tauri-window";
import { parseUsd, usdOk } from "../format/money";
import type { Tone } from "../format/seat-status";

export const FOCUS_RING = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acc";

export const TONE: Record<Tone, string> = { ok: "text-green", wait: "text-amber", muted: "text-txt-3", dim: "text-txt-4" };

export const DOT: Record<Tone, string> = {
  ok: "bg-green text-green motion-safe:animate-[lrPing_2.2s_cubic-bezier(0,0,.2,1)_infinite]",
  wait: "bg-amber text-amber motion-safe:animate-[lrPing_2.2s_cubic-bezier(0,0,.2,1)_infinite]",
  muted: "bg-txt-4",
  dim: "bg-txt-4",
};

/** "$5", "$2.50", "$1,000": cents only when there are some. */
export function useUsd(): (n: number) => string {
  const format = useFormatter();
  return (n) => format.number(n, { style: "currency", currency: "USD", minimumFractionDigits: Number.isInteger(n) ? 0 : 2 });
}

/** Why an amount field is red, else `fine`. */
export function useMoneyNote(): (text: string, fine?: string) => string | undefined {
  const t = useTranslations("missions.fields");
  const usd = useUsd();
  return (text, fine) => {
    const n = parseUsd(text);
    if (n === null) return t(text.trim() ? "not_amount" : "amount_needed");
    if (n <= 0) return t("above_zero");
    return usdOk(n) ? fine : t("at_most", { max: usd(MAX_USD) });
  };
}

export function FieldLabel({ children, id, htmlFor }: { children: ReactNode; id?: string; htmlFor?: string }) {
  const cls = "flex items-center gap-[7px] text-[12px] font-semibold text-txt-3";
  return htmlFor ? <label id={id} htmlFor={htmlFor} className={cls}>{children}</label> : <span id={id} className={cls}>{children}</span>;
}

/** The text stays as typed; the parent parses it (`parseUsd`) and marks it invalid. */
export function MoneyField({ label, value, onChange, note, invalid, swatch, accent, boxed }: {
  label: string; value: string; onChange: (v: string) => void; note?: ReactNode; invalid?: boolean; swatch?: string; accent?: boolean; boxed?: boolean;
}) {
  const id = useId();
  return (
    <div className={cn("flex min-w-0 flex-1 basis-0 flex-col", boxed ? "gap-1.5" : "gap-1")}>
      <FieldLabel htmlFor={id}>
        {swatch && <span aria-hidden className={cn("h-2 w-2 rounded-[2px]", swatch)} />}
        {label}
      </FieldLabel>
      <span className={cn("flex items-baseline gap-0.5", boxed && "rounded-[12px] bg-card-2 px-[14px] py-2 focus-within:shadow-[0_0_0_2px_var(--acc-line)]")}>
        <span aria-hidden className={cn("font-extrabold text-txt-4", boxed ? "text-[18px]" : "text-[22px]")}>$</span>
        <input id={id} inputMode="decimal" value={value} aria-invalid={invalid || undefined} aria-describedby={note ? `${id}-note` : undefined}
          onChange={(e) => onChange(e.target.value)}
          className={cn("w-full min-w-0 rounded-[6px] border-none bg-transparent font-extrabold outline-none",
            boxed ? "text-[22px] tracking-[-0.03em]" : "text-[28px] tracking-[-0.035em] focus-visible:shadow-[0_2px_0_var(--acc-line)]",
            invalid ? "text-red" : accent ? "text-acc" : "text-txt")} />
      </span>
      {note && <span id={`${id}-note`} className={cn("font-[family-name:var(--font-mono)] text-[10.5px]", invalid ? "text-red" : "text-txt-4")}>{note}</span>}
    </div>
  );
}

export function ModalFooter({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex shrink-0 items-center gap-[14px] bg-[var(--ao-gutter)] pt-[14px] pr-[18px] pb-[18px] pl-6", className)}>{children}</div>;
}

export const CTA_FILL = "bg-[linear-gradient(120deg,var(--acc-cta),var(--acc-2))] text-white";

export function PrimaryAction({ ready, busy, waiting, className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { ready: boolean; busy?: boolean; waiting?: boolean }) {
  return (
    <button type="button" disabled={!ready} {...rest}
      className={cn(
        "inline-flex h-[38px] items-center gap-2 whitespace-nowrap rounded-[12px] px-[18px] text-[13px] font-extrabold transition-[opacity,filter] duration-[160ms]", FOCUS_RING,
        waiting ? "bg-amber-soft text-txt-2" : cn(CTA_FILL, "shadow-[0_14px_30px_-14px_color-mix(in_srgb,var(--acc)_95%,transparent)]"),
        ready ? "cursor-pointer hover:brightness-90" : "cursor-default",
        !ready && !busy && !waiting && "opacity-45",
        className,
      )}>
      {waiting && <span aria-hidden className={cn("h-2 w-2 rounded-full", DOT.wait)} />}
      {busy && <span aria-hidden className="h-3 w-3 rounded-full border-2 border-white/90 border-t-transparent motion-safe:animate-[spin_.8s_linear_infinite]" />}
      {children}
    </button>
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
export function arrowKeys<T extends string>(values: readonly T[], current: T | null, pick: (v: T) => void) {
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

/** The server refused with `repo_public`: going on publishes every post and this device's name, OS
 *  and CPU, so it takes a deliberate second click, never a default. */
export function PublicRepoConfirm({ action, busy, onConfirm, onCancel }: {
  action: "start" | "claim"; busy: boolean; onConfirm: () => void; onCancel: () => void;
}) {
  const t = useTranslations("missions.public_repo");
  return (
    <div role="alert" className="flex flex-col gap-2 rounded-[14px] bg-amber-soft px-[14px] py-3">
      <span className="text-[12.5px] font-bold text-txt">{t("title")}</span>
      <span className="text-[12px] leading-[1.55] text-txt-2 [text-wrap:pretty]">{t("body")}</span>
      <span className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className={cn("rounded-[9px] px-[11px] py-1.5 text-[11.5px] font-bold text-txt-3 hover:text-txt", FOCUS_RING)}>
          {t("cancel")}
        </button>
        <button type="button" disabled={busy} onClick={onConfirm}
          className={cn("rounded-[9px] border border-amber px-3 py-1.5 text-[11.5px] font-extrabold text-txt hover:bg-amber-soft disabled:opacity-50", FOCUS_RING)}>
          {t(action === "start" ? "confirm_start" : "confirm_claim")}
        </button>
      </span>
    </div>
  );
}
