"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ModalShell } from "@/components/ui/modal-shell";
import { Icon } from "@/components/ui/icon";
import { ACCENT_BTN } from "@/lib/button-styles";
import {
  CHECK_UPDATE_EVENT,
  detectUpdate,
  openReleasesPage,
  relaunchApp,
  RELEASES_URL,
  type UpdateStatus,
} from "@/lib/updater";

type Phase = "idle" | "downloading" | "installed" | "failed";

const ACCENT_ACTION = `${ACCENT_BTN} inline-flex items-center gap-[6px] px-[12px] py-[6px] rounded-[6px] text-[12.5px] font-semibold cursor-pointer`;
const GHOST_ACTION =
  "h-[30px] px-[12px] rounded-md border border-line bg-transparent text-txt-2 text-[12.5px] cursor-pointer hover:bg-bg-2";

/**
 * Titlebar indicator + update modal. On launch (and on demand via the Dev menu)
 * it probes for a newer build; when one exists a badged download icon appears
 * next to the Dev menu. Clicking it opens the modal:
 *   - Linux/Windows: download + install in place, then relaunch.
 *   - macOS: link out to the GitHub releases page (no signed updater yet).
 * Renders nothing in the browser — detectUpdate() returns null there.
 */
export function UpdateBell() {
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState<number | null>(0);
  const [error, setError] = useState<string | null>(null);
  const [manualEmpty, setManualEmpty] = useState(false); // "up to date" after a manual check
  const checking = useRef(false);

  const runCheck = useCallback(async (manual: boolean) => {
    if (checking.current) return;
    checking.current = true;
    try {
      const s = await detectUpdate();
      setStatus(s);
      if (manual) {
        setManualEmpty(!s);
        setOpen(true);
      }
    } finally {
      checking.current = false;
    }
  }, []);

  // Silent check on launch.
  useEffect(() => {
    void runCheck(false);
  }, [runCheck]);

  // Manual "Check for updates" trigger (Dev menu).
  useEffect(() => {
    const onCheck = () => void runCheck(true);
    window.addEventListener(CHECK_UPDATE_EVENT, onCheck);
    return () => window.removeEventListener(CHECK_UPDATE_EVENT, onCheck);
  }, [runCheck]);

  const install = useCallback(async () => {
    if (status?.kind !== "auto") return;
    setError(null);
    setPhase("downloading");
    setProgress(0);
    try {
      await status.install((f) => setProgress(f));
      setPhase("installed");
      setTimeout(() => void relaunchApp(), 600);
    } catch {
      // Common on Linux .deb installs (updater only patches AppImages) and on
      // any transient download/signature failure — offer the manual path.
      setError("Couldn't install the update automatically.");
      setPhase("failed");
    }
  }, [status]);

  const close = useCallback(() => {
    if (phase === "downloading") return; // don't bail mid-install
    setOpen(false);
    setManualEmpty(false);
    setPhase("idle");
    setError(null);
  }, [phase]);

  const pct = progress == null ? null : Math.round(progress * 100);
  const version = status?.kind === "auto" ? status.info.version : status?.version;
  const currentVersion =
    status?.kind === "auto" ? status.info.currentVersion : status?.currentVersion;
  const notes = status?.kind === "auto" ? status.info.notes : status?.notes;

  return (
    <>
      {status ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="relative inline-flex items-center justify-center w-7 h-7 rounded-md text-acc hover:bg-bg-3 cursor-pointer border-none bg-transparent"
          title={`Update available — v${version}`}
          aria-label={`Update available, version ${version}`}
        >
          <Icon name="download" size={14} />
          <span
            aria-hidden
            className="absolute top-[2px] right-[2px] w-[7px] h-[7px] rounded-full bg-acc border border-bg-2"
          />
        </button>
      ) : null}

      <ModalShell
        open={open}
        onClose={close}
        size="sm"
        title={manualEmpty && !status ? "You're up to date" : "Update available"}
        footer={
          manualEmpty && !status ? (
            <button type="button" onClick={close} className={GHOST_ACTION}>
              Close
            </button>
          ) : status?.kind === "manual" ? (
            <>
              <button type="button" onClick={close} className={GHOST_ACTION}>
                Later
              </button>
              <button
                type="button"
                onClick={() => openReleasesPage(status.url)}
                className={ACCENT_ACTION}
              >
                <Icon name="download" size={13} />
                Open GitHub releases
              </button>
            </>
          ) : status?.kind === "auto" && phase === "idle" ? (
            <>
              <button type="button" onClick={close} className={GHOST_ACTION}>
                Later
              </button>
              <button type="button" onClick={() => void install()} className={ACCENT_ACTION}>
                <Icon name="download" size={13} />
                Download &amp; install
              </button>
            </>
          ) : phase === "failed" ? (
            <>
              <button type="button" onClick={close} className={GHOST_ACTION}>
                Later
              </button>
              <button
                type="button"
                onClick={() => openReleasesPage(RELEASES_URL)}
                className={ACCENT_ACTION}
              >
                <Icon name="download" size={13} />
                Open GitHub releases
              </button>
            </>
          ) : phase === "installed" ? (
            <button type="button" onClick={() => void relaunchApp()} className={ACCENT_ACTION}>
              <Icon name="refresh" size={13} />
              Restart now
            </button>
          ) : null
        }
      >
        {manualEmpty && !status ? (
          <p className="text-[13px] text-txt-2">You're running the latest version.</p>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-[13px] text-txt-2">
              Version <span className="font-semibold text-txt">{version}</span> is available
              {currentVersion ? (
                <> — you have <span className="font-mono text-txt-3">{currentVersion}</span>.</>
              ) : (
                "."
              )}
            </p>

            {status?.kind === "manual" ? (
              <p className="text-[12px] text-txt-3">
                Automatic updates aren&apos;t available on macOS yet — download the latest build
                from GitHub and reinstall.
              </p>
            ) : null}

            {notes ? (
              <div className="max-h-[180px] overflow-auto rounded-md border border-line bg-bg-2 p-2 text-[12px] text-txt-2 whitespace-pre-wrap">
                {notes}
              </div>
            ) : null}

            {phase === "downloading" ? (
              <div className="flex flex-col gap-1.5">
                <div className="h-[6px] w-full overflow-hidden rounded-full bg-bg-3">
                  <div
                    className="h-full rounded-full bg-acc transition-[width] duration-150"
                    style={{ width: pct == null ? "100%" : `${pct}%` }}
                  />
                </div>
                <span className="text-[11px] text-txt-3">
                  {pct == null ? "Downloading…" : `Downloading… ${pct}%`}
                </span>
              </div>
            ) : null}

            {phase === "installed" ? (
              <p className="text-[12.5px] text-txt-2">Installed. Restarting…</p>
            ) : null}

            {phase === "failed" ? (
              <p className="text-[12px] text-txt-3">
                In-app install isn&apos;t supported for this install type (e.g. a Linux
                <code className="mx-1 font-mono">.deb</code>). Download the latest build from
                GitHub and reinstall — after that, updates apply automatically.
              </p>
            ) : null}

            {error ? <p className="text-[12px] text-[var(--error)]">{error}</p> : null}
          </div>
        )}
      </ModalShell>
    </>
  );
}
