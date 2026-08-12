"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ModalShell } from "@/components/ui/modal-shell";
import { Icon } from "@/components/ui/icon";
import { useFlutterStore } from "@/lib/flutter-store";
import { useActiveProjectStore } from "@/lib/active-project-store";
import { ApiError } from "@/lib/api-client";
import { getProcess, getProcessLogs, sendProcessStdin } from "@/lib/api/processes";
import {
  getFlutterRunStatus,
  startFlutterRun,
  stopFlutterRun,
  launchFlutterMirror,
} from "@/lib/api/flutter";
import { useFlutterDevices } from "../hooks/use-flutter-devices";
import type { FlutterDevice } from "../hooks/use-flutter-devices";

/* ------------------------------------------------------------------ */
/* Types                                                                */
/* ------------------------------------------------------------------ */

type RunState =
  | { phase: "idle" }
  | { phase: "starting" }
  | { phase: "running"; pid: number }
  | { phase: "stopping" }
  | { phase: "error"; message: string };

type LogLine = { text: string; key: number };

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */

function StatusDot({ status }: { status: FlutterDevice["status"] }) {
  const color =
    status === "device"
      ? "bg-[var(--ao-ok)] shadow-[0_0_5px_var(--ao-ok)]"
      : status === "unauthorized"
        ? "bg-yellow-400 shadow-[0_0_5px_theme(colors.yellow.400)]"
        : "bg-[var(--ao-bad)]";
  return <span className={`w-[7px] h-[7px] rounded-full shrink-0 ${color}`} />;
}

function DeviceSelector({
  devices,
  activeId,
  onChange,
}: {
  devices: FlutterDevice[];
  activeId: string | null;
  onChange: (id: string) => void;
}) {
  if (devices.length <= 1) return null;
  return (
    <select
      value={activeId ?? ""}
      onChange={(e) => onChange(e.target.value)}
      className="flex-1 bg-ao-bg-2 border border-ao-line-1 rounded-[7px] px-3 py-[6px] text-[12.5px] text-ao-fg-0 font-[var(--ao-font-sans)] outline-none focus:border-[var(--ao-accent-line)]"
    >
      {devices.map((d) => (
        <option key={d.id} value={d.id}>
          {d.model} — {d.id}
        </option>
      ))}
    </select>
  );
}

/* ------------------------------------------------------------------ */
/* Log view                                                             */
/* ------------------------------------------------------------------ */

