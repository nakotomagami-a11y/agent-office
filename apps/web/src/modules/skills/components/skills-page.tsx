"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { DropdownMenu, type DropdownItem } from "@/components/ui/dropdown-menu";
import { Icon, type IconName } from "@/components/ui/icon";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/cn";
import {
  useInstallSkill,
  useUninstallSkill,
  useSkillIcons,
  useSkillSources,
  useSkillUpdates,
} from "../hooks/use-skills";
import { useSkillList } from "../hooks/use-skill-list";
import {
  filterRegistry,
  collectCategories,
  countByOrigin,
  type RegistryFilter,
} from "../registry/filter-registry";
import type { RegistrySkill } from "@agent-office/domain/types";
import { SkillSourcesCard } from "./skill-sources-card";
import { SkillCard } from "./skill-card";
import { SkillEditorModal } from "./skill-editor-modal";
import { ImportSkillModal } from "./import-skill-modal";

/** Cards per page. 60 = 20 rows at the 3-up desktop width. */
const PAGE_SIZE = 60;

export function SkillsPage() {
  const { skills, installedCount, catalogCount, isLoading, isError } = useSkillList();
  const iconsQ = useSkillIcons();
  const sourcesQ = useSkillSources();
  const updatesQ = useSkillUpdates();
  const installMut = useInstallSkill();
  const uninstallMut = useUninstallSkill();

  const [filter, setFilter] = useState<RegistryFilter>({
    q: "",
    showInstalledOnly: false,
    category: "all",
    origin: "all",
    sort: "name",
  });
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [forgeOpen, setForgeOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState<RegistrySkill | null>(null);
  const [forking, setForking] = useState<RegistrySkill | null>(null);
  const [page, setPage] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Data is client-fetched (and may be served from a persisted cache), so the
  // first client render can diverge from SSR. Gate the dynamic layer on mount
  // so the initial client paint matches the server, avoiding hydration errors.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const categories = useMemo(() => collectCategories(skills), [skills]);
  const originCounts = useMemo(() => countByOrigin(skills), [skills]);
  const registryLoading = !mounted || isLoading;
  const filtered = useMemo(() => filterRegistry(skills, filter), [skills, filter]);
  const totalCount = skills.length;
  const updatesCount = updatesQ.data?.length ?? 0;
  const sourcesCount = sourcesQ.data?.length ?? 0;
  const busy = installMut.isPending || uninstallMut.isPending;

  // Client-side pagination over the filtered set.
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const clampedPage = Math.min(page, pageCount - 1);
  const paged = useMemo(
    () => filtered.slice(clampedPage * PAGE_SIZE, clampedPage * PAGE_SIZE + PAGE_SIZE),
    [filtered, clampedPage],
  );
  const rangeStart = filtered.length === 0 ? 0 : clampedPage * PAGE_SIZE + 1;
  const rangeEnd = Math.min(filtered.length, clampedPage * PAGE_SIZE + PAGE_SIZE);

  // Any filter change collapses the result set — jump back to the first page.
  useEffect(() => {
    setPage(0);
  }, [filter.q, filter.category, filter.origin, filter.showInstalledOnly, filter.sort]);

  const goToPage = (next: number) => {
    setPage(next);
    scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div ref={scrollRef} className="overflow-auto">
      <div className="p-[20px] flex flex-col gap-[14px]">
        {/* ── Overview band ─────────────────────────────────────────── */}
        <div className="paper-panel relative rounded-none px-[30px] py-[26px] flex flex-wrap items-center gap-[28px]">
          <div className="relative shrink-0">
            <div className="flex items-baseline gap-[9px]">
              <span className="text-[46px] font-extrabold tracking-[-0.04em] leading-none">
                {registryLoading ? "—" : installedCount}
              </span>
              <span className="text-[11px] font-bold tracking-[0.08em] uppercase text-txt-4">installed</span>
            </div>
            <div className="flex items-center gap-[10px] mt-[12px]">
              <span className="relative block w-[168px] h-[6px] rounded-full bg-card-3 shadow-[var(--inset-hi)]">
                <span
                  className="absolute inset-y-0 left-0 rounded-full bg-[linear-gradient(90deg,var(--acc-cta),var(--acc-2))]"
                  style={{
                    width: `${mounted && totalCount ? Math.max(3, (installedCount / totalCount) * 100) : 0}%`,
                  }}
                />
              </span>
              <span className="font-mono text-[11px] text-txt-4 whitespace-nowrap">
                of {registryLoading ? "—" : totalCount} known
              </span>
            </div>
          </div>

          <div className="relative flex items-center gap-[8px] flex-wrap">
            <MiniStat icon="/icons/manuscripts.png" value={catalogCount} label="catalog" loading={registryLoading} />
            <MiniStat icon="/icons/scroll.png" value={sourcesCount} label="sources" loading={!mounted || sourcesQ.isLoading} />
            <MiniStat
              icon="/icons/scroll-seal.png"
              value={updatesCount}
              label="updates"
              loading={!mounted || updatesQ.isLoading}
            />
          </div>

          <span className="flex-1 min-w-[10px]" />

          <div className="relative flex items-center gap-[10px] shrink-0">
            <button
              type="button"
              onClick={() => setImportOpen(true)}
              className="flex items-center gap-[8px] py-[11px] px-[16px] rounded-[13px] border border-edge-2 bg-card-2 text-txt-2 text-[13.5px] font-semibold whitespace-nowrap cursor-pointer transition-all duration-150 hover:text-txt hover:border-txt-4"
            >
              <Icon name="upload" size={15} /> Import
            </button>
            <button
              type="button"
              onClick={() => setForgeOpen(true)}
              className="flex items-center gap-[8px] py-[11px] px-[18px] rounded-[13px] bg-[linear-gradient(120deg,var(--acc-cta),var(--acc-2))] text-white text-[13.5px] font-bold whitespace-nowrap cursor-pointer shadow-[0_14px_30px_-14px_rgba(139,123,255,0.9)] transition-transform duration-150 hover:-translate-y-[2px]"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/icons/anvil.png" alt="" width={18} height={18} className="shrink-0 object-contain" /> Forge skill
            </button>
          </div>
        </div>

        {/* ── Toolbar ───────────────────────────────────────────────── */}
        <div className="flex items-center gap-[10px] flex-wrap">
          <div className="relative flex-1 min-w-[220px] h-[40px] flex items-center gap-[9px] px-[14px] rounded-[16px] surface-sheen shadow-[var(--lift)] cursor-text">
            <Icon name="search" size={15} className="text-txt-4 shrink-0" />
            <input
              value={filter.q}
              onChange={(e) => setFilter((f) => ({ ...f, q: e.target.value }))}
              placeholder="Search skills by name, tag, or source…"
              aria-label="Search skills"
              className="flex-1 min-w-0 border-none bg-transparent outline-none text-[13px] text-txt placeholder:text-txt-4"
            />
          </div>

          <SelectMenu
            ariaLabel="Filter by category"
            width="w-[190px]"
            value={filter.category === "all" ? "All categories" : filter.category ?? "All categories"}
            items={[
              {
                key: "all",
                label: "All categories",
                selected: filter.category === "all",
                onSelect: () => setFilter((f) => ({ ...f, category: "all" })),
              },
              ...categories.map<DropdownItem>((c) => ({
                key: c.tag,
                selected: filter.category === c.tag,
                onSelect: () => setFilter((f) => ({ ...f, category: c.tag })),
                label: (
                  <span className="flex items-center justify-between gap-4 w-full">
                    <span className="truncate">{c.tag}</span>
                    <span className="font-mono text-[11px] text-txt-4">{c.count}</span>
                  </span>
                ),
              })),
            ]}
          />

          <SelectMenu
            ariaLabel="Sort skills"
            width="w-[160px]"
            icon="list"
            value={filter.sort === "installed" ? "Installed first" : "Name A–Z"}
            items={[
              {
                key: "name",
                label: "Name A–Z",
                selected: filter.sort === "name",
                onSelect: () => setFilter((f) => ({ ...f, sort: "name" })),
              },
              {
                key: "installed",
                label: "Installed first",
                selected: filter.sort === "installed",
                onSelect: () => setFilter((f) => ({ ...f, sort: "installed" })),
              },
            ]}
          />

          {/* origin (radio) + installed-only (independent toggle) share one pill,
              matching the mock's unified filter cluster look. */}
          <div className="flex items-center gap-[2px] h-[40px] px-[5px] rounded-[16px] surface-sheen shadow-[var(--lift)] shrink-0">
            <SegBtn active={filter.origin === "all"} onClick={() => setFilter((f) => ({ ...f, origin: "all" }))}>
              All
            </SegBtn>
            <SegBtn
              active={filter.origin === "local"}
              onClick={() => setFilter((f) => ({ ...f, origin: "local" }))}
              count={mounted ? originCounts.local : 0}
            >
              Mine
            </SegBtn>
            <SegBtn
              active={filter.origin === "github"}
              onClick={() => setFilter((f) => ({ ...f, origin: "github" }))}
              count={mounted ? originCounts.github : 0}
            >
              GitHub
            </SegBtn>
            <SegBtn
              active={filter.showInstalledOnly}
              onClick={() => setFilter((f) => ({ ...f, showInstalledOnly: !f.showInstalledOnly }))}
            >
              Installed
            </SegBtn>
          </div>
        </div>

        {/* ── Result count ──────────────────────────────────────────── */}
        {mounted && !isLoading && !isError ? (
          <div className="flex items-center gap-[10px] px-[4px]">
            <span className="font-mono text-[11px] text-txt-4 whitespace-nowrap">
              {filtered.length > PAGE_SIZE
                ? `Showing ${rangeStart}–${rangeEnd} of ${filtered.length}`
                : `${filtered.length} of ${totalCount} skills`}
              {filter.category !== "all" ? ` · ${filter.category}` : ""}
            </span>
            <span className="flex-1" />
            <button
              type="button"
              onClick={() => setSourcesOpen((v) => !v)}
              aria-expanded={sourcesOpen}
              className={cn(
                "font-mono text-[11px] whitespace-nowrap cursor-pointer transition-colors duration-150",
                sourcesOpen ? "text-acc" : "text-txt-4 hover:text-txt",
              )}
            >
              {sourcesCount} sources
            </button>
          </div>
        ) : null}

        {sourcesOpen ? <SkillSourcesCard /> : null}

        {/* ── Grid / states ─────────────────────────────────────────── */}
        {registryLoading ? null : isError ? (
          <EmptyState
            icon="slash"
            title="Couldn't load the registry"
            description="The skill sources didn't respond. Check your connection and refresh."
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={filter.origin === "local" ? "hammer" : "search"}
            title={filter.origin === "local" ? "No skills of your own yet" : "No skills match"}
            description={
              filter.origin === "local"
                ? "Forge a new skill, or fork a GitHub skill to make an editable copy you own."
                : filter.q || filter.category !== "all" || filter.showInstalledOnly
                  ? "Try clearing the search or switching category."
                  : "Add a source or forge your own to get started."
            }
            action={
              <button
                type="button"
                onClick={() => setForgeOpen(true)}
                className="flex items-center gap-[7px] py-[9px] px-[16px] rounded-[12px] bg-[linear-gradient(120deg,var(--acc-cta),var(--acc-2))] text-white text-[13px] font-bold whitespace-nowrap cursor-pointer"
              >
                <Icon name="hammer" size={13} /> Forge a skill
              </button>
            }
          />
        ) : (
          <div className="flex flex-wrap gap-[14px]">
            {paged.map((s) => (
              <div key={`${s.source}-${s.name}`} className="flex-1 basis-[320px] max-w-[380px] min-w-[280px]">
                <SkillCard
                  skill={s}
                  icons={iconsQ.data}
                  busy={busy}
                  onInstall={() =>
                    installMut.mutate({ source: s.source, ref: s.ref, path: s.path, name: s.name })
                  }
                  onUninstall={() => uninstallMut.mutate(s.name)}
                  onEdit={() => setEditing(s)}
                  onFork={() => setForking(s)}
                />
              </div>
            ))}
            {/* keeps the last row left-aligned instead of stretching a lone card */}
            <div aria-hidden className="flex-1 basis-[320px] max-w-[380px] min-w-[280px]" />
            <div aria-hidden className="flex-1 basis-[320px] max-w-[380px] min-w-[280px]" />
          </div>
        )}

        {/* ── Pagination ────────────────────────────────────────────── */}
        {mounted && !registryLoading && !isError && pageCount > 1 ? (
          <div className="flex items-center justify-between gap-3 pt-1 pb-2">
            <span className="text-[11.5px] font-mono text-txt-4">
              Page {clampedPage + 1} of {pageCount}
            </span>
            <div className="flex items-center gap-1.5">
              <PagerBtn
                disabled={clampedPage === 0}
                onClick={() => goToPage(Math.max(0, clampedPage - 1))}
              >
                <Icon name="chevron" size={13} className="rotate-180" /> Prev
              </PagerBtn>
              {pageWindow(clampedPage, pageCount).map((p, i) =>
                p === -1 ? (
                  <span key={`gap-${i}`} className="px-1 text-[12px] font-mono text-txt-4">
                    …
                  </span>
                ) : (
                  <button
                    key={p}
                    type="button"
                    onClick={() => goToPage(p)}
                    aria-current={p === clampedPage}
                    className={cn(
                      "h-[30px] min-w-[30px] px-[8px] rounded-[10px] text-[12.5px] font-mono tabular-nums cursor-pointer transition-colors duration-150",
                      p === clampedPage ? "bg-acc-soft text-acc" : "bg-card-2 border border-edge text-txt-3 hover:text-txt",
                    )}
                  >
                    {p + 1}
                  </button>
                ),
              )}
              <PagerBtn
                disabled={clampedPage >= pageCount - 1}
                onClick={() => goToPage(Math.min(pageCount - 1, clampedPage + 1))}
              >
                Next <Icon name="chevron" size={13} />
              </PagerBtn>
            </div>
          </div>
        ) : null}
      </div>

      <SkillEditorModal open={forgeOpen} mode="create" onClose={() => setForgeOpen(false)} />
      <SkillEditorModal
        open={editing !== null}
        mode="edit"
        skill={editing}
        onClose={() => setEditing(null)}
      />
      <SkillEditorModal
        open={forking !== null}
        mode="edit"
        skill={forking}
        forceFork
        onClose={() => setForking(null)}
      />
      <ImportSkillModal open={importOpen} onClose={() => setImportOpen(false)} />
    </div>
  );
}

function MiniStat({
  icon,
  value,
  label,
  loading,
}: {
  icon: string;
  value: number;
  label: string;
  loading?: boolean;
}) {
  return (
    <div className="flex items-center gap-[10px] py-[11px] px-[15px] rounded-[15px] bg-card-2 border border-edge shadow-[var(--inset-hi)]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={icon} alt="" width={38} height={38} className="shrink-0 object-contain" />
      <div className="leading-[1.25]">
        <div className="text-[18px] font-extrabold tracking-[-0.02em]">{loading ? "—" : value}</div>
        <div className="text-[10px] font-bold tracking-[0.07em] uppercase text-txt-4 whitespace-nowrap">{label}</div>
      </div>
    </div>
  );
}

/** Select-style trigger backed by the app's custom DropdownMenu (portalled, keyboard-navigable). */
function SelectMenu({
  ariaLabel,
  width,
  icon,
  value,
  items,
}: {
  ariaLabel: string;
  width?: string;
  icon?: IconName;
  value: ReactNode;
  items: DropdownItem[];
}) {
  return (
    <DropdownMenu
      ariaLabel={ariaLabel}
      align="start"
      className={cn("block", width ?? "w-[180px]")}
      triggerClassName="w-full h-[40px] px-[14px] justify-between rounded-[16px] surface-sheen shadow-[var(--lift)] text-txt text-[13px] font-semibold"
      trigger={
        <>
          <span className="flex items-center gap-2 min-w-0 truncate">
            {icon ? <Icon name={icon} size={14} className="text-txt-4 shrink-0" /> : null}
            <span className="truncate">{value}</span>
          </span>
          <Icon name="chevron-down" size={13} className="text-txt-4 shrink-0" />
        </>
      }
      items={items}
    />
  );
}

/** Windowed page list: first, last, current ±1, with -1 markers for gaps. */
function pageWindow(current: number, total: number): number[] {
  const wanted = new Set([0, total - 1, current - 1, current, current + 1]);
  const sorted = [...wanted].filter((p) => p >= 0 && p < total).sort((a, b) => a - b);
  const out: number[] = [];
  let prev = -2;
  for (const p of sorted) {
    if (p - prev > 1) out.push(-1);
    out.push(p);
    prev = p;
  }
  return out;
}

function PagerBtn({
  disabled,
  onClick,
  children,
}: {
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-[5px] h-[30px] px-[10px] rounded-[10px] text-[12.5px] font-semibold text-txt-3 bg-card-2 border border-edge cursor-pointer transition-colors duration-150 hover:text-txt disabled:opacity-40 disabled:cursor-not-allowed"
    >
      {children}
    </button>
  );
}

function SegBtn({
  active,
  onClick,
  count,
  children,
}: {
  active: boolean;
  onClick: () => void;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex items-center gap-[7px] py-[7px] px-[13px] rounded-[12px] text-[12.5px] font-semibold whitespace-nowrap cursor-pointer transition-[filter] duration-150",
        active
          ? "bg-[linear-gradient(120deg,var(--acc-cta),var(--acc-2))] text-white shadow-[0_8px_18px_-10px_rgba(139,123,255,0.8)]"
          : "bg-transparent text-txt-3 hover:brightness-110",
      )}
    >
      {children}
      {count !== undefined ? <span className="font-mono text-[10px] opacity-70">{count}</span> : null}
    </button>
  );
}
