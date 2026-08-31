"use client";

import { useState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Icon } from "@/components/ui/icon";
import { ActionBar, type ActionBarItem } from "@/components/ui/action-bar";
import { Tooltip } from "@/components/ui/tooltip";
import { ProjectChip } from "@/modules/projects/components/project-chip";
import { cn } from "@/lib/cn";
import { useActiveProjectStore } from "@/lib/active-project-store";
import { useProject } from "@/modules/projects/hooks/use-projects";
import { AddAgentModal } from "@/modules/projects/components/add-agent-modal";
import { useFlutterStore } from "@/lib/flutter-store";
import { useFlutterDevices } from "@/modules/flutter/hooks/use-flutter-devices";
import { useIntegrationEnabled } from "@/modules/settings/hooks/use-settings";
import { useDevServerStore } from "@/lib/dev-server-store";
import {
  getDevConfig,
  startDevCommand,
  installDeps,
  getBuildInfo,
  startBuild as startProjectBuild,
  clearBuildCache,
  openProjectFolder,
} from "@/lib/api/dev-server";
import { listProcesses, getProcess, killProcess } from "@/lib/api/processes";

// Shared compact button style for all toolbar action buttons
const TBTN = "inline-flex items-center gap-[5px] px-[9px] h-[30px] rounded-[7px] text-[12px] text-txt-2 border border-transparent hover:bg-bg-3 hover:text-txt transition-[background,color,border-color] duration-[120ms] cursor-pointer select-none shrink-0";

// Full-width labelled row used when an action is rendered inside the kebab menu
const MROW = "flex items-center gap-[10px] w-full h-[34px] px-[10px] rounded-[7px] text-[13px] text-txt-2 hover:bg-bg-3 hover:text-txt transition-colors duration-[120ms] cursor-pointer select-none text-left disabled:cursor-default disabled:hover:bg-transparent";

type InstallState = "unknown" | "needed" | "installing" | "done" | "failed";

type RunState =
  | { phase: "idle" }
  | { phase: "starting" }
  | { phase: "running"; pid: number; port: number | null; url: string | null }
  | { phase: "stopping" };

