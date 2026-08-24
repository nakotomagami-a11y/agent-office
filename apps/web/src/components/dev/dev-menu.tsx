"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ModalShell } from "@/components/ui/modal-shell";
import { Icon, type IconName } from "@/components/ui/icon";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/cn";
import { ACCENT_BTN } from "@/components/ui/button";
import { getDbStats, runSeed, type DbStats, type SeedAction } from "@/lib/api/dev-seed";
import { usePerformanceStore, type PerformanceMode } from "@/lib/performance-store";
import { useFpsMeterStore } from "@/lib/fps-meter-store";
import { dumpStores, appStateSnapshot } from "./dev-instruments";
import { isTauri } from "@/lib/tauri-window";
import { requestUpdateCheck } from "@/lib/updater";

const GIT_SHA = process.env.NEXT_PUBLIC_GIT_SHA || "";
/** App boot time (module eval ≈ first client load). Used for the uptime readout. */
const BOOT_TS = Date.now();

function fmtUptime(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m ${sec}s`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

/** Live frame-rate readout pinned to the corner. Persists while enabled even
 *  after the dev modal closes, so you can watch FPS during interaction. */
function FpsMeter() {
  const [fps, setFps] = useState(0);
  useEffect(() => {
    let raf = 0;
    let frames = 0;
    let last = performance.now();
    const loop = () => {
      frames++;
      const now = performance.now();
      if (now - last >= 500) {
        setFps(Math.round((frames * 1000) / (now - last)));
        frames = 0;
        last = now;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <div className="fixed bottom-3 right-3 z-[300] pointer-events-none select-none font-[var(--font-mono)] text-[11px] px-2 py-1 rounded-md bg-bg-2 border border-line-2 text-txt-2 shadow-[var(--shadow-2)]">
      <span className={cn(fps < 30 ? "text-[var(--error)]" : fps < 50 ? "text-[var(--queued)]" : "text-[var(--working)]")}>
        {fps}
      </span>{" "}
      fps
    </div>
  );
}

/**
 * Dev console — an internal instrument panel for seeding data, inspecting the
 * DB, flipping interface modes, and (soon) simulating agent states.
 *
 * Wired: interface toggles (isometric view, rendering budget), demo-data
 * seeding, DB stats + maintenance, reload. Panels/rows tagged `soon` are UI
 * only — they get wired once the layout is signed off.
 */

type BtnState = "idle" | "loading" | "done" | "error";
type DevCat = "interface" | "data" | "database" | "simulate" | "inspect" | "environment" | "utilities";

const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "0.0.0";

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

// ── Primitives ─────────────────────────────────────────────────────────────

function SoonBadge() {
  return (
    <span className="ml-1.5 shrink-0 font-[var(--font-mono)] text-[9px] uppercase tracking-[0.1em] text-txt-2 bg-bg-3 border border-line-2 rounded-[3px] px-[4px] py-[1px] leading-none">
      soon
    </span>
  );
}

function SectionLabel({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="flex items-center gap-2 mb-2.5">
      <span className="font-[var(--font-mono)] text-[10.5px] font-semibold text-txt-3 uppercase tracking-[0.12em]">
        {children}
      </span>
      {hint ? <span className="font-[var(--font-mono)] text-[10px] text-txt-4">{hint}</span> : null}
      <span className="flex-1 h-px bg-line" />
    </div>
  );
}

function ToggleRow({
  icon,
  label,
  desc,
  checked,
  onChange,
  disabled,
  hint,
  planned,
}: {
  icon: IconName;
  label: string;
  desc?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  hint?: string;
  planned?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-bg-2 border border-line">
      <span className="text-txt-3 shrink-0 mt-[1px]"><Icon name={icon} size={15} /></span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center text-[12.5px] font-medium text-txt">
          {label}
          {planned ? <SoonBadge /> : null}
        </div>
        {desc ? <div className="text-[11px] text-txt-3 mt-[3px] leading-[1.45]">{desc}</div> : null}
        {hint ? (
          <div className="text-[10.5px] text-[var(--queued)] mt-[4px] font-[var(--font-mono)] leading-[1.4]">{hint}</div>
        ) : null}
      </div>
      <Switch checked={checked} onChange={onChange} label={label} disabled={disabled} />
    </div>
  );
}

function DevButton({
  label,
  icon,
  onClick,
  variant = "default",
  state = "idle",
  message,
  planned,
}: {
  label: string;
  icon?: IconName;
  onClick?: () => void;
  variant?: "default" | "accent" | "danger";
  state?: BtnState;
  message?: string;
  planned?: boolean;
}) {
  const base =
    "w-full flex items-center justify-center gap-[7px] rounded-lg px-3 py-[7px] text-[12px] font-[var(--font-mono)] border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acc";
  const variants: Record<string, string> = {
    default: "bg-bg-2 text-txt-2 hover:text-txt hover:bg-bg-3 border-line hover:border-line-2",
    accent: ACCENT_BTN,
    danger:
      "bg-transparent text-[var(--error)] border-[color-mix(in_oklab,var(--error)_38%,transparent)] hover:bg-[color-mix(in_oklab,var(--error)_12%,transparent)] hover:border-[color-mix(in_oklab,var(--error)_60%,transparent)]",
  };
  return (
    <div className="flex flex-col gap-[3px]">
      <button
        type="button"
        onClick={onClick}
        disabled={state === "loading"}
        className={cn(base, variants[variant], state === "loading" && "opacity-50 cursor-wait")}
      >
        {icon && state === "idle" ? <Icon name={icon} size={13} /> : null}
        {state === "loading" ? "working…" : state === "done" ? "✓ done" : label}
        {planned ? <SoonBadge /> : null}
      </button>
      {message ? <p className="text-[10.5px] text-txt-4 font-[var(--font-mono)] text-center px-1">{message}</p> : null}
    </div>
  );
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (next: T) => void;
}) {
  return (
    <div className="flex bg-bg-2 border border-line rounded-lg p-[3px] gap-[3px]">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            "flex-1 h-[26px] rounded-md text-[11.5px] font-[var(--font-mono)] transition-colors cursor-pointer",
            value === o.value ? "bg-acc text-[var(--acc-ink)]" : "text-txt-3 hover:text-txt hover:bg-bg-3",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Field({
  label,
  value,
  copyable,
  planned,
}: {
  label: string;
  value: string;
  copyable?: boolean;
  planned?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* ignore */ }
  };
  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-bg-2 border border-line">
      <span className="text-[11px] text-txt-3 shrink-0 w-[92px]">{label}</span>
      <span className="flex-1 min-w-0 truncate font-[var(--font-mono)] text-[11.5px] text-txt-2 text-right">
        {planned ? <span className="text-txt-4">—</span> : value}
      </span>
      {planned ? <SoonBadge /> : copyable ? (
        <button
          type="button"
          onClick={copy}
          aria-label={`Copy ${label}`}
          className="shrink-0 w-[22px] h-[22px] inline-flex items-center justify-center rounded-[6px] text-txt-3 hover:text-acc hover:bg-acc-faint transition-colors cursor-pointer"
        >
          <Icon name={copied ? "check" : "copy"} size={12} />
        </button>
      ) : null}
    </div>
  );
}

// ── Category rail ────────────────────────────────────────────────────────────

const CATS: { id: DevCat; label: string; icon: IconName }[] = [
  { id: "interface", label: "Interface", icon: "monitor" },
  { id: "data", label: "Demo data", icon: "sparkle" },
  { id: "database", label: "Database", icon: "server" },
  { id: "simulate", label: "Simulate", icon: "zap" },
  { id: "inspect", label: "Inspect", icon: "search" },
  { id: "environment", label: "Environment", icon: "cpu" },
  { id: "utilities", label: "Utilities", icon: "wrench" },
];

// ── Root ─────────────────────────────────────────────────────────────────────

export function DevMenu() {
  const [open, setOpen] = useState(false);
  const [cat, setCat] = useState<DevCat>("interface");
  const [stats, setStats] = useState<DbStats | null>(null);
  const [states, setStates] = useState<Record<SeedAction, BtnState>>({
    "clear-all-runs": "idle", "fix-orphans": "idle",
    showcase: "idle", "clear-showcase": "idle",
  });
  const [messages, setMessages] = useState<Partial<Record<SeedAction, string>>>({});
  const queryClient = useQueryClient();

  // Wired interface state.
  const perfMode = usePerformanceStore((s) => s.mode);
  const setPerfMode = usePerformanceStore((s) => s.setMode);
  const fpsEnabled = useFpsMeterStore((s) => s.enabled);
  const setFpsEnabled = useFpsMeterStore((s) => s.setEnabled);

  // Wired interface instruments (ephemeral — reset on reload, which is fine for dev).
  const [instruments, setInstruments] = useState({ reduceMotion: false, outlines: false });
  // Transient state for one-shot client actions (dump / snapshot / etc.).
  const [clientState, setClientState] = useState<Record<string, BtnState>>({});
  const [uptimeNow, setUptimeNow] = useState(() => Date.now());
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const loadStats = useCallback(async () => {
    try { setStats(await getDbStats()); } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (open) void loadStats();
  }, [open, loadStats]);

  // Reflect instrument toggles onto <html> so CSS in globals.css can gate.
  useEffect(() => {
    document.documentElement.toggleAttribute("data-reduce-motion", instruments.reduceMotion);
  }, [instruments.reduceMotion]);
  useEffect(() => {
    document.documentElement.toggleAttribute("data-dev-outlines", instruments.outlines);
  }, [instruments.outlines]);

  // Tick the uptime readout while the Environment panel is on screen.
  useEffect(() => {
    if (!open || cat !== "environment") return;
    const id = setInterval(() => setUptimeNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [open, cat]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const runClient = useCallback((key: string, fn: () => void | Promise<void>) => {
    setClientState((s) => ({ ...s, [key]: "loading" }));
    void (async () => {
      try {
        await fn();
        setClientState((s) => ({ ...s, [key]: "done" }));
        timers.current.push(setTimeout(() => setClientState((s) => ({ ...s, [key]: "idle" })), 1500));
      } catch {
        setClientState((s) => ({ ...s, [key]: "error" }));
        timers.current.push(setTimeout(() => setClientState((s) => ({ ...s, [key]: "idle" })), 2000));
      }
    })();
  }, []);

  async function clearCachesAndReload() {
    if (!window.confirm("Clear local storage, caches and query data, then reload?")) return;
    try {
      localStorage.clear();
      sessionStorage.clear();
      queryClient.clear();
      if (typeof caches !== "undefined") {
        for (const k of await caches.keys()) await caches.delete(k);
      }
    } finally {
      window.location.reload();
    }
  }

  async function resetOnboarding() {
    if (!window.confirm("Re-arm the first-run wizard? The app will reload.")) return;
    await fetch("/api/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ firstRunComplete: false }),
    });
    window.location.reload();
  }

  async function handleAction(action: SeedAction) {
    setStates((s) => ({ ...s, [action]: "loading" }));
    setMessages((m) => ({ ...m, [action]: undefined }));
    try {
      const msg = await runSeed(action);
      setStates((s) => ({ ...s, [action]: "done" }));
      setMessages((m) => ({ ...m, [action]: msg }));
      await queryClient.invalidateQueries();
      await loadStats();
      setTimeout(() => setStates((s) => ({ ...s, [action]: "idle" })), 3000);
    } catch (e) {
      setStates((s) => ({ ...s, [action]: "idle" }));
      setMessages((m) => ({ ...m, [action]: e instanceof Error ? e.message : "error" }));
    }
  }


  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="h-[24px] px-[10px] inline-flex items-center gap-[6px] bg-transparent border border-transparent rounded-sm text-txt-2 font-[inherit] text-[12.5px] cursor-pointer hover:bg-bg-2 hover:border-line"
      >
        <Icon name="terminal" size={12} />
        Dev
      </button>

      {fpsEnabled ? <FpsMeter /> : null}

      <ModalShell open={open} onClose={() => setOpen(false)} maxWidth={660} bareContent>
        {/* Header */}
        <div className="flex items-center gap-[10px] px-4 py-[11px] border-b border-line shrink-0">
          <span className="flex items-center justify-center w-[24px] h-[24px] rounded-[7px] bg-acc-faint text-acc shrink-0">
            <Icon name="terminal" size={13} />
          </span>
          <span className="font-[var(--font-mono)] text-[12.5px] font-semibold tracking-[0.03em] text-txt">
            DEV CONSOLE
          </span>
          <span className="font-[var(--font-mono)] text-[10px] text-txt-3 px-[7px] py-[2px] rounded-full bg-bg-2 border border-line">
            {process.env.NODE_ENV} · v{APP_VERSION}
          </span>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close"
            className="ml-auto w-[26px] h-[26px] rounded-full inline-flex items-center justify-center text-txt-3 hover:text-txt hover:bg-bg-2 cursor-pointer transition-colors"
          >
            <Icon name="x" size={15} />
          </button>
        </div>

        {/* Two-pane body */}
        <div className="flex flex-nowrap flex-1 min-h-0">
          {/* Rail */}
          <nav
            aria-label="Dev console sections"
            className="w-[168px] shrink-0 border-r border-line p-2 flex flex-col gap-[2px] overflow-y-auto"
          >
            {CATS.map((c) => {
              const active = c.id === cat;
              return (
                <button
                  key={c.id}
                  type="button"
                  aria-current={active ? "page" : undefined}
                  onClick={() => setCat(c.id)}
                  className={cn(
                    "flex items-center gap-[9px] h-[32px] px-[10px] rounded-[8px] w-full text-left text-[12.5px] cursor-pointer",
                    "transition-[background-color,color] duration-[120ms] border border-transparent",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acc",
                    active
                      ? "bg-acc-faint text-acc font-medium border-[var(--acc-tint)]"
                      : "text-txt-3 hover:text-txt hover:bg-bg-2",
                  )}
                >
                  <Icon name={c.icon} size={15} className="shrink-0" />
                  {c.label}
                </button>
              );
            })}
          </nav>

          {/* Content */}
          <div className="flex-1 min-w-0 overflow-auto p-4 flex flex-col gap-6">
            {cat === "interface" && (
              <div>
                <SectionLabel>Interface</SectionLabel>
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-bg-2 border border-line">
                    <span className="text-txt-3 shrink-0"><Icon name="gauge" size={15} /></span>
                    <div className="flex-1 min-w-0">
                      <div className="text-[12.5px] font-medium text-txt">Rendering budget</div>
                      <div className="text-[11px] text-txt-3 mt-[3px] leading-[1.45]">How much the UI renders. Lite/Off flatten the office to cards.</div>
                    </div>
                    <div className="w-[168px] shrink-0">
                      <Segmented<PerformanceMode>
                        value={perfMode}
                        onChange={setPerfMode}
                        options={[{ value: "full", label: "Full" }, { value: "lite", label: "Lite" }, { value: "off", label: "Off" }]}
                      />
                    </div>
                  </div>
                  <ToggleRow icon="zap" label="Reduce motion" desc="Collapse animations and transitions across the app." checked={instruments.reduceMotion} onChange={(v) => setInstruments((p) => ({ ...p, reduceMotion: v }))} />
                  <ToggleRow icon="activity" label="FPS meter" desc="Pin a live frame-rate readout to the corner." checked={fpsEnabled} onChange={setFpsEnabled} />
                  <ToggleRow icon="crosshair" label="Component outlines" desc="Outline every element boundary to spot layout bugs." checked={instruments.outlines} onChange={(v) => setInstruments((p) => ({ ...p, outlines: v }))} />
                </div>
              </div>
            )}

            {cat === "data" && (
              <div>
                <SectionLabel>Demo data</SectionLabel>
                <div className="flex flex-col gap-2">
                  <DevButton icon="sparkle" label="Seed showcase world (3 projects, chats, activity)" variant="accent" state={states.showcase} message={messages.showcase} onClick={() => handleAction("showcase")} />
                  <DevButton icon="trash" label="Clear showcase" variant="danger" state={states["clear-showcase"]} message={messages["clear-showcase"]} onClick={() => handleAction("clear-showcase")} />
                </div>
              </div>
            )}

            {cat === "database" && (
              <div>
                <SectionLabel hint={stats ? fmtBytes(stats.dbSizeBytes) : ""}>Database</SectionLabel>
                {stats ? (
                  <div className="mb-3 bg-bg-2 rounded-lg px-3 py-2.5 border border-line flex flex-col gap-1">
                    <div className="flex flex-wrap gap-y-1">
                      <StatCell label="Runs" value={stats.runsCount.toLocaleString()} />
                      <StatCell label="Messages" value={stats.messagesCount.toLocaleString()} />
                      <StatCell label="Agents" value={stats.agentsCount.toLocaleString()} />
                      <StatCell label="DB size" value={fmtBytes(stats.dbSizeBytes)} />
                    </div>
                    {stats.orphansCount > 0 && (
                      <div className="mt-1 pt-2 border-t border-line text-[11px] font-[var(--font-mono)] text-[var(--queued)] flex items-center gap-1.5">
                        <Icon name="slash" size={12} />
                        {stats.orphansCount} orphaned running run{stats.orphansCount !== 1 ? "s" : ""}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="h-[74px] bg-bg-2 rounded-lg border border-line mb-3 flex items-center justify-center text-txt-4 text-[11px] font-[var(--font-mono)]">loading…</div>
                )}
                <div className="flex flex-col gap-2">
                  <DevButton
                    icon="wrench"
                    label={`Fix orphans${stats?.orphansCount ? ` (${stats.orphansCount})` : ""}`}
                    state={states["fix-orphans"]}
                    message={messages["fix-orphans"]}
                    onClick={() => handleAction("fix-orphans")}
                  />
                  <DevButton icon="trash" label="Clear ALL runs & messages" variant="danger" state={states["clear-all-runs"]} message={messages["clear-all-runs"]} onClick={() => handleAction("clear-all-runs")} />
                  <Field label="DB path" value={stats?.dbPath ?? "…"} copyable />
                </div>
              </div>
            )}

            {cat === "simulate" && (
              <div>
                <SectionLabel hint="inject fake state">Simulate</SectionLabel>
                <p className="text-[11.5px] text-txt-3 leading-[1.5] mb-3">
                  Push synthetic events into the active project to exercise the UI without a real agent run.
                </p>
                <div className="flex flex-col gap-2">
                  <DevButton icon="play" label="Spawn a fake run" planned />
                  <DevButton icon="bot" label="Inject working status" planned />
                  <DevButton icon="sparkle" label="Inject thinking status" planned />
                  <DevButton icon="send" label="Push a fake agent message" planned />
                  <DevButton icon="slash" label="Trigger rate-limit banner" planned />
                  <DevButton icon="x" label="Inject run error" variant="danger" planned />
                </div>
              </div>
            )}

            {cat === "inspect" && (
              <div>
                <SectionLabel>Inspect</SectionLabel>
                <div className="flex flex-col gap-2 mb-4">
                  <DevButton icon="code" label="Dump Zustand stores to console" state={clientState.dump} onClick={() => runClient("dump", dumpStores)} />
                  <DevButton icon="copy" label="Copy app-state snapshot" state={clientState.snapshot} onClick={() => runClient("snapshot", () => navigator.clipboard.writeText(appStateSnapshot()))} />
                </div>
                <SectionLabel>Feature flags</SectionLabel>
                <div className="flex flex-col gap-2">
                  <ToggleRow icon="edit" label="New composer" desc="Experimental prompt composer." planned checked={false} onChange={() => {}} />
                  <ToggleRow icon="templates" label="Workflow builder v2" desc="Node-based pipeline editor." planned checked={false} onChange={() => {}} />
                  <ToggleRow icon="globe" label="Remote agents" desc="Run agents on a remote host." planned checked={false} onChange={() => {}} />
                </div>
              </div>
            )}

            {cat === "environment" && (
              <div>
                <SectionLabel>Environment</SectionLabel>
                <div className="flex flex-col gap-2">
                  <Field label="Version" value={`v${APP_VERSION}`} copyable />
                  <Field label="Mode" value={process.env.NODE_ENV ?? "—"} />
                  <Field label="Commit" value={GIT_SHA || "unknown"} copyable={!!GIT_SHA} />
                  <Field label="DB size" value={stats ? fmtBytes(stats.dbSizeBytes) : "…"} />
                  <Field label="DB path" value={stats?.dbPath ?? "…"} copyable />
                  <Field label="Uptime" value={fmtUptime(uptimeNow - BOOT_TS)} />
                </div>
              </div>
            )}

            {cat === "utilities" && (
              <div>
                <SectionLabel>Utilities</SectionLabel>
                <div className="flex flex-col gap-2">
                  <DevButton icon="refresh" label="Reload window" onClick={() => window.location.reload()} />
                  {isTauri() && (
                    <DevButton icon="download" label="Check for updates" onClick={() => requestUpdateCheck()} />
                  )}
                  <DevButton icon="archive" label="Clear caches & hard reload" onClick={() => void clearCachesAndReload()} />
                  <DevButton icon="folder" label="Open logs folder" planned />
                  <DevButton icon="undo" label="Reset onboarding" onClick={() => void resetOnboarding()} />
                </div>
              </div>
            )}
          </div>
        </div>
      </ModalShell>
    </>
  );
}

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="basis-1/2 flex items-baseline justify-between pr-4">
      <span className="text-[11px] font-[var(--font-mono)] text-txt-4">{label}</span>
      <span className="text-[11.5px] font-[var(--font-mono)] text-txt-2">{value}</span>
    </div>
  );
}
