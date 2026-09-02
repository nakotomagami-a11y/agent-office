"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@agent-office/domain/hooks/api";
import { ModalShell } from "@/components/ui/modal-shell";
import { Icon } from "@/components/ui/icon";
import { useActiveProjectStore } from "@/lib/active-project-store";
import { useProcessesStore } from "@/lib/processes-store";
import { useMemHistory } from "../hooks/use-mem-history";
import { useProcesses, type ProcessInfo } from "../hooks/use-processes";
import {
  fmtMem,
  fmtMemParts,
  fmtUptime,
  fmtAgo,
  detectFramework,
  detectProto,
  accentForProto,
  sparkPath,
  groupByProject,
  type ProcessGroup,
} from "../format/process-format";

type Scope = "project" | "all";

/* ------------------------------------------------------------------ */
/* Server card                                                         */
/* ------------------------------------------------------------------ */

function ServerCard({
  process: p,
  history,
  onKill,
  killing,
}: {
  process: ProcessInfo;
  history: number[];
  onKill: () => void;
  killing: boolean;
}) {
  const t = useTranslations("processes_modal");
  const [open, setOpen] = useState(false);
  const framework = detectFramework(p.name, p.cmd);
  const proto = detectProto(p.name, p.cmd);
  const accent = accentForProto(proto);
  const isLocal = p.address === "127.0.0.1" || p.address === "::1" || p.address === "0.0.0.0" || p.address === "::";
  const spark = sparkPath(history);

  return (
    <div
      className="relative flex flex-col rounded-[16px] bg-card-2 shadow-[inset_0_0_0_1px_var(--line),var(--inset-hi)] overflow-hidden transition-[transform,box-shadow] duration-150 hover:-translate-y-px"
      style={{ boxShadow: open ? `inset 0 0 0 1px ${accent.fg}` : undefined }}
    >
      <span
        className="absolute inset-x-0 top-0 h-px"
        style={{ background: `linear-gradient(90deg, transparent, ${accent.soft}, transparent)` }}
        aria-hidden
      />
      <div className="flex items-stretch">
        {/* Port panel */}
        <div
          className="relative w-[92px] shrink-0 flex flex-col items-center justify-center gap-[4px] py-[13px] border-r border-line"
          style={{ background: accent.pad }}
        >
          <span
            className="absolute inset-0 pointer-events-none"
            style={{ background: `radial-gradient(circle at 50% 40%, ${accent.soft}, transparent 70%)` }}
          />
          <span className="relative font-[var(--font-mono)] text-[8px] font-bold uppercase tracking-[0.1em] opacity-75" style={{ color: accent.fg }}>
            {proto}
          </span>
          <span className="relative font-[var(--font-mono)] text-[18px] font-extrabold tracking-[-0.02em]" style={{ color: accent.fg }}>
            {p.port}
          </span>
          <span className="relative flex items-center gap-[5px] font-[var(--font-mono)] text-[9px] text-txt-4">
            <span className="w-[5px] h-[5px] rounded-full bg-green shadow-[0_0_5px_1px_rgba(52,211,153,0.6)] animate-[ao-pulse_2s_ease-in-out_infinite]" />
            {fmtUptime(p.startedAt)}
          </span>
        </div>

        {/* Body */}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex-1 min-w-0 flex items-center gap-[12px] px-[14px] py-[12px] text-left cursor-pointer bg-transparent border-0"
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-[7px]">
              <span className="text-[13px] font-bold truncate">{p.name}</span>
              {framework !== p.name && (
                <span
                  className="font-[var(--font-mono)] text-[9px] font-bold px-[6px] py-[1.5px] rounded-[6px] whitespace-nowrap shrink-0"
                  style={{ background: accent.soft, color: accent.fg }}
                >
                  {framework}
                </span>
              )}
              <span className="font-[var(--font-mono)] text-[9px] px-[6px] py-[1.5px] rounded-[6px] bg-card-3 text-txt-4 whitespace-nowrap shrink-0">
                PID {p.pid}
              </span>
            </div>
            <div className="flex items-center gap-[6px] mt-[6px] px-[8px] py-[5px] rounded-[8px] bg-card shadow-[inset_0_0_0_1px_var(--line)]">
              <span className="font-[var(--font-mono)] text-[9.5px] text-txt-4 shrink-0 opacity-70">$</span>
              <span className="flex-1 min-w-0 font-[var(--font-mono)] text-[10px] text-txt-3 whitespace-nowrap overflow-hidden text-ellipsis" title={p.cmd}>
                {p.cmd || "-"}
              </span>
            </div>
          </div>

          <div className="flex flex-col items-end gap-[4px] shrink-0">
            <div className="flex items-baseline gap-[4px]">
              <span className="font-[var(--font-mono)] text-[12px] font-bold whitespace-nowrap">{fmtMem(p.memMb)}</span>
              <span className="font-[var(--font-mono)] text-[8.5px] text-txt-4">mem</span>
            </div>
            <svg viewBox="0 0 60 20" className="w-[58px] h-[20px] overflow-visible">
              <path d={spark.area} fill={accent.soft} />
              <path d={spark.line} fill="none" stroke={accent.fg} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" />
            </svg>
          </div>
        </button>

        {/* Actions */}
        <div className="flex items-center gap-[2px] px-[8px] shrink-0" onClick={(e) => e.stopPropagation()}>
          {isLocal && (
            <a
              href={`http://localhost:${p.port}`}
              target="_blank"
              rel="noopener noreferrer"
              title={t("open_in_browser")}
              className="w-[29px] h-[29px] rounded-[9px] flex items-center justify-center text-txt-3 transition-colors duration-150 hover:bg-[color-mix(in_srgb,var(--cyan)_14%,transparent)] hover:text-cyan"
            >
              <Icon name="globe" size={13} />
            </a>
          )}
          <button
            type="button"
            title={t("details")}
            onClick={() => setOpen((v) => !v)}
            className="w-[29px] h-[29px] rounded-[9px] flex items-center justify-center text-txt-3 transition-colors duration-150 hover:bg-card-3 hover:text-txt cursor-pointer border-0 bg-transparent"
          >
            <Icon name="list" size={13} />
          </button>
          <button
            type="button"
            title={t("restart_not_supported")}
            disabled
            className="w-[29px] h-[29px] rounded-[9px] flex items-center justify-center text-txt-4 opacity-40 cursor-not-allowed border-0 bg-transparent"
          >
            <Icon name="refresh" size={13} />
          </button>
          <button
            type="button"
            title={t("kill_process")}
            onClick={onKill}
            disabled={killing}
            className="w-[29px] h-[29px] rounded-[9px] flex items-center justify-center text-txt-4 transition-colors duration-150 hover:bg-red-soft hover:text-red cursor-pointer border-0 bg-transparent disabled:opacity-40"
          >
            <Icon name={killing ? "refresh" : "x"} size={14} />
          </button>
        </div>
      </div>

      {open && (
        <div className="px-[14px] py-[12px] border-t border-line flex flex-col gap-[5px]">
          {[
            [t("working_dir"), p.cwd || "-"],
            [t("command"), p.cmd || "-"],
            [t("started"), `${fmtAgo(p.startedAt)} · up ${fmtUptime(p.startedAt)}`],
            [t("address"), `${p.address}:${p.port}`],
          ].map(([k, v]) => (
            <div key={k} className="flex gap-[8px] text-[11px]">
              <span className="min-w-[86px] text-txt-4 font-[var(--font-mono)] shrink-0">{k}</span>
              <span className="text-txt-2 font-[var(--font-mono)] break-all">{v}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Stat tile                                                           */
/* ------------------------------------------------------------------ */

function StatTile({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="flex-1 basis-[calc(25%-8px)] min-w-[100px] px-[13px] py-[11px] rounded-[14px] bg-card-2 shadow-[inset_0_0_0_1px_var(--line)]">
      <div className="text-[8.5px] font-bold uppercase tracking-[0.08em] text-txt-4 whitespace-nowrap">{label}</div>
      <div className="flex items-baseline gap-[5px] mt-[5px]">
        <span className="text-[19px] font-extrabold tracking-[-0.02em]">{value}</span>
        <span className="text-[10px] font-semibold text-txt-4 whitespace-nowrap">{unit}</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Modal                                                               */
/* ------------------------------------------------------------------ */

export function ProcessesModal() {
  const t = useTranslations("processes_modal");
  const open = useProcessesStore((s) => s.open);
  const setOpen = useProcessesStore((s) => s.setOpen);
  const activeProjectId = useActiveProjectStore((s) => s.id);
  const processesQ = useProcesses(open);
  const queryClient = useQueryClient();

  const processes = useMemo(() => processesQ.data ?? [], [processesQ.data]);
  const getHistory = useMemHistory(processes);
  const [q, setQ] = useState("");
  const [scope, setScope] = useState<Scope>("project");

  const scoped = useMemo(
    () => (scope === "project" && activeProjectId ? processes.filter((p) => p.projectId === activeProjectId) : processes),
    [processes, scope, activeProjectId],
  );

  const filtered = useMemo(() => {
    if (!q) return scoped;
    const low = q.toLowerCase();
    return scoped.filter((p) => {
      const blob = `${p.name} ${p.cmd} ${p.port} ${p.projectName ?? ""}`.toLowerCase();
      return blob.includes(low);
    });
  }, [scoped, q]);

  const groups: ProcessGroup[] = useMemo(() => groupByProject(filtered), [filtered]);

  const totalMem = processes.reduce((s, p) => s + p.memMb, 0);
  const projectCount = processes.filter((p) => p.projectId === activeProjectId).length;
  const portsInUse = new Set(processes.map((p) => p.port)).size;
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
      maxWidth={860}
      closeLabel={t("close_running_servers")}
    >
      {/* Header */}
      <div className="relative flex items-center gap-[14px] px-6 py-5 border-b border-line shrink-0 overflow-hidden">
        <span
          className="absolute left-[60px] -top-[80px] w-[260px] h-[200px] pointer-events-none"
          style={{ background: "radial-gradient(circle at 50% 50%, color-mix(in srgb, var(--green) 16%, transparent), transparent 66%)" }}
          aria-hidden
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/claude-rune.png" alt="" width={60} height={60} className="relative shrink-0 object-contain" />
        <div className="relative flex-1 min-w-0">
          <div className="text-[17px] font-extrabold tracking-[-0.02em]">{t("title")}</div>
          <div className="font-[var(--font-mono)] text-[10.5px] text-txt-4">
            {t("subtitle")}
          </div>
        </div>
        <span className="relative inline-flex items-center gap-[6px] px-[11px] py-[5px] rounded-full bg-green-soft text-green text-[11px] font-bold whitespace-nowrap shrink-0">
          <span className="w-[5px] h-[5px] rounded-full bg-green animate-[ao-pulse_1.6s_ease-in-out_infinite]" />
          {t("healthy_count", { count: processes.length })}
        </span>
        <button
          type="button"
          title={t("refresh_now")}
          onClick={() => processesQ.refetch()}
          className="relative w-8 h-8 rounded-[11px] flex items-center justify-center text-txt-3 transition-colors duration-150 hover:bg-card-2 hover:text-txt cursor-pointer border-0 bg-transparent shrink-0"
        >
          <Icon name="refresh" size={15} />
        </button>
        <button
          type="button"
          title={t("close")}
          aria-label={t("close")}
          onClick={() => setOpen(false)}
          className="relative w-8 h-8 rounded-[11px] flex items-center justify-center text-txt-3 transition-colors duration-150 hover:bg-card-2 hover:text-txt cursor-pointer border-0 bg-transparent shrink-0"
        >
          <Icon name="x" size={16} />
        </button>
      </div>

      {/* Stats */}
      <div className="flex flex-wrap gap-[10px] px-6 py-4 border-b border-line shrink-0">
        <StatTile label={t("stat_processes")} value={String(processes.length)} unit={t("unit_listening")} />
        <StatTile label={t("stat_from_project")} value={String(projectCount)} unit={t("unit_servers")} />
        <StatTile label={t("stat_memory")} {...fmtMemParts(totalMem)} />
        <StatTile label={t("stat_ports_in_use")} value={String(portsInUse)} unit={t("unit_ports_scanned")} />
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-[10px] px-6 py-[13px] shrink-0">
        <div className="flex-1 min-w-0 flex items-center gap-[9px] px-[13px] py-[10px] rounded-[13px] bg-card-2 shadow-[inset_0_0_0_1px_var(--line)] text-txt-4 focus-within:text-txt-2">
          <Icon name="search" size={13} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("search_placeholder")}
            className="flex-1 bg-transparent border-0 outline-none text-[12.5px] text-txt placeholder:text-txt-4"
          />
        </div>
        <div className="flex items-center gap-[2px] p-[4px] rounded-[14px] bg-card-2 shadow-[inset_0_0_0_1px_var(--line)] shrink-0">
          {([
            ["project", t("scope_this_project"), processes.filter((p) => p.projectId === activeProjectId).length],
            ["all", t("scope_all"), processes.length],
          ] as const).map(([id, label, count]) => (
            <button
              key={id}
              type="button"
              onClick={() => setScope(id)}
              className={`flex items-center gap-[6px] px-[12px] py-[6px] rounded-[10px] text-[11.5px] font-semibold whitespace-nowrap transition-colors duration-150 cursor-pointer border-0 ${scope === id ? "bg-card text-txt" : "bg-transparent text-txt-4 hover:text-txt-2"}`}
            >
              {label}
              <span className="font-[var(--font-mono)] text-[9.5px] opacity-70">{count}</span>
            </button>
          ))}
        </div>
      </div>

      {killError && (
        <div className="mx-6 mb-3 px-[14px] py-[9px] rounded-[10px] bg-red-soft text-red text-[12px] font-[var(--font-mono)] flex items-center justify-between gap-2 shrink-0">
          <span>{killError}</span>
          <button onClick={() => setKillError(null)} className="bg-transparent border-0 cursor-pointer text-inherit p-0 leading-none">✕</button>
        </div>
      )}

      {/* Body */}
      <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-5 flex flex-col gap-[14px] [scrollbar-width:thin] [scrollbar-color:var(--line-2)_transparent]">
        {processesQ.isLoading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-[13px] text-txt-4">
            <Icon name="refresh" size={18} />
            <span>{t("scanning_ports")}</span>
          </div>
        ) : groups.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-txt-4">
            <Icon name="server" size={26} />
            <div>{q ? t("no_matching_servers") : t("no_listening_processes")}</div>
          </div>
        ) : (
          groups.map((g) => {
            const groupMem = g.processes.reduce((s, p) => s + p.memMb, 0);
            const isOther = g.label === "Other";
            return (
              <div key={g.id}>
                <div className="flex items-center gap-[9px] pb-[9px]">
                  <span className={`text-[9.5px] font-bold tracking-[0.09em] uppercase whitespace-nowrap ${isOther ? "text-txt-4" : "text-acc"}`}>
                    {isOther ? t("other_system_processes") : g.label}
                  </span>
                  <span className="font-[var(--font-mono)] text-[10px] px-[7px] py-[1px] rounded-full bg-card-2 shadow-[inset_0_0_0_1px_var(--line)] text-txt-4">
                    {g.processes.length}
                  </span>
                  <span className="flex-1 h-px bg-line" />
                  <span className="font-[var(--font-mono)] text-[10px] text-txt-4 whitespace-nowrap">{fmtMem(groupMem)}</span>
                </div>
                <div className="flex flex-col gap-[8px]">
                  {g.processes.map((p) => (
                    <ServerCard
                      key={p.pid}
                      process={p}
                      history={getHistory(p.pid)}
                      onKill={() => handleKill(p.pid)}
                      killing={killing.has(p.pid)}
                    />
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center gap-[10px] px-6 py-4 border-t border-line shrink-0">
        <span className="flex items-center gap-[7px] font-[var(--font-mono)] text-[10.5px] text-txt-4 whitespace-nowrap">
          <span className="w-[5px] h-[5px] rounded-full bg-green animate-[ao-pulse_1.6s_ease-in-out_infinite]" />
          {t("last_scan", { time: processesQ.dataUpdatedAt ? fmtAgo(processesQ.dataUpdatedAt) : "-" })}
        </span>
        <span className="flex-1" />
        <button
          type="button"
          title={t("scan_settings_soon")}
          disabled
          className="px-[16px] py-[10px] rounded-[12px] text-[12.5px] font-semibold bg-card-2 shadow-[inset_0_0_0_1px_var(--line)] text-txt-4 opacity-60 cursor-not-allowed"
        >
          {t("scan_settings")}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="flex items-center gap-[8px] px-[20px] py-[11px] rounded-[12px] text-[12.5px] font-bold text-white cursor-pointer border-0 bg-[linear-gradient(120deg,var(--acc),var(--acc-2))] shadow-[0_12px_26px_-14px_color-mix(in_srgb,var(--acc)_85%,transparent)] transition-transform duration-150 hover:-translate-y-px"
        >
          <Icon name="check" size={12} /> {t("done")}
        </button>
      </div>
    </ModalShell>
  );
}
