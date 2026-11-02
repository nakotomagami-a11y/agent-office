"use client";

import { useId, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api/fetch";
import { cn } from "@/lib/cn";
import { ModalShell } from "@/components/ui/modal-shell";
import { Icon } from "@/components/ui/icon";
import { useActiveProjectStore } from "@/lib/active-project-store";
import { useProcessesStore } from "@/lib/processes-store";
import { useProcesses, type ProcessInfo } from "../hooks/use-processes";
import {
  fmtMem,
  fmtMemTotal,
  fmtUptime,
  fmtAgo,
  detectFramework,
  detectProto,
  groupByProject,
  killErrorKey,
  type ProcessGroup,
} from "../format/process-format";
import { API_ROUTES } from "@agent-office/api-contract";

type Scope = "project" | "all";

const ICON_BTN =
  "relative w-8 h-8 rounded-[10px] flex items-center justify-center text-txt-3 transition-colors duration-150 hover:bg-card-3 hover:text-txt cursor-pointer border-0 bg-transparent shrink-0";

/* ------------------------------------------------------------------ */
/* Server row                                                          */
/* ------------------------------------------------------------------ */

function ServerRow({
  process: p,
  striped,
  onKill,
  killing,
}: {
  process: ProcessInfo;
  striped: boolean;
  onKill: () => void;
  killing: boolean;
}) {
  const t = useTranslations("processes_modal");
  const [open, setOpen] = useState(false);
  const detailsId = useId();
  const isBackgroundTask = p.source === "background-task";
  const isLocal = !isBackgroundTask && (p.address === "127.0.0.1" || p.address === "::1" || p.address === "0.0.0.0" || p.address === "::");
  const isHttp = isLocal && detectProto(p.name, p.cmd) === "http";
  const framework = detectFramework(p.name, p.cmd);
  const subtitle = isBackgroundTask
    ? p.instanceLabel ? t("started_by", { name: p.instanceLabel }) : p.agentName ?? ""
    : framework !== p.name ? framework : "";

  const details: Array<[string, string, string]> = [
    [t("command"), p.cmd || "-", "text-acc"],
    [t("folder"), p.cwd || "-", "text-cyan"],
    [t("uptime"), fmtUptime(p.startedAt), "text-green"],
    [t("pid"), String(p.pid), "text-amber"],
    ...(isBackgroundTask ? [] : [[t("address"), `${p.address}:${p.port}`, "text-txt-2"] as [string, string, string]]),
  ];

  return (
    <div
      className={cn(
        "flex flex-col rounded-[12px] transition-[background] duration-[160ms] hover:bg-[color-mix(in_srgb,var(--txt)_4.5%,transparent)]",
        striped && "bg-[color-mix(in_srgb,var(--txt)_2.5%,transparent)]",
      )}
    >
      {/* The whole row toggles details; the name button is its keyboard handle (its click bubbles here). */}
      <div onClick={() => setOpen((v) => !v)} className="flex items-center gap-[14px] h-[52px] px-[12px] cursor-pointer">
        <span className="w-2 h-2 rounded-full shrink-0 bg-green shadow-[0_0_6px_var(--green)]" />
        <button
          type="button"
          aria-expanded={open}
          aria-controls={detailsId}
          className="flex-1 min-w-0 flex items-baseline gap-[8px] p-0 bg-transparent border-0 text-left text-txt cursor-pointer"
        >
          <span className="text-[14px] font-bold whitespace-nowrap truncate max-w-full">{p.name}</span>
          {subtitle && <span className="text-[12px] text-txt-4 whitespace-nowrap overflow-hidden text-ellipsis">{subtitle}</span>}
        </button>
        {isBackgroundTask ? (
          <span className="shrink-0 inline-flex items-center gap-[6px] h-7 px-[10px] rounded-[8px] bg-amber-soft text-amber text-[12px] font-semibold">
            <Icon name="terminal" size={12} className="w-[12px] h-[12px] [flex:0_0_12px]" />
            {t("background")}
          </span>
        ) : isLocal ? (
          <a
            href={`http://localhost:${p.port}`}
            target="_blank"
            rel="noopener noreferrer"
            title={t("open_in_browser")}
            onClick={(e) => e.stopPropagation()}
            className={cn(
              "shrink-0 inline-flex items-center gap-[6px] h-7 px-[10px] rounded-[8px] font-[var(--font-mono)] text-[12px] font-semibold",
              isHttp ? "bg-acc-soft text-acc hover:text-acc hover:brightness-[1.2]" : "bg-card-3 text-txt-3 hover:text-txt",
            )}
          >
            {isHttp ? `localhost:${p.port}` : `:${p.port}`}
            {isHttp && <Icon name="external-link" size={11} className="w-[11px] h-[11px] [flex:0_0_11px]" />}
          </a>
        ) : (
          <span className="shrink-0 inline-flex items-center h-7 px-[10px] rounded-[8px] bg-card-3 text-txt-3 font-[var(--font-mono)] text-[12px] font-semibold">
            :{p.port}
          </span>
        )}
        <span className="w-16 shrink-0 text-right font-[var(--font-mono)] text-[12px] text-txt-3">{fmtMem(p.memMb)}</span>
        <button
          type="button"
          title={t("stop")}
          aria-label={t("stop_named", { name: p.name, pid: p.pid })}
          onClick={(e) => { e.stopPropagation(); onKill(); }}
          disabled={killing}
          className="w-[30px] h-[30px] shrink-0 rounded-[9px] flex items-center justify-center text-txt-4 transition-colors duration-150 hover:bg-red-soft hover:text-red cursor-pointer border-0 bg-transparent disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Icon name={killing ? "refresh" : "stop"} size={13} className="w-[13px] h-[13px] [flex:0_0_13px]" />
        </button>
      </div>

      {open && (
        <div id={detailsId} className="flex flex-col gap-[6px] pt-0 pr-[14px] pb-[14px] pl-[34px] animate-[lrIn_240ms_cubic-bezier(.2,.8,.2,1)_both]">
          {details.map(([k, v, c]) => (
            <div key={k} className="flex gap-[12px]">
              <span className="w-[90px] shrink-0 text-[11.5px] text-txt-4">{k}</span>
              <span className={cn("flex-1 min-w-0 font-[var(--font-mono)] text-[11px] break-all", c)}>{v}</span>
            </div>
          ))}
        </div>
      )}
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

  const [killing, setKilling] = useState<Set<number>>(new Set());
  const [killError, setKillError] = useState<string | null>(null);

  async function handleKill(pid: number) {
    setKilling((prev) => new Set(prev).add(pid));
    setKillError(null);
    const dropRow = () =>
      queryClient.setQueryData<ProcessInfo[]>(["processes"], (old) => (old ? old.filter((p) => p.pid !== pid) : old));
    try {
      await apiFetch(API_ROUTES.process(pid), { method: "DELETE" });
      dropRow();
    } catch (e) {
      const key = killErrorKey(e);
      if (key === "kill_error_not_found") dropRow();
      else setKillError(t(key, { pid }));
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
      maxWidth={820}
      ariaLabel={t("title")}
      closeLabel={t("close_running_servers")}
      className="rounded-[24px] overflow-hidden shadow-[var(--lift),0_40px_100px_-30px_rgba(0,0,0,.95)]"
    >
      {/* Header */}
      <div className="flex items-center gap-[14px] pt-[22px] pr-5 pb-[6px] pl-6 shrink-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/claude-rune.png" alt="" width={52} height={52} className="shrink-0 object-contain" />
        <div className="flex-1 min-w-0 flex flex-col gap-[3px]">
          <span className="text-[18px] font-extrabold tracking-[-0.02em]">{t("title")}</span>
          <span className="font-[var(--font-mono)] text-[11px] text-txt-4">
            {t("summary", { count: filtered.length, mem: fmtMemTotal(filtered.reduce((s, p) => s + p.memMb, 0)) })}
          </span>
        </div>
        <span className="inline-flex items-center gap-[6px] px-[10px] py-[4px] rounded-full bg-green-soft text-green text-[11px] font-bold whitespace-nowrap shrink-0">
          <span className="w-[5px] h-[5px] rounded-full bg-green text-green animate-[lrPing_2.4s_cubic-bezier(0,0,.2,1)_infinite]" />
          {t("healthy_count", { count: processes.length })}
        </span>
        <button type="button" title={t("rescan")} aria-label={t("rescan")} onClick={() => processesQ.refetch()} className={ICON_BTN}>
          <Icon name="refresh" size={15} className="w-[15px] h-[15px] [flex:0_0_15px]" />
        </button>
        <button type="button" title={t("close")} aria-label={t("close")} onClick={() => setOpen(false)} className={ICON_BTN}>
          <Icon name="x" size={15} className="w-[15px] h-[15px] [flex:0_0_15px]" />
        </button>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-[10px] pt-4 px-6 pb-1 shrink-0">
        <div className="relative flex-1 min-w-0 flex items-center">
          <span className="absolute left-[14px] flex text-txt-4 pointer-events-none">
            <Icon name="search" size={14} className="w-[14px] h-[14px] [flex:0_0_14px]" />
          </span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("search_placeholder")}
            aria-label={t("search_placeholder")}
            className="w-full h-10 pl-[38px] pr-[14px] border-0 rounded-[12px] bg-card-2 text-txt text-[13px] outline-none placeholder:text-txt-4 transition-shadow duration-[140ms] focus:shadow-[0_0_0_2px_var(--acc-line)]"
          />
        </div>
        <div role="group" aria-label={t("scope")} className="flex items-center gap-[2px] p-[3px] rounded-[12px] bg-card-2 shrink-0">
          {([
            ["project", t("scope_this_project")],
            ["all", t("scope_all")],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-pressed={scope === id}
              onClick={() => setScope(id)}
              className={cn(
                "flex items-center gap-[6px] h-[34px] px-[12px] rounded-[9px] text-[12px] font-semibold whitespace-nowrap transition-all duration-[140ms] cursor-pointer border-0 hover:text-txt",
                scope === id ? "bg-card-3 text-txt shadow-[var(--inset-hi)]" : "bg-transparent text-txt-4",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {killError && (
        <div role="alert" className="mx-6 mt-3 px-[14px] py-[9px] rounded-[10px] bg-red-soft text-red text-[12px] font-[var(--font-mono)] flex items-center justify-between gap-2 shrink-0">
          <span>{killError}</span>
          <button type="button" aria-label={t("dismiss")} onClick={() => setKillError(null)} className="bg-transparent border-0 cursor-pointer text-inherit p-0 leading-none flex">
            <Icon name="x" size={12} className="w-[12px] h-[12px] [flex:0_0_12px]" />
          </button>
        </div>
      )}

      {/* Body */}
      <div className="flex-1 min-h-0 overflow-y-auto pt-[14px] px-[14px] pb-[6px] flex flex-col gap-4 [scrollbar-width:thin] [scrollbar-color:var(--line-2)_transparent]">
        {processesQ.isLoading ? (
          <div className="py-9 text-center text-[13px] text-txt-3">{t("scanning_ports")}</div>
        ) : groups.length === 0 ? (
          <div className="py-9 text-center text-[13px] text-txt-3">
            {q
              ? t("no_matching_servers", { q })
              : processes.length > 0
                ? t("none_in_project", { count: processes.length })
                : t("no_listening_processes")}
          </div>
        ) : (
          groups.map((g) => (
            <div key={g.id} className="flex flex-col">
              <div className="flex items-baseline gap-[8px] px-[12px] pb-[6px]">
                <span className="text-[12px] font-bold text-txt-3">
                  {g.label === "Other" ? t("other_system_processes") : g.label}
                </span>
              </div>
              {g.processes.map((p, i) => (
                <ServerRow
                  key={p.pid}
                  process={p}
                  striped={i % 2 === 1}
                  onKill={() => handleKill(p.pid)}
                  killing={killing.has(p.pid)}
                />
              ))}
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center gap-[10px] pt-[14px] pr-5 pb-[18px] pl-6 shrink-0">
        <span className="flex items-center gap-[7px] font-[var(--font-mono)] text-[10.5px] text-txt-4 whitespace-nowrap">
          <span className="w-[5px] h-[5px] rounded-full bg-green" />
          {t("last_scan", { time: processesQ.dataUpdatedAt ? fmtAgo(processesQ.dataUpdatedAt) : "-" })}
        </span>
        <span className="flex-1" />
        <button
          type="button"
          title={t("scan_settings_soon")}
          disabled
          className="h-8 px-[12px] inline-flex items-center rounded-[10px] text-[13px] text-txt-4 opacity-60 bg-transparent border-0 cursor-not-allowed"
        >
          {t("scan_settings")}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="h-8 min-w-[88px] px-[14px] inline-flex items-center justify-center rounded-[10px] text-[13px] font-semibold text-white cursor-pointer border-0 bg-[linear-gradient(120deg,var(--acc-cta),var(--acc-2))] shadow-[0_12px_26px_-14px_rgba(139,123,255,.95)]"
        >
          {t("done")}
        </button>
      </div>
    </ModalShell>
  );
}
