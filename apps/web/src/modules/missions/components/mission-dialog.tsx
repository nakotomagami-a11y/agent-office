"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/ui/icon";
import { Portal } from "@/components/ui/portal";
import { CHROME_LEFT_CLASS, CHROME_TOP } from "@/lib/chrome";
import { cn } from "@/lib/cn";
import { useMissionShortcut } from "../hooks/use-mission-shortcut";
import { arrowKeys, FOCUS_RING } from "./mission-fields";
import { MissionJoinList } from "./mission-join-list";
import { MissionStartForm } from "./mission-start-form";
import { MissionStarted, type StartedMission } from "./mission-started";

const FOCUSABLE = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

const MODES = ["start", "join"] as const;
type Mode = (typeof MODES)[number];

function DialogHeader({ mode, onMode, onClose, showModes, ids }: {
  mode: Mode; onMode: (m: Mode) => void; onClose: () => void; showModes: boolean; ids: Record<Mode, string>;
}) {
  const t = useTranslations("missions.dialog");
  const shortcut = useMissionShortcut();
  return (
    <div className="flex shrink-0 items-center gap-[10px] border-b border-edge pt-4 pr-4 pb-[14px] pl-[22px]">
      <span className="flex h-[30px] w-[30px] items-center justify-center rounded-[10px] border border-acc-line bg-acc-soft text-acc">
        <Icon name="sparkle" size={14} />
      </span>
      <span className="text-[16px] font-extrabold tracking-[-0.02em] text-txt">{t("title")}</span>
      <kbd className="rounded-[6px] bg-card-3 px-[7px] py-[2px] font-[family-name:var(--font-mono)] text-[10px] text-txt-4">
        {t("shortcut", { mac: String(shortcut.mac) })}
      </kbd>
      <span className="flex-1" />
      {showModes && (
        <div role="tablist" aria-label={t("mode_aria")} onKeyDown={arrowKeys(MODES, mode, onMode)}
          className="flex gap-[2px] rounded-[11px] border border-edge bg-card-2 p-[3px]">
          {MODES.map((m) => (
            <button key={m} id={`${ids[m]}-tab`} type="button" role="tab" data-value={m} aria-selected={mode === m}
              aria-controls={ids[m]} tabIndex={mode === m ? 0 : -1} onClick={() => onMode(m)}
              className={cn("rounded-[8px] px-[13px] py-[6px] text-[12px] font-bold transition-all duration-[140ms] hover:text-txt", FOCUS_RING,
                mode === m ? "bg-card-3 text-txt shadow-[var(--inset-hi)]" : "text-txt-4")}>
              {t(`mode_${m}`)}
            </button>
          ))}
        </div>
      )}
      <button type="button" aria-label={t("close")} onClick={onClose}
        className={cn("flex h-[31px] w-[31px] shrink-0 items-center justify-center rounded-[10px] text-txt-3 hover:bg-card-3 hover:text-txt", FOCUS_RING)}>
        <Icon name="x" size={15} />
      </button>
    </div>
  );
}

function NoProject({ onClose }: { onClose: () => void }) {
  const t = useTranslations("missions.dialog");
  return (
    <div className="flex flex-col items-center gap-[10px] px-14 pt-12 pb-[52px] text-center">
      <span className="text-[15px] font-bold text-txt">{t("no_project_title")}</span>
      <span className="max-w-[440px] text-[12.5px] leading-[1.6] text-txt-3 [text-wrap:pretty]">{t("no_project_body")}</span>
      <Link href="/projects" onClick={onClose}
        className={cn("mt-[10px] rounded-[11px] border border-edge-2 bg-card-3 px-4 py-[9px] text-[12.5px] font-bold text-txt hover:border-acc-line", FOCUS_RING)}>
        {t("choose_project")}
      </Link>
    </div>
  );
}

