"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";
import { BackgroundTaskPill, type BackgroundTask } from "@/modules/summon/components/background-task-indicator";
import { LoopPill } from "@/modules/loops/components/loop-pill";
import { useLatestLoopShown, useQaLoopToggle } from "@/modules/loops/hooks/use-qa-loop";

const CHIP =
  "inline-flex items-center gap-[6px] h-[24px] px-[10px] rounded-[9px] font-mono text-[11.5px] font-semibold whitespace-nowrap text-ao-fg-2 bg-ao-bg-2 shadow-[inset_0_0_0_1px_var(--ao-line-0)] hover:shadow-[inset_0_0_0_1px_var(--ao-line-1)] hover:text-ao-fg-0 transition-[box-shadow,color] duration-[120ms]";

/** Inline (not portalled) so a pill's own panel opened inside it stays inside its outside-click boundary. */
function HeaderMenu({ label, trigger, triggerClassName, panelClassName, align = "start", children }: {
  label?: string;
  trigger: ReactNode;
  triggerClassName: string;
  panelClassName?: string;
  align?: "start" | "end";
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.isComposing || !ref.current) return;
      // Capture phase, and no further: the inspector around this menu closes on Escape too.
      e.preventDefault();
      e.stopImmediatePropagation();
      // Innermost layer first: a pill's own open panel (LoopPill) closes before this menu does.
      const nested = Array.from(ref.current.querySelectorAll<HTMLElement>("[aria-expanded=true]")).find((el) => el !== triggerRef.current);
      if (nested) {
        nested.click();
        nested.focus();
        return;
      }
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => {
          triggerRef.current?.focus();
          setOpen((v) => !v);
        }}
        className={triggerClassName}
      >
        {trigger}
      </button>
      {open && (
        <div
          id={panelId}
          role="group"
          tabIndex={-1}
          className={cn(
            "absolute top-[calc(100%+8px)] z-30 flex flex-col rounded-[12px] bg-ao-bg-2 border border-ao-line-1 shadow-[var(--lift)] outline-none",
            align === "end" ? "right-0" : "left-0",
            panelClassName,
          )}
        >
          {children}
        </div>
      )}
    </div>
  );
}

function ToolRow({ label, hint, on, pending, onToggle }: { label: string; hint: string; on: boolean; pending: boolean; onToggle: () => void }) {
  const labelId = useId();
  const hintId = useId();
  // aria-disabled, not disabled: a disabled button drops focus to <body>, and Escape then closes the whole inspector.
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-labelledby={labelId}
      aria-describedby={hintId}
      aria-disabled={pending}
      onClick={() => { if (!pending) onToggle(); }}
      className="flex flex-col gap-[3px] px-[10px] py-[8px] rounded-[8px] text-left text-ao-fg-1 hover:bg-ao-bg-3 aria-disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-acc transition-colors duration-[120ms]"
    >
      <span className="flex items-center w-full">
        <span id={labelId}>{label}</span>
        <span className="flex-1" />
        <span className={cn("flex w-[26px] h-[14px] p-[2px] rounded-full", on ? "justify-end bg-[color-mix(in_srgb,var(--ao-ok)_70%,transparent)]" : "justify-start bg-ao-bg-3")}>
          <span className={cn("w-[10px] h-[10px] rounded-full", on ? "bg-white" : "bg-ao-fg-3")} />
        </span>
      </span>
      <span id={hintId} className="text-[11px] leading-[1.45] text-ao-fg-3">{hint}</span>
    </button>
  );
}

export type PlaywrightToggle = { on: boolean; pending: boolean; toggle: () => void };

/** Per-session switches. Playwright only appears when the agent declares it. */
export function HeaderTools({ projectId, instanceId, qaLoopEnabled, playwright }: {
  projectId: string;
  instanceId: string;
  qaLoopEnabled: boolean;
  playwright: PlaywrightToggle | null;
}) {
  const t = useTranslations("agent_details");
  const qa = useQaLoopToggle(projectId, instanceId, qaLoopEnabled);
  const onCount = (playwright?.on ? 1 : 0) + (qaLoopEnabled ? 1 : 0);
  return (
    <HeaderMenu
      triggerClassName={CHIP}
      panelClassName="w-[300px] gap-[2px] p-[6px] font-sans text-[12.5px]"
      trigger={
        <>
          {t("tools_chip")}
          <span className={onCount ? "text-[var(--ao-ok)]" : "text-ao-fg-3"}>{onCount ? t("tools_on", { count: onCount }) : t("tools_off")}</span>
          <Icon name="chevron-down" size={11} className="shrink-0 text-ao-fg-3" />
        </>
      }
    >
      <span className="px-[10px] pt-[6px] pb-[4px] text-[10px] font-bold tracking-[0.07em] uppercase text-ao-fg-3">{t("tools_this_session")}</span>
      {playwright && (
        <ToolRow
          label="Playwright"
          hint={playwright.on ? t("playwright_on_tooltip") : t("playwright_off_tooltip")}
          on={playwright.on}
          pending={playwright.pending}
          onToggle={playwright.toggle}
        />
      )}
      <ToolRow
        label={t("qa_loop_label")}
        hint={qaLoopEnabled ? t("qa_loop_on_tooltip") : t("qa_loop_off_tooltip")}
        on={qaLoopEnabled}
        pending={qa.pending}
        onToggle={qa.toggle}
      />
    </HeaderMenu>
  );
}

/** "+N": the running shell and the seat's QA loop, folded so the header keeps two rows. */
export function HeaderOverflow({ projectId, instanceId, qaLoopEnabled, shell, onDismissShell }: {
  projectId: string | null;
  instanceId: string | null;
  qaLoopEnabled: boolean;
  shell: BackgroundTask | null;
  onDismissShell: () => void;
}) {
  const t = useTranslations("agent_details");
  const latest = useLatestLoopShown(projectId, instanceId, qaLoopEnabled);
  const count = (latest ? 1 : 0) + (shell ? 1 : 0);
  const dialog = useRef<HTMLElement | null>(null);
  // Emptying the menu unmounts it; focus would fall to <body> and the next Escape close the whole inspector.
  useLayoutEffect(() => {
    if (!count && document.activeElement === document.body) dialog.current?.focus();
  }, [count]);
  if (!count) return null;
  return (
    <span ref={(el) => { if (el) dialog.current = el.closest<HTMLElement>("[role=dialog]"); }} className="contents">
    <HeaderMenu
      label={t(latest?.needsDecision ? "overflow_label_decision" : "overflow_label", { count })}
      align="end"
      triggerClassName="inline-flex items-center gap-[4px] h-[26px] px-[9px] rounded-[8px] font-mono text-[11.5px] font-semibold text-ao-fg-1 bg-ao-bg-3 border border-ao-line-1 hover:text-ao-fg-0 hover:border-ao-line-2 transition-colors duration-[120ms]"
      panelClassName="w-[300px] gap-[6px] p-[8px] items-start"
      trigger={
        <>
          +{count}
          <Icon name="chevron-down" size={11} className="shrink-0 text-ao-fg-3" />
          {latest?.needsDecision && <span className="w-[6px] h-[6px] ml-[2px] rounded-full bg-[var(--ao-accent)]" aria-hidden />}
        </>
      }
    >
      {shell && <BackgroundTaskPill task={shell} onDismiss={onDismissShell} />}
      {latest && <LoopPill loopId={latest.loop.id} initial={latest.loop} initialUpdatedAt={latest.updatedAt} />}
    </HeaderMenu>
    </span>
  );
}
