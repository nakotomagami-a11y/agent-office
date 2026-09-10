"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ModalShell } from "@/components/ui/modal-shell";
import { Icon, type IconName } from "@/components/ui/icon";
import { cn } from "@/lib/cn";
import {
  CHECK_UPDATE_EVENT,
  detectUpdate,
  openReleasesPage,
  relaunchApp,
  RELEASES_URL,
  type UpdateStatus,
} from "@/lib/updater";

type Phase = "idle" | "downloading" | "installed" | "failed";

type Tone = "acc" | "cyan" | "green" | "amber";

const TONE: Record<Tone, { text: string; iconBg: string; ring: string }> = {
  acc: { text: "text-acc", iconBg: "bg-acc-soft", ring: "var(--acc-line)" },
  cyan: {
    text: "text-cyan",
    iconBg: "bg-[color-mix(in_srgb,var(--cyan)_14%,transparent)]",
    ring: "color-mix(in srgb, var(--cyan) 35%, transparent)",
  },
  green: { text: "text-green", iconBg: "bg-green-soft", ring: "color-mix(in srgb, var(--green) 35%, transparent)" },
  amber: { text: "text-amber", iconBg: "bg-amber-soft", ring: "color-mix(in srgb, var(--amber) 35%, transparent)" },
};

const PRIMARY_ACTION =
  "inline-flex items-center gap-[8px] px-[20px] py-[11px] rounded-[11px] text-white text-[12.5px] font-bold cursor-pointer " +
  "bg-[linear-gradient(120deg,var(--acc),var(--acc-2))] " +
  "shadow-[0_14px_30px_-18px_color-mix(in_srgb,var(--acc)_95%,transparent),inset_0_1px_0_rgba(255,255,255,0.22)] " +
  "transition-transform duration-150 hover:-translate-y-px active:translate-y-0";
const GHOST_ACTION =
  "px-[16px] py-[10px] rounded-[11px] bg-transparent text-txt-3 text-[12.5px] font-bold cursor-pointer transition-colors duration-150 hover:text-txt";

function formatMB(bytes: number): string {
  return (bytes / 1_000_000).toFixed(1);
}

function Eyebrow({ tone, dot, children }: { tone: Tone; dot?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-[8px]">
      <span className={cn("font-[var(--font-mono)] text-[9.5px] font-medium tracking-[0.08em] uppercase", TONE[tone].text)}>
        {children}
      </span>
      {dot ? (
        <span className={cn("w-[5px] h-[5px] rounded-full animate-[ao-pulse_1.9s_ease-in-out_infinite]", TONE[tone].text, "bg-current")} />
      ) : null}
    </div>
  );
}

function StateIcon({ tone, icon }: { tone: Tone; icon: IconName }) {
  return (
    <span
      className={cn(
        "relative w-[42px] h-[42px] shrink-0 flex items-center justify-center rounded-[13px]",
        TONE[tone].iconBg,
        TONE[tone].text,
      )}
      style={{ boxShadow: `inset 0 0 0 1px ${TONE[tone].ring}` }}
    >
      <Icon name={icon} size={21} />
    </span>
  );
}

function Meta({ left, right }: { left: string; right?: string | null }) {
  return (
    <div className="mt-[14px] flex items-center gap-[8px] font-[var(--font-mono)] text-[11px] text-txt-4">
      <span>{left}</span>
      {right ? (
        <>
          <span className="w-[3px] h-[3px] rounded-full bg-edge-2" aria-hidden />
          <span>{right}</span>
        </>
      ) : null}
    </div>
  );
}

/** Best-effort highlight bullets from freeform release notes — first three
 *  non-empty lines, common markdown bullet prefixes stripped. Purely
 *  decorative (colors cycle for visual rhythm, not semantic meaning) since
 *  the source text carries no structure to color-code against. */