function useDialogKeys(open: boolean, dialogRef: React.RefObject<HTMLDivElement | null>, onClose: () => void) {
  // The composer passes a fresh onClose on every render (every streamed token); depending on it would
  // re-run this effect and yank focus out of whatever field is being typed in.
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const t = setTimeout(() => dialogRef.current?.focus(), 30);
    const onKey = (e: KeyboardEvent) => {
      // An IME uses Escape to cancel a composition: that keystroke is not for this dialog.
      if (e.isComposing || e.keyCode === 229) return;
      if (e.key === "Escape") {
        e.preventDefault();
        // The inspector listens for Escape too: this dialog closes, the inspector stays.
        e.stopImmediatePropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab" || !dialogRef.current) return;
      // Roving radios and tabs park their unselected buttons at tabindex -1: those are not Tab stops.
      const els = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null && el.tabIndex >= 0);
      const first = els[0];
      const last = els.at(-1);
      if (!first || !last) return;
      const active = document.activeElement;
      if (active === dialogRef.current || !dialogRef.current.contains(active)) { e.preventDefault(); (e.shiftKey ? last : first).focus(); return; }
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      clearTimeout(t);
      document.removeEventListener("keydown", onKey, true);
      prev?.focus?.();
    };
  }, [open, dialogRef]);
}

/** Start or join a mission (docs/missions.md, "UI") — opened from the composer's ✦ button.
 *  NOT registered with the global modal-manager: it opens from inside the agent inspector, itself
 *  a registered modal, and the manager's replace semantics would close that ancestor — unmounting
 *  the composer and this dialog with it. It handles Escape, focus and the backdrop itself.
 *  Once opened it stays mounted, hidden while closed, so a half-written mission survives a close;
 *  `active` tells its queries to stop asking GitHub meanwhile. */
export function MissionDialog({ open, onClose, projectId }: { open: boolean; onClose: () => void; projectId: string | undefined }) {
  const t = useTranslations("missions.dialog");
  const [mode, setMode] = useState<Mode>("start");
  const [mounted, setMounted] = useState(open);
  const [joinSeen, setJoinSeen] = useState(false);
  const [started, setStarted] = useState<StartedMission | null>(null);
  const [formKey, setFormKey] = useState(0);
  const dialogRef = useRef<HTMLDivElement>(null);
  const downOnScrim = useRef(false);
  const uid = useId();
  const ids = { start: `${uid}-start`, join: `${uid}-join` };
  useDialogKeys(open, dialogRef, onClose);

  if (open && !mounted) setMounted(true);
  if (!mounted) return null;
  const pickMode = (m: Mode) => { setMode(m); if (m === "join") setJoinSeen(true); };
  return (
    <Portal>
      <div
        role="presentation"
        hidden={!open}
        className={cn(
          "app-modal-backdrop fixed top-0 right-0 bottom-0 flex items-center justify-center p-4 z-[200] before:[backdrop-filter:blur(3px)]",
          CHROME_LEFT_CLASS,
        )}
        style={{ top: CHROME_TOP }}
        onMouseDown={(e) => { downOnScrim.current = e.target === e.currentTarget; }}
        onClick={(e) => { if (downOnScrim.current && e.target === e.currentTarget) onClose(); }}
      >
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-label={t("title")}
          tabIndex={-1}
          className="relative flex max-h-[min(900px,calc(100%-16px))] w-full max-w-[780px] flex-col overflow-hidden rounded-[22px] border border-transparent leading-[normal] text-txt outline-none [background:var(--card-bg)_padding-box,var(--sheen)_border-box] shadow-[var(--lift)] motion-safe:animate-[ao-modal-in_220ms_cubic-bezier(.2,.9,.3,1)]"
        >
          <DialogHeader mode={mode} onMode={pickMode} onClose={onClose} showModes={!!projectId} ids={ids} />
          {!projectId && <NoProject onClose={onClose} />}
          {projectId && (
            <div id={ids.start} role="tabpanel" aria-labelledby={`${ids.start}-tab`} hidden={mode !== "start"} className="flex min-h-0 flex-1 flex-col">
              {started
                ? <MissionStarted mission={started} projectId={projectId} active={open && mode === "start"} onLeave={onClose}
                    onStartAnother={() => { setStarted(null); setFormKey((k) => k + 1); }} />
                : <MissionStartForm key={formKey} projectId={projectId} onStarted={setStarted} />}
            </div>
          )}
          {projectId && joinSeen && (
            <div id={ids.join} role="tabpanel" aria-labelledby={`${ids.join}-tab`} hidden={mode !== "join"} className="flex min-h-0 flex-1 flex-col">
              <MissionJoinList projectId={projectId} active={open && mode === "join"} />
            </div>
          )}
        </div>
      </div>
    </Portal>
  );
}
