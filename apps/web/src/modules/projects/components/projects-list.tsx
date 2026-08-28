"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { PlanetCanvas } from "@/components/ui/planet-canvas";
import { PAGE_ROUTES } from "@agent-office/domain/config/routes";
import { cn } from "@/lib/cn";
import { useProjects } from "../hooks/use-projects";
import { useRuns } from "@/modules/runs/hooks/use-runs";
import { useTabsStore } from "@/lib/tabs-store";
import { useActiveProjectStore } from "@/lib/active-project-store";
import type { ProjectSummary } from "@agent-office/domain/types";
import { BootstrapProjectModal } from "./bootstrap-project-modal";
import { relativeTime, shortenCwd } from "../format/format";

type Scope = "all" | "open" | "shelved";
type Sort = "recent" | "agents";

/** Row data enriched with the real signals the list needs (open tab, live agents). */
type Enriched = ProjectSummary & { isOpen: boolean; liveCount: number };

export function ProjectsList() {
  const t = useTranslations();
  const { data, isLoading } = useProjects();
  const runsQ = useRuns({ limit: 200 });
  const tabs = useTabsStore((s) => s.tabs);
  const activeProjectId = useActiveProjectStore((s) => s.id);

  const [q, setQ] = useState("");
  const [scope, setScope] = useState<Scope>("all");
  const [sort, setSort] = useState<Sort>("recent");
  const [createOpen, setCreateOpen] = useState(false);

  const openIds = useMemo(() => new Set(tabs.map((tab) => tab.projectId)), [tabs]);
  // Live agents per project = running runs grouped by projectId (real data).
  const liveByProject = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of runsQ.data ?? []) {
      if (r.status === "running" && r.projectId) m.set(r.projectId, (m.get(r.projectId) ?? 0) + 1);
    }
    return m;
  }, [runsQ.data]);

  const enriched = useMemo<Enriched[]>(
    () => (data ?? []).map((p) => ({ ...p, isOpen: openIds.has(p.id), liveCount: liveByProject.get(p.id) ?? 0 })),
    [data, openIds, liveByProject],
  );

  const counts = useMemo(
    () => ({
      all: enriched.length,
      open: enriched.filter((p) => p.isOpen).length,
      shelved: enriched.filter((p) => p.shelved).length,
      agents: enriched.reduce((sum, p) => sum + p.instanceCount, 0),
    }),
    [enriched],
  );

  const modal = <BootstrapProjectModal open={createOpen} onClose={() => setCreateOpen(false)} />;

  if (isLoading) {
    return (
      <PageFrame count={undefined} onCreate={() => setCreateOpen(true)}>
        {modal}
        <div className="p-[16px]"><Skeleton width="100%" height={120} /></div>
      </PageFrame>
    );
  }

  if (enriched.length === 0) {
    return (
      <PageFrame count={0} onCreate={() => setCreateOpen(true)}>
        {modal}
        <EmptyState
          icon="folder"
          title={t("projects.empty_title")}
          description={
            <>
              {t("projects.empty_description_prefix")}
              <Link href={PAGE_ROUTES.settings}>{t("projects.empty_description_link")}</Link>
              {t("projects.empty_description_suffix")}
            </>
          }
        />
      </PageFrame>
    );
  }

  const visible = filterSort(enriched, q, scope, sort);

  return (
    <PageFrame count={counts.all} onCreate={() => setCreateOpen(true)}>
      {modal}
      <Toolbar
        q={q}
        onQ={setQ}
        scope={scope}
        onScope={setScope}
        sort={sort}
        onSort={setSort}
        counts={counts}
      />
      <div className="flex-1 min-h-0 overflow-y-auto p-[6px]">
        {visible.length === 0 ? (
          <div className="px-[12px] py-[28px] text-center font-mono text-[12.5px] text-txt-3">
            No projects match &ldquo;{q}&rdquo;
          </div>
        ) : (
          visible.map((p) => <ProjectRow key={p.id} p={p} active={p.id === activeProjectId} />)
        )}
      </div>
      <div className="shrink-0 flex items-center gap-[12px] px-[14px] py-[10px] border-t border-edge bg-card-2">
        <span className="font-mono text-[10.5px] text-txt-4 whitespace-nowrap">
          {counts.all} project{counts.all === 1 ? "" : "s"} · {counts.open} open · {counts.agents} agents configured
        </span>
        <span className="flex-1" />
        <span className="font-mono text-[10px] text-txt-4 whitespace-nowrap">⏎ opens · ⌘⇧N new project</span>
      </div>
    </PageFrame>
  );
}

