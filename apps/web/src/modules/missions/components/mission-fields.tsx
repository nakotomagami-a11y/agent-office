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

export function MicroLabel({ children, id, htmlFor }: { children: ReactNode; id?: string; htmlFor?: string }) {
  const cls = "text-[9px] font-bold uppercase tracking-[0.09em] text-txt-4";
  return htmlFor ? <label id={id} htmlFor={htmlFor} className={cls}>{children}</label> : <span id={id} className={cls}>{children}</span>;
}

/** The text stays as typed; the parent parses it (`parseUsd`) and marks it invalid. */
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
          onChange={(e) => onChange(e.target.value)}
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
        ready
          ? "cursor-pointer bg-acc-cta text-acc-ink shadow-[0_8px_22px_-10px_color-mix(in_srgb,var(--acc)_80%,transparent)] hover:bg-acc-2"
          : "cursor-default bg-card-3 text-txt-4",
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
    <div role="alert" className="flex flex-col gap-2 rounded-[12px] border border-amber bg-amber-soft px-[13px] py-[11px]">
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
