"use client";

import { useState, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@agent-office/domain/hooks/api";
import { ModalShell } from "@/components/ui/modal-shell";
import { Icon } from "@/components/ui/icon";
import { useProcessesStore } from "@/lib/processes-store";
import { useProcesses, type ProcessInfo } from "../hooks/use-processes";
import {
  fmtMem,
  fmtUptime,
  fmtAgo,
  detectFramework,
  detectProto,
  groupByProject,
} from "../format/process-format";

/* ------------------------------------------------------------------ */
/* Server card                                                          */
/* ------------------------------------------------------------------ */

function ServerCard({
  process: p,
  onKill,
  killing,
}: {
  process: ProcessInfo;
  onKill: () => void;
  killing: boolean;
}) {
  const [open, setOpen] = useState(false);
  const framework = detectFramework(p.name, p.cmd);
  const proto = detectProto(p.name, p.cmd);
  const isLocal = p.address === "127.0.0.1" || p.address === "::1" || p.address === "0.0.0.0" || p.address === "::";
  const memPct = Math.min(100, p.memMb / 10);

  return (
    <>
      <div
        className={`flex items-center gap-[10px] px-3 py-[10px] bg-ao-bg-2 border border-ao-line-1 rounded-ao-md cursor-pointer transition-[background,border-color] duration-[100ms] relative hover:bg-ao-bg-3 ${open ? "border-[var(--ao-accent-line)] rounded-b-none" : ""}`}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="w-[7px] h-[7px] rounded-full shrink-0 bg-ao-ok shadow-[0_0_5px_var(--ao-ok)]" />
        <span
          className="flex items-center gap-[3px] font-mono text-[13px] font-bold text-ao-accent bg-[var(--ao-accent-softer)] border border-ao-accent-line rounded-full px-2 py-[2px] whitespace-nowrap shrink-0 no-underline"
          onClick={(e) => e.stopPropagation()}
        >
          <span className="text-[10px] text-ao-fg-3 font-normal mr-[1px]">:{proto}</span>
          {p.port}
          {isLocal && (
            <a
              href={`http://localhost:${p.port}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center text-ao-fg-3 ml-1 hover:text-ao-accent"
              title="Open in browser"
            >
              <Icon name="globe" size={10} />
            </a>
          )}
        </span>
        <div className="flex-1 min-w-0 flex flex-col gap-[3px]">
          <div className="flex items-center gap-[6px] text-[13px] font-semibold text-ao-fg-0">
            <span>{p.name}</span>
            {framework !== p.name && (
              <span className="text-[10px] text-ao-fg-3 bg-ao-bg-3 border border-ao-line-2 rounded-[4px] px-[5px] py-[1px] font-mono font-normal">{framework}</span>
            )}
          </div>
          <div className="text-[11px] font-mono text-ao-fg-3 overflow-hidden text-ellipsis whitespace-nowrap">
            <span title={p.cmd}>{p.cmd || "-"}</span>
          </div>
          <div className="flex items-center gap-0">
            <span className="flex items-center gap-1 text-[11px]"><span className="text-ao-fg-3 font-mono">PID</span><span className="text-ao-fg-1 font-mono font-medium">{p.pid}</span></span>
            <span className="w-px h-[10px] bg-[var(--ao-line-0)] mx-2" />
            <span className="flex items-center gap-1 text-[11px]"><span className="text-ao-fg-3 font-mono">up</span><span className="text-ao-fg-1 font-mono font-medium">{fmtUptime(p.startedAt)}</span></span>
            <span className="w-px h-[10px] bg-[var(--ao-line-0)] mx-2" />
            <span className="flex items-center gap-1 text-[11px]"><span className="text-ao-fg-3 font-mono">mem</span><span className="text-ao-fg-1 font-mono font-medium">{fmtMem(p.memMb)}</span></span>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
          {isLocal && (
            <a
              href={`http://localhost:${p.port}`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-[26px] h-[26px] rounded-[6px] flex items-center justify-center text-ao-fg-3 transition-[background,color] duration-[100ms] hover:bg-ao-bg-4 hover:text-ao-accent no-underline"
              title="Open in browser"
            >
              <Icon name="globe" size={13} />
            </a>
          )}
          <button
            title="View logs"
            className="w-[26px] h-[26px] rounded-[6px] flex items-center justify-center text-ao-fg-3 transition-[background,color] duration-[100ms] hover:bg-ao-bg-4 hover:text-ao-fg-1 border-0 bg-transparent cursor-pointer p-0"
            onClick={() => setOpen(true)}
          >
            <Icon name="list" size={13} />
          </button>
          <button
            title="Restart process"
            className="w-[26px] h-[26px] rounded-[6px] flex items-center justify-center text-ao-fg-3 transition-[background,color] duration-[100ms] hover:bg-ao-bg-4 hover:text-ao-fg-1 border-0 bg-transparent cursor-pointer p-0"
            disabled
          >
            <Icon name="refresh" size={13} />
          </button>
          <button
            title="Stop process"
            className="w-[26px] h-[26px] rounded-[6px] flex items-center justify-center text-ao-fg-3 transition-[background,color] duration-[100ms] hover:bg-ao-bad-soft hover:text-ao-bad border-0 bg-transparent cursor-pointer p-0"
            onClick={onKill}
            disabled={killing}
          >
            <Icon name={killing ? "refresh" : "x"} size={14} />
          </button>
        </div>
        <span className={`text-ao-fg-3 shrink-0 flex items-center transition-transform duration-[150ms] ${open ? "rotate-180" : ""}`}>
          <Icon name="chevron-down" size={11} />
        </span>
      </div>

      {open && (
        <div className="bg-ao-bg-2 border border-ao-accent-line border-t-0 rounded-b-ao-md px-4 py-[14px] flex flex-col gap-3">
          <div className="flex flex-col gap-[5px]">
            {[
              ["PID", String(p.pid)],
              ["Working dir", p.cwd || "-"],
              ["Command", p.cmd || "-"],
              ["Started", `${fmtAgo(p.startedAt)} · up ${fmtUptime(p.startedAt)}`],
              ["Address", `${p.address}:${p.port}`],
            ].map(([k, v]) => (
              <div key={k} className="flex gap-2 text-[11.5px]">
                <span className="min-w-[90px] text-ao-fg-3 font-mono shrink-0">{k}</span>
                <span className="text-ao-fg-1 font-mono break-all">{v}</span>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-1 mt-4">
            <div className="flex items-center gap-[5px] text-[11px] text-ao-fg-3 font-mono">
              <Icon name="cpu" size={11} /> Memory
              <span className="ml-auto text-ao-fg-2">{fmtMem(p.memMb)}</span>
            </div>
            <div className="h-[5px] bg-ao-bg-4 rounded-full overflow-hidden">
              <div className="h-full bg-ao-accent rounded-full transition-[width] duration-300" style={{ width: `${memPct}%` }} />
            </div>
          </div>

          <div className="flex flex-wrap gap-[6px] mt-[2px]">
            {isLocal && (
              <a
                href={`http://localhost:${p.port}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-[5px] px-[10px] py-[5px] rounded-[6px] text-[11.5px] font-mono bg-ao-bg-3 border border-ao-line-2 text-ao-fg-1 no-underline transition-[background,border-color] duration-[100ms] hover:bg-ao-bg-4"
              >
                <Icon name="globe" size={12} /> Open localhost:{p.port}
              </a>
            )}
            <button
              className="flex items-center gap-[5px] px-[10px] py-[5px] rounded-[6px] text-[11.5px] font-mono bg-ao-bg-3 border border-ao-line-2 text-ao-fg-1 transition-[background,border-color] duration-[100ms] hover:bg-ao-bg-4 cursor-pointer border-solid"
            >
              <Icon name="list" size={12} /> Tail logs
            </button>
            <button
              className="flex items-center gap-[5px] px-[10px] py-[5px] rounded-[6px] text-[11.5px] font-mono bg-ao-bg-3 border border-ao-line-2 text-ao-fg-3 cursor-not-allowed opacity-50 border-solid"
              disabled
              title="Restart not yet supported"
            >
              <Icon name="refresh" size={12} /> Restart
            </button>
            <button
              className="flex items-center gap-[5px] px-[10px] py-[5px] rounded-[6px] text-[11.5px] font-mono bg-ao-bg-3 border border-[rgba(217,83,79,0.30)] text-ao-bad transition-[background,border-color] duration-[100ms] hover:bg-ao-bad-soft cursor-pointer border-solid"
              onClick={onKill}
              disabled={killing}
            >
              <Icon name={killing ? "refresh" : "x"} size={12} /> {killing ? "Killing…" : "Kill process"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Modal                                                                */
/* ------------------------------------------------------------------ */

export function ProcessesModal() {
  const open = useProcessesStore((s) => s.open);
  const setOpen = useProcessesStore((s) => s.setOpen);
  const processesQ = useProcesses(open);
  const queryClient = useQueryClient();

  const processes = useMemo(() => processesQ.data ?? [], [processesQ.data]);
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    if (!q) return processes;
    const low = q.toLowerCase();
    return processes.filter((p) => {
      const blob = `${p.name} ${p.cmd} ${p.port} ${p.projectName ?? ""}`.toLowerCase();
      return blob.includes(low);
    });
  }, [processes, q]);

  const groups = useMemo(() => groupByProject(filtered), [filtered]);

  const totalMem = processes.reduce((s, p) => s + p.memMb, 0);
  const projectCount = processes.filter((p) => !!p.projectId).length;
  const [killing, setKilling] = useState<Set<number>>(new Set());
  const [killError, setKillError] = useState<string | null>(null);

  async function handleKill(pid: number) {
    setKilling((prev) => new Set(prev).add(pid));
    setKillError(null);
    try {
      await apiFetch(`/api/processes/${pid}`, { method: "DELETE" });
      queryClient.setQueryData<ProcessInfo[]>(["processes"], (old) =>
        old ? old.filter((p) => p.pid !== pid) : old
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Kill failed";
      setKillError(`PID ${pid}: ${msg}`);
    } finally {
      setKilling((prev) => { const s = new Set(prev); s.delete(pid); return s; });
      void queryClient.invalidateQueries({ queryKey: ["processes"] });
    }
  }

  return (
    <ModalShell
      open={open}
      onClose={() => setOpen(false)}
      bareContent
      maxWidth={680}
      className="ao-modal"
      closeLabel="Close running servers"
    >
          {/* Header */}
          <div className="flex items-center gap-3 px-5 py-4 border-b border-[var(--ao-line-0)] shrink-0">
            <div className="w-8 h-8 bg-ao-accent-soft border border-ao-accent-line rounded-[8px] flex items-center justify-center text-ao-accent" aria-hidden="true">
              <Icon name="terminal" size={16} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[14px] font-semibold text-ao-fg-0">Running servers</div>
              <div className="text-[11px] text-ao-fg-3 font-mono mt-[1px]">processes listening on a port · refreshes every 5s</div>
            </div>
            <button
              className="w-7 h-7 rounded-[6px] flex items-center justify-center text-ao-fg-3 text-[16px] leading-none transition-[background,color] duration-[120ms] hover:bg-ao-bg-3 hover:text-ao-fg-0 border-0 bg-transparent cursor-pointer p-0"
              title="Refresh now"
              onClick={() => processesQ.refetch()}
            >
              <Icon name="refresh" size={15} />
            </button>
            <button
              className="w-7 h-7 rounded-[6px] flex items-center justify-center text-ao-fg-3 text-[16px] leading-none transition-[background,color] duration-[120ms] hover:bg-ao-bg-3 hover:text-ao-fg-0 border-0 bg-transparent cursor-pointer p-0"
              title="Close"
              aria-label="Close"
              onClick={() => setOpen(false)}
            >
              <Icon name="x" size={16} />
            </button>
          </div>

          {/* Stats bar */}
          <div className="flex items-stretch flex-wrap gap-4 px-[22px] py-3 bg-ao-bg-2 border-b border-[var(--ao-line-1)] shrink-0">
            <div className="flex flex-col gap-0.5">
              <span className="text-[9.5px] text-ao-fg-3 uppercase tracking-[0.08em] font-mono">Total</span>
              <span className="text-[14px] font-semibold text-ao-fg-0 font-mono">{processes.length}<span className="text-[11px] text-ao-fg-2 font-normal ml-[3px]">processes</span></span>
            </div>
            <span className="w-px self-stretch bg-[var(--ao-line-1)] shrink-0" />
            <div className="flex flex-col gap-0.5">
              <span className="text-[9.5px] text-ao-fg-3 uppercase tracking-[0.08em] font-mono">From this project</span>
              <span className="text-[14px] font-semibold text-ao-fg-0 font-mono">{projectCount}<span className="text-[11px] text-ao-fg-2 font-normal ml-[3px]">servers</span></span>
            </div>
            <span className="w-px self-stretch bg-[var(--ao-line-1)] shrink-0" />
            <div className="flex flex-col gap-0.5">
              <span className="text-[9.5px] text-ao-fg-3 uppercase tracking-[0.08em] font-mono">Memory</span>
              <span className="text-[14px] font-semibold text-ao-fg-0 font-mono">{fmtMem(totalMem)}</span>
            </div>
            <span className="w-px self-stretch bg-[var(--ao-line-1)] shrink-0" />
            <div className="flex flex-col gap-0.5">
              <span className="text-[9.5px] text-ao-fg-3 uppercase tracking-[0.08em] font-mono">Health</span>
              <span className="text-[14px] font-semibold text-ao-fg-0 font-mono flex items-center gap-1">
                <span className="inline-flex items-center gap-[5px] py-[2px] px-[6px] rounded-full text-[10px] font-mono normal-case tracking-normal border bg-[var(--ao-ok-soft)] text-[var(--ao-ok)] border-[rgba(78,185,111,0.25)]">
                  <span className="text-[7px]">●</span>{processes.length} healthy
                </span>
              </span>
            </div>
          </div>

          {/* Toolbar */}
          <div className="flex items-center gap-2 px-5 py-[10px] border-b border-[var(--ao-line-0)] shrink-0">
            <div className="flex-1 flex items-center gap-2 bg-ao-bg-2 border border-ao-line-1 rounded-[8px] px-3 py-[7px] text-ao-fg-3 focus-within:border-[var(--ao-accent-line)] focus-within:text-ao-fg-1">
              <Icon name="search" size={13} />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search by name, command, port…"
                className="flex-1 bg-transparent border-none outline-none text-[12.5px] text-ao-fg-0 font-[var(--ao-font-sans)] placeholder:text-ao-fg-3"
                autoFocus
              />
            </div>
          </div>

          {killError && (
            <div className="px-4 py-1.5 bg-[var(--ao-danger-bg,#3a1a1a)] text-[var(--ao-danger,#f87171)] text-[12px] font-[var(--ao-font-mono)] flex items-center justify-between gap-2">
              <span>{killError}</span>
              <button onClick={() => setKillError(null)} className="bg-transparent border-none cursor-pointer text-inherit p-0 leading-none">✕</button>
            </div>
          )}

          {/* Body */}
          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-5 py-3 flex flex-col gap-4 [scrollbar-width:thin] [scrollbar-color:var(--ao-bg-4)_transparent]">
            {processesQ.isLoading ? (
              <div className="flex items-center justify-center gap-2 py-10 text-[13px] text-ao-fg-3">
                <Icon name="refresh" size={18} />
                <span>Scanning ports…</span>
              </div>
            ) : groups.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-ao-fg-3">
                <div className="text-[28px]">🛰</div>
                <div>{q ? "No matching servers." : "No listening processes found."}</div>
              </div>
            ) : (
              groups.map((g) => (
                <div key={g.id} className="flex flex-col gap-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[11px] font-semibold text-ao-fg-2 font-mono uppercase tracking-[0.05em] whitespace-nowrap">
                      {g.label === "Other" ? "Other system processes" : g.label}
                    </span>
                    <span className="text-[10px] text-ao-fg-3 bg-ao-bg-3 border border-ao-line-1 rounded-full px-[6px] font-mono shrink-0">{g.processes.length}</span>
                    <span className="flex-1 h-px bg-[var(--ao-line-0)]" />
                    {g.label !== "Other" && (
                      <span className="text-[10px] text-ao-fg-3 font-mono whitespace-nowrap">
                        {fmtMem(g.processes.reduce((s, p) => s + p.memMb, 0))}
                      </span>
                    )}
                  </div>
                  {g.processes.map((p) => (
                    <ServerCard
                      key={p.pid}
                      process={p}
                      onKill={() => handleKill(p.pid)}
                      killing={killing.has(p.pid)}
                    />
                  ))}
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center gap-3 px-5 py-3 border-t border-[var(--ao-line-0)] shrink-0">
            <div className="flex-1 flex items-center gap-[6px] text-[11px] text-ao-fg-3 font-mono">
              <Icon name="wrench" size={11} />
              <span>scanning <kbd className="bg-ao-bg-3 border border-ao-line-2 rounded-[4px] px-[5px] py-px font-mono text-[10.5px]">localhost</kbd> ports <kbd className="bg-ao-bg-3 border border-ao-line-2 rounded-[4px] px-[5px] py-px font-mono text-[10.5px]">1024–65535</kbd></span>
              <span className="ml-auto text-[10.5px] text-ao-fg-3">last scan {processesQ.dataUpdatedAt ? fmtAgo(processesQ.dataUpdatedAt) : "-"}</span>
            </div>
            <div className="flex gap-2 shrink-0">
              <button
                className="px-[14px] py-[7px] rounded-[8px] text-[12.5px] font-medium cursor-pointer transition-[background,border-color] duration-[120ms] bg-transparent border border-ao-line-2 text-ao-fg-3 hover:bg-ao-bg-3 hover:text-ao-fg-1"
                title="Settings (coming soon)"
                disabled
              >
                Settings
              </button>
              <button
                className="flex items-center gap-[5px] px-[14px] py-[7px] rounded-[8px] text-[12.5px] font-semibold cursor-pointer transition-[background] duration-[120ms] bg-ao-accent border-0 text-white hover:bg-[var(--ao-accent-hover,var(--ao-accent))]"
                onClick={() => setOpen(false)}
              >
                <Icon name="check" size={12} /> Done
              </button>
            </div>
          </div>
    </ModalShell>
  );
}