function noteHighlights(notes: string | undefined): string[] {
  if (!notes) return [];
  return notes
    .split("\n")
    .map((l) => l.replace(/^[\s*-]+/, "").trim())
    .filter(Boolean)
    .slice(0, 3);
}

const BULLET_TONES: Tone[] = ["acc", "green", "cyan"];

/**
 * Titlebar "Update available" pill + update modal. On launch (and on demand
 * via the Dev menu) it probes for a newer build; when one exists a pill
 * button appears in the top bar (the slot the Docs button used to occupy).
 * Clicking it opens the modal:
 *   - Linux/Windows: downloads in the background and installs in place —
 *     the modal can be hidden mid-download and reopened from the pill.
 *   - macOS: link out to the GitHub releases page (no signed updater yet).
 * Renders nothing in the browser or when up to date — detectUpdate() returns
 * null there.
 */
export function UpdateBell() {
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState<number | null>(0);
  const [downloadedBytes, setDownloadedBytes] = useState(0);
  const [totalBytes, setTotalBytes] = useState<number | null>(null);
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
    setPhase("downloading");
    setProgress(0);
    setDownloadedBytes(0);
    setTotalBytes(null);
    try {
      await status.install(({ fraction, downloadedBytes: d, totalBytes: t }) => {
        setProgress(fraction);
        setDownloadedBytes(d);
        setTotalBytes(t);
      });
      setPhase("installed");
    } catch {
      // Common on Linux .deb installs (updater only patches AppImages) and on
      // any transient download/signature failure — offer the manual path.
      setPhase("failed");
    }
  }, [status]);

  // Closing the modal (Escape, backdrop, "Later"/"On next launch"/"Hide")
  // never interrupts an in-flight download — it keeps running in this
  // component, which stays mounted for the app's whole lifetime, so
  // reopening from the pill picks the same phase back up.
  const close = useCallback(() => {
    setOpen(false);
    setManualEmpty(false);
  }, []);

  // Explicit "Cancel" during download abandons this attempt and returns to
  // the "available" screen — the underlying updater plugin has no cancel
  // token, so this just stops the UI from waiting on it.
  const cancelDownload = useCallback(() => {
    setPhase("idle");
    setProgress(0);
    setOpen(false);
  }, []);

  const version = status?.kind === "auto" ? status.info.version : status?.version;
  const currentVersion = status?.kind === "auto" ? status.info.currentVersion : status?.currentVersion;
  const notes = status?.kind === "auto" ? status.info.notes : status?.notes;
  const highlights = useMemo(() => noteHighlights(notes), [notes]);
  const sizeLabel = totalBytes ? `${formatMB(totalBytes)} MB` : null;
  const pct = progress == null ? null : Math.round(progress * 100);

  return (
    <>
      {status ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="group surface-sheen h-[38px] shrink-0 flex items-center gap-[8px] pl-[12px] pr-[14px] rounded-full text-txt-2 hover:text-txt font-semibold text-[12.5px] shadow-[var(--lift)] transition-[transform,box-shadow,color] duration-200 hover:-translate-y-px hover:shadow-[0_28px_58px_-26px_rgba(0,0,0,0.95),0_4px_16px_-4px_color-mix(in_srgb,var(--acc)_38%,transparent),inset_0_1px_0_rgba(255,255,255,0.12)] active:translate-y-0 active:shadow-[var(--lift)] cursor-pointer"
          title={`Update available — v${version}`}
          aria-label={`Update available, version ${version}`}
        >
          <Icon name="download" size={15} className="text-acc transition-transform duration-200 group-hover:scale-110" />
          Update available
        </button>
      ) : null}

      <ModalShell open={open} onClose={close} maxWidth={452} className="rounded-[22px]" bareContent>
        <div className="px-[26px] pt-[26px] pb-[20px]">
          {manualEmpty && !status ? (
            <>
              <div className="flex items-center gap-[13px]">
                <StateIcon tone="green" icon="shield" />
                <div className="flex-1 min-w-0">
                  <Eyebrow tone="green">Up to date</Eyebrow>
                  <div className="mt-1 text-[19px] font-extrabold tracking-[-0.03em] leading-[1.15]">
                    You&apos;re on the latest build
                  </div>
                </div>
              </div>
              <p className="mt-[14px] text-[13px] leading-[1.6] text-txt-3">
                You&apos;re already on the newest release. We check again automatically on launch.
              </p>
              <div className="mt-[22px] flex items-center gap-[9px]">
                <span className="flex-1" />
                <button type="button" onClick={close} className={PRIMARY_ACTION}>
                  Done
                </button>
              </div>
            </>
          ) : status?.kind === "manual" ? (
            <>
              <div className="flex items-center gap-[13px]">
                <StateIcon tone="amber" icon="alert-circle" />
                <div className="flex-1 min-w-0">
                  <Eyebrow tone="amber">Manual install</Eyebrow>
                  <div className="mt-1 text-[19px] font-extrabold tracking-[-0.03em] leading-[1.15]">
                    Download {version} from GitHub
                  </div>
                </div>
              </div>
              <p className="mt-[14px] text-[13px] leading-[1.6] text-txt-3">
                Automatic updates aren&apos;t signed for macOS yet. Grab the build and reinstall
                over the top — settings and data are untouched.
              </p>
              <Meta left={currentVersion ? `${currentVersion} → ${version}` : `${version}`} />
              <div className="mt-[22px] flex items-center gap-[9px]">
                <span className="flex-1" />
                <button type="button" onClick={close} className={GHOST_ACTION}>
                  Later
                </button>
                <button type="button" onClick={() => openReleasesPage(status.url)} className={PRIMARY_ACTION}>
                  <Icon name="external-link" size={14} />
                  Open releases
                </button>
              </div>
            </>
          ) : phase === "failed" ? (
            <>
              <div className="flex items-center gap-[13px]">
                <StateIcon tone="amber" icon="alert-circle" />
                <div className="flex-1 min-w-0">
                  <Eyebrow tone="amber">Manual install</Eyebrow>
                  <div className="mt-1 text-[19px] font-extrabold tracking-[-0.03em] leading-[1.15]">
                    Download {version} from GitHub
                  </div>
                </div>
              </div>
              <p className="mt-[14px] text-[13px] leading-[1.6] text-txt-3">
                In-app install isn&apos;t supported for this install type (e.g. a Linux{" "}
                <code className="font-mono">.deb</code>). Grab the build and reinstall over the
                top — after that, updates apply automatically.
              </p>
              <Meta left={currentVersion ? `${currentVersion} → ${version}` : `${version}`} />
              <div className="mt-[22px] flex items-center gap-[9px]">
                <span className="flex-1" />
                <button type="button" onClick={close} className={GHOST_ACTION}>
                  Later
                </button>
                <button type="button" onClick={() => openReleasesPage(RELEASES_URL)} className={PRIMARY_ACTION}>
                  <Icon name="external-link" size={14} />
                  Open releases
                </button>
              </div>
            </>
          ) : phase === "installed" ? (
            <>
              <div className="flex items-center gap-[13px]">
                <StateIcon tone="green" icon="check" />
                <div className="flex-1 min-w-0">
                  <Eyebrow tone="green">Installed</Eyebrow>
                  <div className="mt-1 text-[19px] font-extrabold tracking-[-0.03em] leading-[1.15]">
                    Restart to finish
                  </div>
                </div>
              </div>
              <p className="mt-[14px] text-[13px] leading-[1.6] text-txt-3">
                {version} is downloaded and verified. Runs in progress are checkpointed and
                resume after the restart.
              </p>
              <Meta left={`restarting into ${version}`} right={sizeLabel} />
              <div className="mt-[22px] flex items-center gap-[9px]">
                <span className="flex-1" />
                <button type="button" onClick={close} className={GHOST_ACTION}>
                  On next launch
                </button>
                <button type="button" onClick={() => void relaunchApp()} className={PRIMARY_ACTION}>
                  <Icon name="refresh" size={14} />
                  Restart now
                </button>
              </div>
            </>
          ) : phase === "downloading" ? (
            <>
              <div className="flex items-center gap-[13px]">
                <StateIcon tone="cyan" icon="download" />
                <div className="flex-1 min-w-0">
                  <Eyebrow tone="cyan" dot>Downloading</Eyebrow>
                  <div className="mt-1 text-[19px] font-extrabold tracking-[-0.03em] leading-[1.15]">
                    Fetching {version}
                  </div>
                </div>
              </div>
              <p className="mt-[14px] text-[13px] leading-[1.6] text-txt-3">
                Keep working — the install waits for you to restart.
              </p>
              <Meta left={currentVersion ? `${currentVersion} → ${version}` : `${version}`} right={sizeLabel} />
              <div className="mt-[14px] flex flex-col gap-[6px]">
                <div className="h-[6px] w-full overflow-hidden rounded-full bg-card-3">
                  <div
                    className="h-full rounded-full bg-acc transition-[width] duration-150"
                    style={{ width: pct == null ? "100%" : `${pct}%` }}
                  />
                </div>
                <span className="font-[var(--font-mono)] text-[11px] text-acc">
                  {totalBytes ? `${formatMB(downloadedBytes)} MB of ${formatMB(totalBytes)} MB` : pct == null ? "Downloading…" : `Downloading… ${pct}%`}
                </span>
              </div>
              <div className="mt-[22px] flex items-center gap-[9px]">
                <span className="flex-1" />
                <button type="button" onClick={cancelDownload} className={GHOST_ACTION}>
                  Cancel
                </button>
                <button type="button" onClick={close} className={PRIMARY_ACTION}>
                  Hide
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-[13px]">
                <StateIcon tone="acc" icon="download" />
                <div className="flex-1 min-w-0">
                  <Eyebrow tone="acc" dot>Update available</Eyebrow>
                  <div className="mt-1 text-[19px] font-extrabold tracking-[-0.03em] leading-[1.15]">
                    Version {version} is ready
                  </div>
                </div>
              </div>
              <p className="mt-[14px] text-[13px] leading-[1.6] text-txt-3">
                Downloads in the background and installs on the next restart. Projects, agents
                and memory stay as they are.
              </p>
              <Meta left={currentVersion ? `${currentVersion} → ${version}` : `${version}`} right={sizeLabel} />
              {highlights.length > 0 ? (
                <div className="mt-[18px] pt-[16px] border-t border-edge flex flex-col gap-[9px]">
                  {highlights.map((line, i) => (
                    <div key={i} className="flex items-start gap-[10px]">
                      <span
                        className={cn("w-[5px] h-[5px] mt-[6px] shrink-0 rounded-full bg-current", TONE[BULLET_TONES[i % BULLET_TONES.length]!].text)}
                      />
                      <span className="flex-1 text-[12.5px] leading-[1.5] text-txt-2">{line}</span>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => openReleasesPage(RELEASES_URL)}
                    className="mt-[2px] self-start text-[11.5px] font-bold text-acc hover:underline underline-offset-2 cursor-pointer bg-transparent border-0 p-0"
                  >
                    Full release notes
                  </button>
                </div>
              ) : null}
              <div className="mt-[22px] flex items-center gap-[9px]">
                <span className="flex-1" />
                <button type="button" onClick={close} className={GHOST_ACTION}>
                  Later
                </button>
                <button type="button" onClick={() => void install()} className={PRIMARY_ACTION}>
                  <Icon name="download" size={14} />
                  Download &amp; install
                </button>
              </div>
            </>
          )}
        </div>
      </ModalShell>
    </>
  );
}