/** Page shell — big header + the list card that children fill. */
function PageFrame({
  count,
  onCreate,
  children,
}: {
  count: number | undefined;
  onCreate: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="flex-1 min-h-0 flex flex-col gap-[16px] px-[20px] pt-[16px] pb-[20px]">
      <div className="shrink-0 flex items-end gap-[12px]">
        <h1 className="m-0 text-[30px] font-extrabold tracking-[-0.035em]">Projects</h1>
        {count !== undefined && (
          <span className="font-mono text-[11.5px] text-txt-4 pb-[6px] whitespace-nowrap">· {count} found</span>
        )}
        <span className="flex-1" />
        <button
          type="button"
          onClick={onCreate}
          className="flex items-center gap-[9px] px-[18px] py-[11px] rounded-[14px] border-none bg-[linear-gradient(120deg,var(--acc-cta),var(--acc-2))] text-white text-[13px] font-bold cursor-pointer whitespace-nowrap shadow-[0_14px_30px_-14px_rgba(139,123,255,0.95)] transition-transform duration-150 hover:-translate-y-[2px]"
        >
          <Icon name="plus" size={15} /> Create project
        </button>
      </div>
      <div className="flex-1 min-h-0 flex flex-col rounded-[22px] surface-sheen shadow-[var(--lift)] overflow-hidden">
        {children}
      </div>
    </div>
  );
}

function Toolbar({
  q,
  onQ,
  scope,
  onScope,
  sort,
  onSort,
  counts,
}: {
  q: string;
  onQ: (v: string) => void;
  scope: Scope;
  onScope: (s: Scope) => void;
  sort: Sort;
  onSort: (s: Sort) => void;
  counts: { all: number; open: number; shelved: number };
}) {
  return (
    <div className="shrink-0 flex items-center gap-[12px] px-[14px] py-[13px] border-b border-edge">
      <div className="flex-1 min-w-0 flex items-center gap-[10px] px-[13px] py-[9px] rounded-[13px] bg-card-2 border border-edge shadow-[var(--inset-hi)]">
        <Icon name="search" size={14} className="text-txt-4 shrink-0" />
        <input
          value={q}
          onChange={(e) => onQ(e.target.value)}
          placeholder="Filter projects…"
          className="flex-1 min-w-0 bg-transparent border-none outline-none text-txt text-[12.5px] placeholder:text-txt-4"
        />
        {q && (
          <button type="button" onClick={() => onQ("")} aria-label="Clear filter" className="flex items-center bg-transparent border-0 cursor-pointer text-txt-4 hover:text-txt !p-0">
            <Icon name="x" size={12} />
          </button>
        )}
      </div>

      <div role="group" aria-label="Filter by status" className="flex items-center gap-[2px] p-[3px] rounded-[13px] bg-card-2 border border-edge shadow-[var(--inset-hi)] shrink-0">
        <ScopeBtn label="All" count={counts.all} on={scope === "all"} onClick={() => onScope("all")} />
        <ScopeBtn label="Open" count={counts.open} on={scope === "open"} onClick={() => onScope("open")} />
        <ScopeBtn label="Shelved" count={counts.shelved} on={scope === "shelved"} onClick={() => onScope("shelved")} />
      </div>

      <div role="group" aria-label="Sort projects" className="flex items-center gap-[2px] p-[3px] rounded-[13px] bg-card-2 border border-edge shadow-[var(--inset-hi)] shrink-0">
        <SortBtn label="Recent" on={sort === "recent"} onClick={() => onSort("recent")} />
        <SortBtn label="Agents" on={sort === "agents"} onClick={() => onSort("agents")} />
      </div>
    </div>
  );
}