function LogView({ pid }: { pid: number | null }) {
  const [lines, setLines] = useState<LogLine[]>([]);
  const [expanded, setExpanded] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const lineKey = useRef(0);

  useEffect(() => {
    if (!pid) { setLines([]); return; }
    const activePid = pid;
    let cancelled = false;
    let lastCount = 0;

    async function poll() {
      if (cancelled) return;
      try {
        const data = await getProcessLogs(activePid);
        if (data.lines.length !== lastCount) {
          lastCount = data.lines.length;
          setLines(data.lines.slice(-80).map((text) => ({ text, key: lineKey.current++ })));
        }
      } catch { /* ignore */ }
      if (!cancelled) setTimeout(poll, 1500);
    }
    poll();
    return () => { cancelled = true; };
  }, [pid]);

  useEffect(() => {
    if (expanded) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines, expanded]);

  if (!pid) return null;

  return (
    <div className="flex flex-col gap-1 mt-[10px]">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-[6px] text-[11px] text-ao-fg-3 hover:text-ao-fg-1 bg-transparent border-0 cursor-pointer p-0 text-left"
      >
        <Icon name="terminal-ao" size={11} />
        Logs
        <Icon name="chevron-down" size={10} className={`transition-transform ${expanded ? "rotate-180" : ""}`} />
        {lines.length > 0 && (
          <span className="ml-auto text-[10px] font-mono text-ao-fg-3">{lines.length} lines</span>
        )}
      </button>
      {expanded && (
        <div className="bg-[var(--ao-bg-1)] border border-[var(--ao-line-1)] rounded-[8px] p-3 max-h-[180px] overflow-y-auto [scrollbar-width:thin] font-mono text-[10.5px] text-ao-fg-2 leading-[1.6]">
          {lines.length === 0 ? (
            <span className="text-ao-fg-3">Waiting for output…</span>
          ) : (
            lines.map((l) => (
              <div key={l.key} className="whitespace-pre-wrap break-all">
                {l.text}
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Screen panel                                                         */
/* ------------------------------------------------------------------ */

function ScreenPanel({ deviceId }: { deviceId: string | null }) {
  const [ts, setTs] = useState(0);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const screenshotUrl = deviceId
    ? `/api/flutter/screenshot?deviceId=${encodeURIComponent(deviceId)}&t=${ts}`
    : null;

  useEffect(() => {
    if (!autoRefresh || !deviceId) return;
    const id = setInterval(() => setTs(Date.now()), 2500);
    return () => clearInterval(id);
  }, [autoRefresh, deviceId]);

  const capture = useCallback(() => {
    setTs(Date.now());
    setLoading(true);
    setError(false);
  }, []);

  async function launchMirror() {
    await launchFlutterMirror(deviceId);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-semibold text-ao-fg-2 font-mono uppercase tracking-[0.05em]">Screen</span>
        <span className="flex-1 h-px bg-[var(--ao-line-0)]" />
        <button
          type="button"
          onClick={() => setAutoRefresh((v) => !v)}
          className={`inline-flex items-center gap-[5px] px-[8px] py-[4px] rounded-[6px] text-[11px] border transition-[background,border-color,color] duration-[100ms] cursor-pointer ${
            autoRefresh
              ? "bg-[color-mix(in_srgb,var(--ao-accent)_15%,transparent)] border-[var(--ao-accent-line)] text-ao-accent"
              : "bg-ao-bg-3 border-ao-line-2 text-ao-fg-3 hover:text-ao-fg-1"
          }`}
        >
          <Icon name="refresh" size={10} className={autoRefresh ? "[animation:spin_2s_linear_infinite]" : ""} />
          {autoRefresh ? "Live" : "Auto-refresh"}
        </button>
      </div>

      {/* Screenshot display */}
      <div className="flex gap-4">
        <div className="shrink-0 w-[160px] flex flex-col items-center gap-2">
          <div className="w-[160px] rounded-[12px] border-2 border-[var(--ao-line-2)] bg-[var(--ao-bg-1)] overflow-hidden flex items-center justify-center min-h-[200px] relative">
            {screenshotUrl && ts > 0 ? (
              <>
                {loading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-[var(--ao-bg-1)] z-10">
                    <Icon name="refresh" size={20} className="text-ao-fg-3 [animation:spin_1s_linear_infinite]" />
                  </div>
                )}
                {error && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-ao-fg-3 p-4">
                    <Icon name="x" size={20} />
                    <span className="text-[11px] text-center">Failed to capture screen</span>
                  </div>
                )}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={screenshotUrl}
                  alt="Device screen"
                  className="w-full h-auto"
                  style={{ display: error ? "none" : "block" }}
                  onLoad={() => setLoading(false)}
                  onError={() => { setLoading(false); setError(true); }}
                />
              </>
            ) : (
              <div className="flex flex-col items-center gap-2 text-ao-fg-3 p-4">
                <Icon name="smartphone" size={28} />
                <span className="text-[10px] text-center">Press capture to see screen</span>
              </div>
            )}
          </div>

          {ts > 0 && !error && (
            <span className="text-[10px] text-ao-fg-3 font-mono">
              {new Date(ts).toLocaleTimeString()}
            </span>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2 pt-1">
          <button
            type="button"
            onClick={capture}
            disabled={!deviceId}
            className="flex items-center gap-[6px] px-[10px] py-[7px] rounded-[8px] text-[12px] bg-ao-bg-3 border border-ao-line-2 text-ao-fg-1 hover:bg-ao-bg-4 transition-[background] duration-[100ms] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed border-solid"
          >
            <Icon name="image" size={12} /> Capture screenshot
          </button>
          <button
            type="button"
            onClick={() => { void launchMirror(); }}
            disabled={!deviceId}
            className="flex items-center gap-[6px] px-[10px] py-[7px] rounded-[8px] text-[12px] bg-[color-mix(in_srgb,var(--ao-accent)_12%,transparent)] border border-[var(--ao-accent-line)] text-ao-accent hover:bg-[color-mix(in_srgb,var(--ao-accent)_20%,transparent)] transition-[background] duration-[100ms] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed border-solid font-medium"
          >
            <Icon name="monitor" size={12} /> Open live mirror
          </button>
          <p className="text-[10.5px] text-ao-fg-3 leading-[1.4] max-w-[160px]">
            Live mirror opens scrcpy in a floating window — full-speed, touch-enabled.
          </p>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Run controls                                                         */
/* ------------------------------------------------------------------ */

function RunPanel({
  projectId,
  deviceId,
}: {
  projectId: string | null;
  deviceId: string | null;
}) {
  const [runState, setRunState] = useState<RunState>({ phase: "idle" });
  const [customPath, setCustomPath] = useState("");
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const effectivePath = customPath.trim() || null;

  // Reconcile on mount: check if flutter is already running
  useEffect(() => {
    const target = effectivePath
      ? { customPath: effectivePath }
      : projectId ? { projectId } : null;
    if (!target) return;
    getFlutterRunStatus(target)
      .then(({ pid, alive }) => {
        if (alive && pid) setRunState({ phase: "running", pid });
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Poll alive status while running
  useEffect(() => {
    const s = runState;
    if (s.phase !== "running") return;
    const { pid } = s;
    let cancelled = false;

    async function poll() {
      if (cancelled) return;
      try {
        const data = await getProcess(pid);
        if (!data.alive) {
          setRunState({ phase: "idle" });
          return;
        }
      } catch { /* ignore */ }
      if (!cancelled) pollRef.current = setTimeout(poll, 3000);
    }
    pollRef.current = setTimeout(poll, 3000);
    return () => { cancelled = true; if (pollRef.current) clearTimeout(pollRef.current); };
  }, [runState]);

  async function startRun() {
    if (!deviceId || (!effectivePath && !projectId)) return;
    setRunState({ phase: "starting" });
    try {
      const body = await startFlutterRun({
        projectId: effectivePath ? undefined : projectId ?? undefined,
        deviceId,
        customPath: effectivePath ?? undefined,
      });
      if (!body.pid) {
        setRunState({ phase: "error", message: body.error ?? "Failed to start flutter run" });
        setTimeout(() => setRunState({ phase: "idle" }), 6000);
        return;
      }
      setRunState({ phase: "running", pid: body.pid });
    } catch (e) {
      const serverError = e instanceof ApiError && e.status !== 0;
      setRunState({
        phase: "error",
        message: serverError ? e.message : "Network error — is the server running?",
      });
      setTimeout(() => setRunState({ phase: "idle" }), serverError ? 6000 : 4000);
    }
  }

  async function stopRun() {
    setRunState({ phase: "stopping" });
    try {
      await stopFlutterRun(effectivePath ? { customPath: effectivePath } : { projectId: projectId ?? "" });
    } catch { /* best-effort */ }
    setRunState({ phase: "idle" });
  }

  const pid = runState.phase === "running" ? runState.pid : null;
  const busy = runState.phase === "starting" || runState.phase === "stopping";
  const running = runState.phase === "running";
  const canStart = !!(effectivePath || projectId) && !!deviceId && runState.phase === "idle";

  async function sendStdin(data: string) {
    if (!pid) return;
    await sendProcessStdin(pid, data);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-semibold text-ao-fg-2 font-mono uppercase tracking-[0.05em]">Flutter app</span>
        <span className="flex-1 h-px bg-[var(--ao-line-0)]" />
        {running && pid && (
          <span className="flex items-center gap-[5px] text-[10px] font-mono text-[var(--ao-ok)] bg-[var(--ao-ok-soft)] border border-[rgba(78,185,111,0.25)] rounded-full px-[8px] py-[2px]">
            <span className="text-[7px]">●</span>
            running · pid {pid}
          </span>
        )}
      </div>

      {/* Custom path input */}
      <div className="flex flex-col gap-[5px]">
        <label className="text-[10.5px] text-ao-fg-3 font-mono">
          Flutter project path
          {projectId && !effectivePath && (
            <span className="ml-2 text-ao-fg-3">(defaults to active project)</span>
          )}
        </label>
        <input
          type="text"
          value={customPath}
          onChange={(e) => setCustomPath(e.target.value)}
          placeholder={projectId ? "leave blank to use active project" : "~/projects/my-app"}
          disabled={running || busy}
          className="w-full bg-ao-bg-2 border border-ao-line-1 rounded-[7px] px-3 py-[6px] text-[12px] text-ao-fg-0 font-mono outline-none focus:border-[var(--ao-accent-line)] disabled:opacity-50 placeholder:text-ao-fg-3"
        />
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {!running && (
          <button
            type="button"
            onClick={() => { void startRun(); }}
            disabled={!canStart || busy}
            className="flex items-center gap-[6px] px-[12px] py-[7px] rounded-[8px] text-[12.5px] font-medium bg-[color-mix(in_srgb,var(--ao-ok)_15%,transparent)] border border-[rgba(78,185,111,0.30)] text-[var(--ao-ok)] hover:bg-[color-mix(in_srgb,var(--ao-ok)_22%,transparent)] transition-[background] duration-[100ms] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed border-solid"
          >
            {busy && runState.phase === "starting" ? (
              <Icon name="refresh" size={12} className="[animation:spin_1s_linear_infinite]" />
            ) : (
              <Icon name="play" size={12} />
            )}
            {runState.phase === "starting" ? "Starting…" : "Run on device"}
          </button>
        )}
        {running && (
          <>
            <button
              type="button"
              onClick={() => { void sendStdin("r\n"); }}
              className="flex items-center gap-[6px] px-[12px] py-[7px] rounded-[8px] text-[12.5px] font-medium bg-[color-mix(in_srgb,#54C5F8_12%,transparent)] border border-[rgba(84,197,248,0.28)] text-[#54C5F8] hover:bg-[color-mix(in_srgb,#54C5F8_20%,transparent)] transition-[background] duration-[100ms] cursor-pointer border-solid"
            >
              <Icon name="refresh" size={12} />
              Hot Reload
            </button>
            <button
              type="button"
              onClick={() => { void sendStdin("R\n"); }}
              className="flex items-center gap-[6px] px-[12px] py-[7px] rounded-[8px] text-[12.5px] font-medium bg-ao-bg-3 border border-ao-line-2 text-ao-fg-1 hover:bg-ao-bg-4 transition-[background] duration-[100ms] cursor-pointer border-solid"
            >
              <Icon name="refresh" size={12} />
              Hot Restart
            </button>
            <button
              type="button"
              onClick={() => { void stopRun(); }}
              disabled={busy}
              className="flex items-center gap-[6px] px-[12px] py-[7px] rounded-[8px] text-[12.5px] font-medium bg-ao-bg-3 border border-ao-line-2 text-ao-fg-1 hover:bg-ao-bg-4 transition-[background] duration-[100ms] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed border-solid"
            >
              {busy ? (
                <Icon name="refresh" size={12} className="[animation:spin_1s_linear_infinite]" />
              ) : (
                <Icon name="stop" size={12} />
              )}
              {busy ? "Stopping…" : "Stop"}
            </button>
          </>
        )}
        {!effectivePath && !projectId && !running && (
          <span className="text-[11.5px] text-ao-fg-3">Enter a path above or select a project in the office</span>
        )}
        {!deviceId && (
          <span className="text-[11.5px] text-ao-fg-3">No device connected</span>
        )}
      </div>

      {runState.phase === "error" && (
        <div className="flex items-start gap-2 px-3 py-[8px] bg-[var(--ao-bad-soft)] border border-[rgba(217,83,79,0.25)] rounded-[8px] text-[11.5px] text-[var(--ao-bad)]">
          <Icon name="x" size={12} className="shrink-0 mt-[1px]" />
          {runState.message}
        </div>
      )}

      <LogView pid={pid} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Modal                                                                */
/* ------------------------------------------------------------------ */

export function FlutterModal() {
  const open = useFlutterStore((s) => s.open);
  const setOpen = useFlutterStore((s) => s.setOpen);
  const activeDeviceId = useFlutterStore((s) => s.activeDeviceId);
  const setActiveDeviceId = useFlutterStore((s) => s.setActiveDeviceId);
  const activeProjectId = useActiveProjectStore((s) => s.id);
  const queryClient = useQueryClient();

  const devicesQ = useFlutterDevices(open);
  const devices = useMemo(() => devicesQ.data?.devices ?? [], [devicesQ.data]);
  const adbAvailable = devicesQ.data?.available ?? true;

  // Auto-select first connected device
  useEffect(() => {
    if (!open) return;
    const connected = devices.filter((d) => d.status === "device");
    if (connected.length === 0) return;
    if (!activeDeviceId || !connected.find((d) => d.id === activeDeviceId)) {
      setActiveDeviceId(connected[0]!.id);
    }
  }, [open, devices, activeDeviceId, setActiveDeviceId]);

  const activeDevice = devices.find((d) => d.id === activeDeviceId) ?? null;

  return (
    <ModalShell
      open={open}
      onClose={() => setOpen(false)}
      bareContent
      maxWidth={720}
      className="ao-modal"
      closeLabel="Close Flutter device manager"
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-[var(--ao-line-0)] shrink-0">
        <div className="w-8 h-8 bg-[color-mix(in_srgb,#54C5F8_15%,transparent)] border border-[rgba(84,197,248,0.25)] rounded-[8px] flex items-center justify-center text-[#54C5F8]">
          <Icon name="smartphone" size={16} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[14px] font-semibold text-ao-fg-0">Flutter Device Manager</div>
          <div className="text-[11px] text-ao-fg-3 font-mono mt-[1px]">
            {adbAvailable ? "ADB connected · refreshes every 5s" : "ADB not found — install android-tools-adb"}
          </div>
        </div>
        <button
          className="w-7 h-7 rounded-[6px] flex items-center justify-center text-ao-fg-3 transition-[background,color] duration-[120ms] hover:bg-ao-bg-3 hover:text-ao-fg-0 border-0 bg-transparent cursor-pointer p-0"
          title="Refresh now"
          onClick={() => { void queryClient.invalidateQueries({ queryKey: ["flutter-devices"] }); }}
        >
          <Icon name="refresh" size={15} />
        </button>
        <button
          className="w-7 h-7 rounded-[6px] flex items-center justify-center text-ao-fg-3 transition-[background,color] duration-[120ms] hover:bg-ao-bg-3 hover:text-ao-fg-0 border-0 bg-transparent cursor-pointer p-0"
          title="Close"
          onClick={() => setOpen(false)}
        >
          <Icon name="x" size={16} />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 flex flex-col gap-5 [scrollbar-width:thin] [scrollbar-color:var(--ao-bg-4)_transparent]">
        {/* No ADB */}
        {!adbAvailable && (
          <div className="flex flex-col items-center gap-3 py-8 text-ao-fg-3">
            <Icon name="wrench" size={28} />
            <div className="text-[13px]">ADB not found</div>
            <code className="text-[11px] bg-ao-bg-3 border border-ao-line-2 rounded-[6px] px-3 py-2 font-mono">
              sudo apt install android-tools-adb
            </code>
          </div>
        )}

        {/* No devices */}
        {adbAvailable && devices.length === 0 && !devicesQ.isLoading && (
          <div className="flex flex-col items-center gap-3 py-8 text-ao-fg-3">
            <Icon name="smartphone" size={28} />
            <div className="text-[13px]">No devices connected</div>
            <div className="text-[11.5px] text-center max-w-[260px]">
              Connect your phone via USB and enable USB debugging in Developer Options.
            </div>
            <code className="text-[11px] bg-ao-bg-3 border border-ao-line-2 rounded-[6px] px-3 py-2 font-mono">
              adb devices
            </code>
          </div>
        )}

        {/* Device list / selector */}
        {adbAvailable && devices.length > 0 && (
          <>
            {/* Device info */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold text-ao-fg-2 font-mono uppercase tracking-[0.05em]">Device</span>
                <span className="flex-1 h-px bg-[var(--ao-line-0)]" />
              </div>
              <div className="flex items-center gap-3">
                <DeviceSelector devices={devices} activeId={activeDeviceId} onChange={setActiveDeviceId} />
                {activeDevice && (
                  <div className="flex items-center gap-3 flex-1 bg-ao-bg-2 border border-ao-line-1 rounded-[8px] px-3 py-[8px]">
                    <StatusDot status={activeDevice.status} />
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-semibold text-ao-fg-0 truncate">{activeDevice.model}</div>
                      <div className="text-[10.5px] text-ao-fg-3 font-mono truncate">{activeDevice.id}</div>
                    </div>
                    <span className={`text-[10px] font-mono px-[7px] py-[2px] rounded-full border ${
                      activeDevice.status === "device"
                        ? "text-[var(--ao-ok)] bg-[var(--ao-ok-soft)] border-[rgba(78,185,111,0.25)]"
                        : "text-yellow-400 bg-yellow-400/10 border-yellow-400/25"
                    }`}>
                      {activeDevice.status === "device" ? "ready" : activeDevice.status}
                    </span>
                    <span className="text-[10.5px] text-ao-fg-3 font-mono shrink-0">
                      {activeDevice.transportType === "usb" ? "USB" : "TCP/IP"}
                    </span>
                  </div>
                )}
              </div>
              {activeDevice?.status === "unauthorized" && (
                <div className="text-[11.5px] text-yellow-400 bg-yellow-400/10 border border-yellow-400/25 rounded-[7px] px-3 py-2">
                  Device unauthorized — check your phone and tap &quot;Allow USB debugging&quot;.
                </div>
              )}
            </div>

            {/* Flutter run controls */}
            <RunPanel
              projectId={activeProjectId}
              deviceId={activeDevice?.status === "device" ? activeDeviceId : null}
            />

            {/* Screen mirroring */}
            <ScreenPanel deviceId={activeDevice?.status === "device" ? activeDeviceId : null} />
          </>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center gap-3 px-5 py-3 border-t border-[var(--ao-line-0)] shrink-0">
        <div className="flex-1 flex items-center gap-[6px] text-[11px] text-ao-fg-3 font-mono">
          <Icon name="wrench" size={11} />
          <span>
            {devices.filter((d) => d.status === "device").length} device{devices.filter((d) => d.status === "device").length !== 1 ? "s" : ""} ready
          </span>
          {devicesQ.dataUpdatedAt ? (
            <span className="ml-auto text-[10.5px]">
              updated {Math.round((Date.now() - devicesQ.dataUpdatedAt) / 1000)}s ago
            </span>
          ) : null}
        </div>
        <button
          className="flex items-center gap-[5px] px-[14px] py-[7px] rounded-[8px] text-[12.5px] font-semibold cursor-pointer transition-[background] duration-[120ms] bg-ao-accent border-0 text-white hover:bg-[var(--ao-accent-hover,var(--ao-accent))]"
          onClick={() => setOpen(false)}
        >
          <Icon name="check" size={12} /> Done
        </button>
      </div>
    </ModalShell>
  );
}