export function DevServerButton({ projectId, menu = false }: { projectId: string; menu?: boolean }) {
  const [install, setInstall] = useState<InstallState>("unknown");
  const [installError, setInstallError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);

  const qc = useQueryClient();
  const store = useDevServerStore();

  const devQ = useQuery({
    queryKey: ["project-dev-config", projectId],
    queryFn: () => getDevConfig(projectId),
    staleTime: 60_000,
  });

  const commands = devQ.data?.commands ?? [];
  const hasPackageJson = devQ.data?.hasPackageJson ?? false;

  // Sync install state from query data (only when we don't have a local override)
  useEffect(() => {
    if (!devQ.data || install !== "unknown") return;
    setInstall(devQ.data.hasNodeModules ? "done" : devQ.data.hasPackageJson ? "needed" : "done");
  }, [devQ.data, install]);

  // Reconcile UI state with already-running processes (once per project, persisted in store)
  useEffect(() => {
    if (commands.length === 0 || store.isReconciled(projectId)) return;
    store.markReconciled(projectId);
    listProcesses()
      .then((processes) => {
        const mine = processes.filter((p) => p.projectId === projectId);
        if (mine.length === 0) return;
        for (const proc of mine) {
          const alreadyTracked = commands.some((cmd) => {
            const s = store.getRunState(projectId, cmd.key);
            return s.phase === "running" && s.pid === proc.pid;
          });
          if (alreadyTracked) continue;
          const matched =
            commands.find((cmd) => {
              const scriptName = cmd.argv[cmd.argv.length - 1] ?? "";
              return proc.cmd.includes(scriptName) || proc.cmd.includes(cmd.key);
            }) ?? commands[0]!;
          if (matched && store.getRunState(projectId, matched.key).phase === "idle") {
            store.setRunState(projectId, matched.key, {
              phase: "running",
              pid: proc.pid,
              port: proc.port,
              url: `http://localhost:${proc.port}`,
            });
          }
        }
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commands.length, projectId]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!dropRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  function getState(key: string): RunState {
    return store.getRunState(projectId, key) as RunState;
  }

  function setKeyState(key: string, s: RunState) {
    store.setRunState(projectId, key, s);
  }

  async function runInstall(): Promise<boolean> {
    setInstall("installing");
    setInstallError(null);
    try {
      await installDeps(projectId);
      setInstall("done");
      // node_modules now exists — refresh the dev-config so button state and the
      // Dev/Build buttons reflect it without a manual reload.
      void qc.invalidateQueries({ queryKey: ["project-dev-config", projectId] });
      return true;
    } catch (err) {
      setInstall("failed");
      setInstallError(err instanceof Error ? err.message : "Install failed");
      return false;
    }
  }

  async function startCmd(key: string) {
    // Smart default: if deps were never installed, install them first instead
    // of launching a dev server that would immediately crash on missing modules.
    if (install === "needed" || install === "failed") {
      const ok = await runInstall();
      if (!ok) return;
    }
    setKeyState(key, { phase: "starting" });
    try {
      const body = await startDevCommand(projectId, key);
      setKeyState(key, { phase: "running", pid: body.pid ?? 0, port: body.port ?? null, url: body.url ?? null });
    } catch {
      setKeyState(key, { phase: "idle" });
    }
  }

  async function stopCmd(key: string) {
    const s = getState(key);
    if (s.phase !== "running") return;
    setKeyState(key, { phase: "stopping" });
    try { await killProcess(s.pid); } catch { /* best-effort */ }
    setKeyState(key, { phase: "idle" });
  }

  const runningCount = commands.filter((cmd) => store.getRunState(projectId, cmd.key).phase === "running").length;
  // Only block the Dev/Start buttons while an install is actually running.
  // When deps are merely "needed", clicking Dev auto-installs first (startCmd).
  const busyInstall = install === "installing";

  // No package.json and no detected commands (e.g. non-JS project) — hide entirely
  if (install !== "unknown" && install !== "installing" && !hasPackageJson && commands.length === 0) {
    return null;
  }

  // ── Install button ──────────────────────────────────────────────────────────
  const installBtn = install === "needed" ? (
    <button type="button" className={TBTN} onClick={() => { void runInstall(); }}>
      <Icon name="download" size={12} /> Install
    </button>
  ) : install === "installing" ? (
    <button type="button" className={TBTN} disabled>
      <Icon name="refresh" size={12} className="[animation:spin_1s_linear_infinite]" /> Installing…
    </button>
  ) : install === "failed" ? (
    <Tooltip content={installError ?? "Install failed — click to retry"} side="bottom">
      <button type="button" className={cn(TBTN, "text-[var(--error)]")} onClick={() => { void runInstall(); }}>
        <Icon name="x" size={12} /> Install failed — retry
      </button>
    </Tooltip>
  ) : null;

  // ── Menu layout: every command as an inline row, no nested dropdown ─────────
  if (menu) {
    const installRow =
      install === "needed" ? (
        <button type="button" className={MROW} onClick={() => { void runInstall(); }}>
          <Icon name="download" size={13} /> Install dependencies
        </button>
      ) : install === "installing" ? (
        <button type="button" className={MROW} disabled>
          <Icon name="refresh" size={13} className="[animation:spin_1s_linear_infinite]" /> Installing…
        </button>
      ) : install === "failed" ? (
        <button type="button" className={cn(MROW, "text-[var(--error)]")} onClick={() => { void runInstall(); }}>
          <Icon name="x" size={13} /> Install failed — retry
        </button>
      ) : null;

    if (commands.length === 0) return installRow;

    return (
      <>
        {installRow}
        {commands.map((cmd) => {
          const s = getState(cmd.key);
          const busy = s.phase === "starting" || s.phase === "stopping";
          const running = s.phase === "running";
          return (
            <div key={cmd.key} className="flex items-center gap-[8px] w-full h-[34px] pl-[10px] pr-[6px] rounded-[7px] hover:bg-bg-3 group">
              <Icon
                name="play"
                size={12}
                className={cn("shrink-0", running ? "text-[var(--working)]" : "text-txt-3")}
              />
              <span className={cn("flex-1 text-[13px] truncate", running ? "text-txt" : "text-txt-2")}>{cmd.name}</span>
              {running && s.port !== null && (
                <a
                  href={s.url ?? "#"} target="_blank" rel="noopener noreferrer"
                  className="font-mono text-[11px] text-[var(--working)] no-underline px-1 py-0.5 rounded bg-[color-mix(in_srgb,var(--working)_12%,transparent)] border border-[color-mix(in_srgb,var(--working)_25%,transparent)]"
                  onClick={(e) => e.stopPropagation()}
                >
                  :{s.port}
                </a>
              )}
              {busy && <Icon name="refresh" size={13} className="text-txt-3 [animation:spin_1s_linear_infinite] shrink-0" />}
              {!busy && !running && (
                <button
                  type="button"
                  onClick={() => { void startCmd(cmd.key); }}
                  disabled={busyInstall}
                  className="w-6 h-6 flex items-center justify-center rounded-[5px] text-txt-3 hover:text-txt hover:bg-bg-4 shrink-0 disabled:opacity-40"
                  title={`Start ${cmd.name}`}
                >
                  <Icon name="play" size={11} />
                </button>
              )}
              {!busy && running && (
                <button
                  type="button"
                  onClick={() => { void stopCmd(cmd.key); }}
                  className="w-6 h-6 flex items-center justify-center rounded-[5px] text-txt-3 hover:text-txt hover:bg-bg-4 shrink-0"
                  title={`Stop ${cmd.name}`}
                >
                  <Icon name="stop" size={11} />
                </button>
              )}
            </div>
          );
        })}
      </>
    );
  }

  // ── Single command: inline buttons ─────────────────────────────────────────
  if (commands.length === 1) {
    const cmd = commands[0]!;
    const s = getState(cmd.key);
    return (
      <span className="inline-flex items-center gap-1">
        {installBtn}
        {s.phase === "idle" && (
          <Tooltip content="Start dev server" side="bottom">
            <button type="button" className={TBTN} onClick={() => { void startCmd(cmd.key); }} disabled={busyInstall}>
              <Icon name="play" size={11} /> Dev
            </button>
          </Tooltip>
        )}
        {(s.phase === "starting" || s.phase === "stopping") && (
          <button type="button" className={TBTN} disabled>
            <Icon name="refresh" size={11} className="[animation:spin_1s_linear_infinite]" />
            {s.phase === "starting" ? "Starting…" : "Stopping…"}
          </button>
        )}
        {s.phase === "running" && (
          <>
            {s.port !== null && (
              <Tooltip content={`Open ${s.url}`} side="bottom">
                <a
                  href={s.url ?? "#"} target="_blank" rel="noopener noreferrer"
                  className="font-mono text-[11px] text-[var(--working)] no-underline px-[7px] h-[30px] inline-flex items-center rounded-[7px] bg-[color-mix(in_srgb,var(--working)_10%,transparent)] border border-[color-mix(in_srgb,var(--working)_25%,transparent)] hover:bg-[color-mix(in_srgb,var(--working)_18%,transparent)] transition-colors"
                >
                  :{s.port}
                </a>
              </Tooltip>
            )}
            <Tooltip content="Stop dev server" side="bottom">
              <button type="button" className={TBTN} onClick={() => { void stopCmd(cmd.key); }}>
                <Icon name="stop" size={11} /> Stop
              </button>
            </Tooltip>
          </>
        )}
      </span>
    );
  }

  // ── Multiple commands: dropdown ─────────────────────────────────────────────
  if (commands.length > 1) {
    return (
      <>
        <span className="inline-flex items-center gap-1.5">
          {installBtn}
          <div ref={dropRef} className="relative">
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className={cn(
                "inline-flex items-center gap-[6px] text-txt-2 px-[10px] py-[5px] rounded-[7px] text-[12.5px] border border-transparent transition-[background,color,border-color] duration-[120ms] hover:bg-bg-3 hover:text-txt",
                open && "bg-bg-3 text-txt",
                runningCount > 0 && "text-[var(--working)]",
              )}
              disabled={busyInstall}
            >
              <Icon name="play" size={12} />
              {runningCount > 0 ? `${runningCount} running` : "Dev servers"}
              <Icon name="chevron-down" size={10} />
            </button>

            {open && (
              <div className="absolute top-[calc(100%+6px)] right-0 w-[220px] surface-sheen rounded-[14px] shadow-[var(--lift)] z-50 py-1 overflow-hidden">
                {commands.map((cmd) => {
                  const s = getState(cmd.key);
                  const busy = s.phase === "starting" || s.phase === "stopping";
                  return (
                    <div key={cmd.key} className="flex items-center gap-2 px-3 py-[7px] hover:bg-[var(--bg-3)] group">
                      <span className={cn("flex-1 text-[13px] truncate", s.phase === "running" ? "text-[var(--txt)]" : "text-[var(--txt-2)]")}>
                        {cmd.name}
                      </span>
                      {s.phase === "running" && s.port !== null && (
                        <a
                          href={s.url ?? "#"} target="_blank" rel="noopener noreferrer"
                          className="font-mono text-[11px] text-[var(--working)] no-underline px-1 py-0.5 rounded bg-[color-mix(in_srgb,var(--working)_12%,transparent)] border border-[color-mix(in_srgb,var(--working)_25%,transparent)]"
                          onClick={(e) => e.stopPropagation()}
                        >
                          :{s.port}
                        </a>
                      )}
                      {busy && (
                        <Icon name="refresh" size={13} className="text-[var(--txt-3)] [animation:spin_1s_linear_infinite] shrink-0" />
                      )}
                      {!busy && s.phase === "idle" && (
                        <Tooltip content={`Start ${cmd.name}`} side="left" delayMs={300}>
                          <button
                            type="button"
                            onClick={() => { void startCmd(cmd.key); }}
                            className="w-6 h-6 flex items-center justify-center rounded-[5px] text-[var(--txt-3)] hover:text-[var(--txt)] hover:bg-[var(--bg-4)] opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                          >
                            <Icon name="play" size={11} />
                          </button>
                        </Tooltip>
                      )}
                      {!busy && s.phase === "running" && (
                        <Tooltip content={`Stop ${cmd.name}`} side="left" delayMs={300}>
                          <button
                            type="button"
                            onClick={() => { void stopCmd(cmd.key); }}
                            className="w-6 h-6 flex items-center justify-center rounded-[5px] text-[var(--txt-3)] hover:text-[var(--txt)] hover:bg-[var(--bg-4)] opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                          >
                            <Icon name="stop" size={11} />
                          </button>
                        </Tooltip>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </span>
      </>
    );
  }

  // ── No commands detected ────────────────────────────────────────────────────
  return installBtn;
}

export function FlutterDeviceButton() {
  const flutterEnabled = useIntegrationEnabled("flutter");
  const setOpen = useFlutterStore((s) => s.setOpen);
  const devicesQ = useFlutterDevices(flutterEnabled);
  const devices = devicesQ.data?.devices ?? [];
  const available = devicesQ.data?.available ?? false;
  const connected = devices.filter((d) => d.status === "device");
  const hasDevice = connected.length > 0;

  if (!flutterEnabled || !devicesQ.isSuccess || !available || !hasDevice) return null;

  const label = connected.length > 1 ? `${connected.length} devices` : (connected[0]?.model ?? "Device");
  const tip = `${connected.length} device${connected.length !== 1 ? "s" : ""} connected — open Flutter manager`;

  return (
    <Tooltip content={tip} side="bottom">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(TBTN, "text-[#54C5F8] hover:text-[#54C5F8]")}
      >
        <Icon name="smartphone" size={12} />
        {label}
      </button>
    </Tooltip>
  );
}

export function OpenFolderButton({ projectId, menu = false }: { projectId: string; menu?: boolean }) {
  if (menu) {
    return (
      <button type="button" className={MROW} onClick={() => { void openProjectFolder(projectId); }}>
        <Icon name="folder" size={13} /> Open project folder
      </button>
    );
  }
  return (
    <Tooltip content="Open project folder" side="bottom">
      <button type="button" className={TBTN}
        onClick={() => { void openProjectFolder(projectId); }}>
        <Icon name="folder" size={13} />
      </button>
    </Tooltip>
  );
}

export function OpenInVSCodeButton({ projectId, menu = false }: { projectId: string; menu?: boolean }) {
  if (menu) {
    return (
      <button type="button" className={MROW} onClick={() => { void openProjectFolder(projectId, "code"); }}>
        <Icon name="code" size={13} /> Open in VS Code
      </button>
    );
  }
  return (
    <Tooltip content="Open in VS Code" side="bottom">
      <button type="button" className={TBTN}
        onClick={() => { void openProjectFolder(projectId, "code"); }}>
        <Icon name="code" size={13} />
      </button>
    </Tooltip>
  );
}

type BuildPhase = "idle" | "building" | "done" | "error";

export function ClearCacheButton({ projectId, menu = false }: { projectId: string; menu?: boolean }) {
  const [phase, setPhase] = useState<"idle" | "clearing" | "done" | "error">("idle");

  async function clearCache() {
    if (phase !== "idle") return;
    setPhase("clearing");
    try {
      await clearBuildCache(projectId);
      setPhase("done");
    } catch {
      setPhase("error");
    }
    setTimeout(() => setPhase("idle"), 2500);
  }

  if (menu) {
    return (
      <button type="button" className={cn(MROW, phase === "done" && "text-[var(--ok)]", phase === "error" && "text-[var(--error)]")} onClick={() => { void clearCache(); }} disabled={phase !== "idle"}>
        <Icon
          name={phase === "clearing" ? "refresh" : phase === "done" ? "check" : phase === "error" ? "x" : "trash"}
          size={13}
          className={cn("shrink-0", phase === "clearing" && "[animation:spin_1s_linear_infinite]")}
        />
        {phase === "clearing" ? "Clearing cache…" : phase === "done" ? "Cache cleared" : phase === "error" ? "Clear failed" : "Clear build cache"}
      </button>
    );
  }

  if (phase === "clearing") {
    return (
      <button type="button" className={TBTN} disabled>
        <Icon name="refresh" size={12} className="[animation:spin_1s_linear_infinite]" />
      </button>
    );
  }
  if (phase === "done") {
    return (
      <button type="button" className={cn(TBTN, "text-[var(--ok)]")} disabled>
        <Icon name="check" size={12} />
      </button>
    );
  }
  if (phase === "error") {
    return (
      <button type="button" className={cn(TBTN, "text-[var(--error)]")} disabled>
        <Icon name="x" size={12} />
      </button>
    );
  }
  return (
    <Tooltip content="Clear build cache (.next, .turbo, node_modules/.cache)" side="bottom">
      <button type="button" className={TBTN} onClick={() => { void clearCache(); }}>
        <Icon name="trash" size={12} />
      </button>
    </Tooltip>
  );
}

export function BuildButton({ projectId, menu = false }: { projectId: string; menu?: boolean }) {
  const [phase, setPhase] = useState<BuildPhase>("idle");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => { return () => { if (pollRef.current) clearInterval(pollRef.current); }; }, []);

  const buildQ = useQuery({
    queryKey: ["project-build-check", projectId],
    queryFn: () => getBuildInfo(projectId),
    staleTime: 60_000,
  });

  const hasBuild = buildQ.data?.hasBuild ?? false;

  async function startBuild() {
    if (phase !== "idle") return;
    setPhase("building");
    try {
      const body = await startProjectBuild(projectId);
      if (!body.pid) { setPhase("done"); setTimeout(() => setPhase("idle"), 2000); return; }

      const pid = body.pid;
      pollRef.current = setInterval(async () => {
        const data = await getProcess(pid).catch(() => null);
        if (!data) return;
        if (!data.alive) {
          clearInterval(pollRef.current!);
          pollRef.current = null;
          setPhase("done");
          setTimeout(() => setPhase("idle"), 3000);
        }
      }, 2000);
    } catch {
      setPhase("error");
      setTimeout(() => setPhase("idle"), 3000);
    }
  }

  if (!hasBuild) return null;

  if (menu) {
    return (
      <button type="button" className={cn(MROW, phase === "done" && "text-[var(--ok)]", phase === "error" && "text-[var(--error)]")} onClick={() => { void startBuild(); }} disabled={phase !== "idle"}>
        <Icon
          name={phase === "building" ? "refresh" : phase === "done" ? "check" : phase === "error" ? "x" : "zap"}
          size={13}
          className={cn("shrink-0", phase === "building" && "[animation:spin_1s_linear_infinite]")}
        />
        {phase === "building" ? "Building…" : phase === "done" ? "Built" : phase === "error" ? "Build failed" : "Build project"}
      </button>
    );
  }

  if (phase === "building") {
    return (
      <button type="button" className={TBTN} disabled>
        <Icon name="refresh" size={12} className="[animation:spin_1s_linear_infinite]" /> Building…
      </button>
    );
  }
  if (phase === "done") {
    return (
      <button type="button" className={cn(TBTN, "text-[var(--ok)]")} disabled>
        <Icon name="check" size={12} /> Built
      </button>
    );
  }
  if (phase === "error") {
    return (
      <button type="button" className={cn(TBTN, "text-[var(--error)]")} disabled>
        <Icon name="x" size={12} /> Failed
      </button>
    );
  }
  return (
    <Tooltip content="Build project" side="bottom">
      <button type="button" className={TBTN} onClick={() => { void startBuild(); }}>
        <Icon name="zap" size={12} /> Build
      </button>
    </Tooltip>
  );
}

/**
 * Canonical project action bar — single source of truth for all toolbar headers.
 * Used in OfficeToolbar, CardsOffice, and project-detail so every header stays in sync.
 */
export function ProjectActionsBar({ projectId }: { projectId: string }) {
  const hasCwd = useProjectHasCwd(projectId);

  return (
    <ActionBar
      items={[
        ...(hasCwd ? [
          ...shortcutItems(projectId),
          { key: `div-${projectId}`, type: "divider" as const },
          ...runtimeItems(projectId),
        ] : []),
        { key: "flutter-device", element: <FlutterDeviceButton /> },
      ]}
    />
  );
}

/**
 * Folder / VS Code / clear-cache only — the "shortcuts" segment of
 * {@link ProjectActionsBar} split out so a header can place it somewhere
 * other than next to Build/Dev server (e.g. {@link ProjectHero}'s avatar
 * row, to the left of the roster stack, instead of crowding the "Add agent"
 * row above it).
 */
export function ProjectShortcutsBar({ projectId }: { projectId: string }) {
  const hasCwd = useProjectHasCwd(projectId);
  if (!hasCwd) return null;
  return <ActionBar items={shortcutItems(projectId)} />;
}

/** Build / dev server / Flutter device only — the "runtime" counterpart to {@link ProjectShortcutsBar}. */
export function ProjectRuntimeBar({ projectId }: { projectId: string }) {
  const hasCwd = useProjectHasCwd(projectId);
  return (
    <ActionBar
      items={[
        ...(hasCwd ? runtimeItems(projectId) : []),
        { key: "flutter-device", element: <FlutterDeviceButton /> },
      ]}
    />
  );
}

function useProjectHasCwd(projectId: string): boolean {
  const projectQ = useProject(projectId);
  return !!projectQ.data?.meta.cwd;
}

function shortcutItems(projectId: string): ActionBarItem[] {
  return [
    { key: `folder-${projectId}`, element: <OpenFolderButton projectId={projectId} />, segment: "shortcuts", priority: 10 },
    { key: `vscode-${projectId}`, element: <OpenInVSCodeButton projectId={projectId} />, segment: "shortcuts", priority: 10 },
    { key: `cache-${projectId}`, element: <ClearCacheButton projectId={projectId} />, segment: "shortcuts", priority: 9 },
  ];
}

function runtimeItems(projectId: string): ActionBarItem[] {
  return [
    { key: `build-${projectId}`, element: <BuildButton key={`build-${projectId}`} projectId={projectId} />, segment: "runtime", priority: 5 },
    { key: `dev-${projectId}`, element: <DevServerButton key={`dev-${projectId}`} projectId={projectId} />, segment: "runtime", priority: 5 },
  ];
}

/**
 * Kebab (⋮) menu variant of the project actions — used in the agent
 * conversation modal header, where the horizontal toolbar has no room. Every
 * action (including each dev command) renders as an inline row; no nested
 * dropdowns.
 */
export function ProjectActionsMenu({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const projectQ = useProject(projectId);
  const hasCwd = !!projectQ.data?.meta.cwd;

  // Mirror BuildButton's own gate so we can bracket it with dividers only when
  // it actually renders (react-query dedupes this against the child's query).
  const buildQ = useQuery({
    queryKey: ["project-build-check", projectId],
    queryFn: () => getBuildInfo(projectId),
    staleTime: 60_000,
  });
  const hasBuild = buildQ.data?.hasBuild ?? false;

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  if (!hasCwd) return null;

  return (
    <div ref={ref} className="relative">
      <Tooltip content="Project actions" side="bottom" delayMs={400}>
        <button
          type="button"
          aria-label="Project actions"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className={cn(
            "inline-flex items-center justify-center w-[34px] h-[34px] rounded-[12px] text-txt-2 hover:text-txt hover:bg-bg-3 border border-transparent hover:border-line transition-all duration-[120ms]",
            open && "bg-bg-3 text-txt border-line",
          )}
        >
          <Icon name="more-vertical" size={15} />
        </button>
      </Tooltip>
      {open && (
        <div className="absolute top-[calc(100%+6px)] right-0 w-[240px] surface-sheen rounded-[14px] shadow-[var(--lift)] z-[9999] p-1 flex flex-col gap-[1px]">
          <OpenFolderButton projectId={projectId} menu />
          <OpenInVSCodeButton projectId={projectId} menu />
          <ClearCacheButton projectId={projectId} menu />
          <div className="h-px bg-[var(--line-2)] my-1 mx-1" />
          {hasBuild && (
            <>
              <BuildButton projectId={projectId} menu />
              <div className="h-px bg-[var(--line-2)] my-1 mx-1" />
            </>
          )}
          <DevServerButton projectId={projectId} menu />
        </div>
      )}
    </div>
  );
}

export type OfficeToolbarProps = {
  agentCount: number;
  workingCount: number;
};

export function OfficeToolbar({ agentCount, workingCount }: OfficeToolbarProps) {
  const t = useTranslations("office");
  const activeProjectId = useActiveProjectStore((s) => s.id);
  const setActiveId = useActiveProjectStore((s) => s.setId);
  const projectQ = useProject(activeProjectId);
  const project = projectQ.data;

  const [addOpen, setAddOpen] = useState(false);

  const rosterCount = activeProjectId ? project?.meta.roster.length ?? 0 : 0;

  return (
    <header className="shrink-0 flex items-center gap-[16px]">
      <div className="flex items-center gap-[14px] min-w-0">
        <h1 className="m-0 text-[30px] font-extrabold tracking-[-0.035em] whitespace-nowrap shrink-0">{t("title")}</h1>
        {activeProjectId ? (
          <>
            <ProjectChip projectId={activeProjectId} project={project} />
            <span className="text-txt-4 font-mono text-[11.5px] shrink-0 whitespace-nowrap">
              {t("agents_count", { count: rosterCount })}
            </span>
            {workingCount > 0 && (
              <span className="flex items-center gap-[6px] font-mono text-[11.5px] text-green whitespace-nowrap shrink-0">
                <span className="w-[5px] h-[5px] rounded-full bg-green animate-pulse" />
                {t("working_count", { count: workingCount })}
              </span>
            )}
          </>
        ) : (
          <span className="text-txt-4 font-mono text-[11.5px] shrink-0">
            {t("agents_count", { count: agentCount })}
          </span>
        )}
      </div>

      <div className="ml-auto flex items-center gap-[10px]">
        {activeProjectId && <ProjectActionsBar projectId={activeProjectId} />}
        <button
          type="button"
          className="flex items-center gap-[8px] px-[18px] py-[11px] rounded-[14px] border-none bg-[linear-gradient(120deg,var(--acc-cta),var(--acc-2))] text-white text-[13.5px] font-bold cursor-pointer whitespace-nowrap shadow-[0_14px_30px_-14px_rgba(139,123,255,0.9)] transition-transform duration-150 hover:-translate-y-[2px]"
          onClick={() => setAddOpen(true)}
        >
          <Icon name="plus" size={15} /> {t("add_agent")}
        </button>
      </div>

      <AddAgentModal
        open={addOpen}
        projectId={activeProjectId}
        onClose={() => setAddOpen(false)}
        onProjectChange={(id) => setActiveId(id)}
      />
    </header>
  );
}