function ScopeBtn({ label, count, on, onClick }: { label: string; count: number; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={cn(
        "flex items-center gap-[6px] px-[12px] py-[6px] rounded-[10px] text-[11.5px] font-semibold whitespace-nowrap cursor-pointer transition-all duration-150",
        on
          ? "bg-[linear-gradient(120deg,var(--acc-cta),var(--acc-2))] text-white shadow-[0_8px_18px_-10px_rgba(139,123,255,0.8)]"
          : "bg-transparent text-txt-3 hover:brightness-110",
      )}
    >
      {label}
      <span className="font-mono text-[9.5px] opacity-70">{count}</span>
    </button>
  );
}

function SortBtn({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={cn(
        "px-[12px] py-[6px] rounded-[10px] text-[11.5px] font-semibold whitespace-nowrap cursor-pointer transition-colors duration-150",
        on ? "bg-card text-txt" : "bg-transparent text-txt-4 hover:text-txt",
      )}
    >
      {label}
    </button>
  );
}

function ProjectRow({ p, active }: { p: Enriched; active: boolean }) {
  const cwdShort = p.cwd ? shortenCwd(p.cwd) : null;
  return (
    <Link
      href={PAGE_ROUTES.project(p.id)}
      className={cn(
        "flex items-center gap-[14px] px-[12px] py-[11px] rounded-[14px] no-underline text-txt transition-colors duration-150",
        active ? "bg-acc-soft" : "hover:bg-card-2",
      )}
    >
      <PlanetCanvas projectId={p.id} config={p.planet} size={32} className="shrink-0 rounded-full overflow-hidden" />
      <div className="flex-1 min-w-0 leading-[1.4]">
        <div className="flex items-center gap-[8px] min-w-0">
          <span className="text-[13.5px] font-bold text-txt whitespace-nowrap shrink-0">{p.name}</span>
          {p.isOpen && (
            <span className="text-[8.5px] font-extrabold tracking-[0.07em] px-[7px] py-[2px] rounded-full bg-green-soft text-green whitespace-nowrap shrink-0">
              OPEN
            </span>
          )}
          {p.liveCount > 0 && (
            <span className="flex items-center gap-[5px] px-[8px] py-[2px] rounded-full bg-green-soft text-green text-[9.5px] font-bold whitespace-nowrap shrink-0">
              <span className="w-[5px] h-[5px] rounded-full bg-green animate-pulse" />
              {p.liveCount} live
            </span>
          )}
        </div>
        {p.description && (
          <div className="text-[12px] text-txt-3 whitespace-nowrap overflow-hidden text-ellipsis">{p.description}</div>
        )}
        {cwdShort && (
          <div className="font-mono text-[10.5px] text-txt-4 whitespace-nowrap overflow-hidden text-ellipsis">
            {cwdShort.prefix}
          </div>
        )}
      </div>
      <span className="font-mono text-[11px] text-txt-4 whitespace-nowrap shrink-0 w-[64px] text-right">
        {p.lastRunAt ? relativeTime(p.lastRunAt) : "—"}
      </span>
      <span
        title="Agents"
        className="flex items-center justify-center min-w-[30px] px-[8px] py-[3px] rounded-full bg-card-3 text-txt-2 font-mono text-[11px] font-semibold shrink-0"
      >
        {p.instanceCount}
      </span>
    </Link>
  );
}

function filterSort(list: Enriched[], q: string, scope: Scope, sort: Sort): Enriched[] {
  const needle = q.trim().toLowerCase();
  const filtered = list.filter((p) => {
    if (scope === "open" && !p.isOpen) return false;
    if (scope === "shelved" && !p.shelved) return false;
    if (!needle) return true;
    return (
      p.name.toLowerCase().includes(needle) ||
      p.cwd?.toLowerCase().includes(needle) ||
      p.description?.toLowerCase().includes(needle)
    );
  });
  return [...filtered].sort((a, b) => {
    if (sort === "agents") {
      if (b.instanceCount !== a.instanceCount) return b.instanceCount - a.instanceCount;
      return a.name.localeCompare(b.name);
    }
    // recent: most-recent run first, projects without a run last
    const at = a.lastRunAt ?? 0;
    const bt = b.lastRunAt ?? 0;
    if (bt !== at) return bt - at;
    return a.name.localeCompare(b.name);
  });
}
