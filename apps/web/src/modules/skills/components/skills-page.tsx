"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { TextInput } from "@/components/ui/text-input";
import { DropdownMenu, type DropdownItem } from "@/components/ui/dropdown-menu";
import { Icon, type IconName } from "@/components/ui/icon";
import { EmptyState } from "@/components/ui/empty-state";
import { ACCENT_BTN } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { SURFACE_HERO } from "./surface";
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
      <div className="mx-auto max-w-[1180px] px-6 py-5 flex flex-col gap-4">
        {/* ── Overview band ─────────────────────────────────────────── */}
        <section className={`relative overflow-hidden rounded-[var(--r-xl)] ${SURFACE_HERO}`}>
          {/* accent glow */}
          <div
            aria-hidden
            className="pointer-events-none absolute -top-28 right-[26%] w-[520px] h-[360px] rounded-full blur-[80px]
                       bg-[radial-gradient(circle,color-mix(in_srgb,var(--acc)_32%,transparent),transparent_70%)]"
          />
          {/* cool ambient glow, lower-left, for balance */}
          <div
            aria-hidden
            className="pointer-events-none absolute -bottom-24 -left-16 w-[360px] h-[240px] rounded-full blur-[80px]
                       bg-[radial-gradient(circle,color-mix(in_srgb,var(--acc)_12%,transparent),transparent_70%)]"
          />
          {/* fine noise texture — reads as crafted material on dark */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-[0.05] mix-blend-soft-light bg-repeat"
            style={{
              backgroundImage:
                "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
            }}
          />
          {/* top edge accent hairline */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-px
                       bg-[linear-gradient(90deg,transparent,color-mix(in_srgb,var(--acc)_45%,transparent),transparent)]"
          />
          <div className="relative flex flex-col lg:flex-row lg:items-center gap-6 p-6">
            <div className="flex-1 min-w-0 flex items-end gap-6 flex-wrap">
              {/* primary — installed w/ capacity bar */}
              <div className="flex items-center gap-3.5">
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-baseline gap-2">
                    <span className="text-[32px] leading-none font-bold tabular-nums tracking-[-0.02em] text-txt">
                      {registryLoading ? "—" : installedCount}
                    </span>
                    <span className="text-[11px] font-mono uppercase tracking-[0.1em] text-txt-4">
                      Installed
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="relative block w-[150px] h-[6px] rounded-full overflow-hidden bg-bg-3 border border-line">
                      <span
                        className="absolute inset-y-0 left-0 rounded-full bg-[linear-gradient(90deg,var(--acc-hover),var(--acc))]"
                        style={{
                          width: `${mounted && totalCount ? Math.max(3, (installedCount / totalCount) * 100) : 0}%`,
                        }}
                      />
                    </span>
                    <span className="text-[11px] font-mono text-txt-4">
                      of {registryLoading ? "—" : totalCount} known
                    </span>
                  </div>
                </div>
              </div>

              {/* secondary stats — inset well */}
              <div className="flex items-center gap-1 rounded-[var(--r-md)] border border-line bg-bg-0/60 px-1 py-1">
                <MiniStat icon="layers" value={catalogCount} label="catalog" loading={registryLoading} />
                <MiniStat icon="server" value={sourcesCount} label="sources" loading={!mounted || sourcesQ.isLoading} />
                <MiniStat
                  icon="refresh"
                  value={updatesCount}
                  label="updates"
                  tone={updatesCount > 0 ? "warn" : undefined}
                  loading={!mounted || updatesQ.isLoading}
                />
              </div>
            </div>

            <div className="flex items-center gap-2.5 shrink-0">
              <button
                type="button"
                onClick={() => setImportOpen(true)}
                className="inline-flex items-center gap-2 h-10 px-4 rounded-[var(--r-md)] text-[13px] font-medium text-txt
                           border border-line-2
                           bg-[linear-gradient(180deg,color-mix(in_oklab,var(--bg-2)_92%,#fff),var(--bg-2))]
                           shadow-[inset_0_1px_0_color-mix(in_oklab,#fff_10%,transparent),0_2px_8px_-3px_rgba(0,0,0,0.5)]
                           hover:brightness-110 transition-[filter] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acc"
              >
                <Icon name="upload" size={15} /> Import
              </button>
              <button
                type="button"
                onClick={() => setForgeOpen(true)}
                className={`inline-flex items-center gap-2 h-10 px-5 rounded-[var(--r-md)] text-[13.5px] font-semibold ${ACCENT_BTN}`}
              >
                <Icon name="hammer" size={15} /> Forge skill
              </button>
            </div>
          </div>
        </section>

        {/* ── Toolbar ───────────────────────────────────────────────── */}
        <div className="-mx-1 px-1 py-1">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[220px]">
              <Icon
                name="search"
                size={14}
                className="pointer-events-none absolute left-[10px] top-1/2 -translate-y-1/2 text-txt-4"
              />
              <TextInput
                value={filter.q}
                onChange={(e) => setFilter((f) => ({ ...f, q: e.target.value }))}
                placeholder="Search skills by name, tag, or source…"
                className="pl-8"
                aria-label="Search skills"
              />
            </div>

            <SelectMenu
              ariaLabel="Filter by category"
              width="w-[190px]"
              icon="filter"
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

            {/* origin + installed segmented — one pill, matches the design's
                merged 4-segment control instead of splitting "Installed" out
                as its own standalone toggle. */}
            <div className="inline-flex items-center gap-[2px] p-[5px] rounded-[16px] surface-sheen shadow-[var(--lift)]">
              <SegBtn active={filter.origin === "all"} onClick={() => setFilter((f) => ({ ...f, origin: "all" }))}>
                All
              </SegBtn>
              <SegBtn
                active={filter.origin === "local"}
                onClick={() => setFilter((f) => ({ ...f, origin: "local" }))}
                icon="pen"
                count={mounted ? originCounts.local : 0}
              >
                Mine
              </SegBtn>
              <SegBtn
                active={filter.origin === "github"}
                onClick={() => setFilter((f) => ({ ...f, origin: "github" }))}
                icon="branch"
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

            <button
              type="button"
              onClick={() => setSourcesOpen((v) => !v)}
              aria-expanded={sourcesOpen}
              className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-[var(--r-md)] text-[12.5px] border transition-colors ${
                sourcesOpen
                  ? "bg-ao-accent-soft border-ao-accent-line text-acc"
                  : "bg-bg-1 border-line-2 text-txt-2 shadow-1 hover:bg-bg-2"
              }`}
            >
              <Icon name="server" size={13} /> Sources
              <span className="font-mono text-[11px] text-txt-4">{sourcesCount}</span>
              <Icon name="chevron-down" size={12} className={sourcesOpen ? "rotate-180 transition-transform" : "transition-transform"} />
            </button>
          </div>

          {sourcesOpen ? (
            <div className="mt-2">
              <SkillSourcesCard />
            </div>
          ) : null}
        </div>

        {/* ── Result count ──────────────────────────────────────────── */}
        {mounted && !isLoading && !isError ? (
          <div className="text-[11.5px] font-mono text-txt-4 -mb-1 px-0.5">
            {filtered.length > PAGE_SIZE
              ? `Showing ${rangeStart}–${rangeEnd} of ${filtered.length}`
              : `${filtered.length} of ${totalCount} skills`}
            {filter.category !== "all" ? ` · ${filter.category}` : ""}
          </div>
        ) : null}

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
                className={`inline-flex items-center gap-1.5 h-8 px-4 rounded-[var(--r-md)] text-[13px] font-medium ${ACCENT_BTN}`}
              >
                <Icon name="hammer" size={13} /> Forge a skill
              </button>
            }
          />
        ) : (
          <div className="flex flex-wrap gap-3">
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
                    className={`h-8 min-w-8 px-2 rounded-[var(--r-md)] text-[12.5px] font-mono tabular-nums border transition-colors ${
                      p === clampedPage
                        ? "bg-ao-accent-soft border-ao-accent-line text-acc"
                        : "bg-bg-1 border-line-2 text-txt-2 shadow-1 hover:bg-bg-2"
                    }`}
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
      <ImportSkillModal open={importOpen} onClose={() => setImportOpen(false)} />
    </div>
  );
}

function MiniStat({
  icon,
  value,
  label,
  tone,
  loading,
}: {
  icon: IconName;
  value: number;
  label: string;
  tone?: "warn";
  loading?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-[8px]">
      <Icon
        name={icon}
        size={14}
        className={tone === "warn" ? "text-ao-warn" : "text-txt-4"}
      />
      <span
        className={`text-[16px] font-bold tabular-nums leading-none ${
          tone === "warn" ? "text-ao-warn" : "text-txt"
        }`}
      >
        {loading ? "—" : value}
      </span>
      <span className="text-[10.5px] font-mono uppercase tracking-[0.08em] text-txt-4">{label}</span>
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
      triggerClassName="w-full h-8 px-[10px] justify-between rounded-[var(--r-md)] border border-line-2 text-txt text-[13px] shadow-1
                        bg-[linear-gradient(180deg,color-mix(in_oklab,var(--bg-1)_94%,#fff),var(--bg-1))]
                        hover:border-ao-accent-line"
      trigger={
        <>
          <span className="flex items-center gap-2 min-w-0 truncate">
            {icon ? <Icon name={icon} size={13} className="text-txt-4 shrink-0" /> : null}
            <span className="truncate">{value}</span>
          </span>
          <Icon name="chevron-down" size={14} className="text-txt-3 shrink-0" />
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
      className="inline-flex items-center gap-1 h-8 px-2.5 rounded-[var(--r-md)] text-[12.5px] text-txt-2 bg-bg-1 border border-line-2 shadow-1
                 hover:bg-bg-2 disabled:opacity-40 disabled:cursor-not-allowed
                 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acc"
    >
      {children}
    </button>
  );
}

function SegBtn({
  active,
  onClick,
  icon,
  count,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon?: IconName;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex items-center gap-[7px] py-[7px] px-[13px] rounded-[12px] text-[12.5px] font-semibold whitespace-nowrap transition-[background,color,box-shadow] duration-150 ${
        active
          ? "bg-[linear-gradient(120deg,var(--acc-cta),var(--acc-2))] text-white shadow-[0_8px_18px_-10px_rgba(139,123,255,0.8)]"
          : "bg-transparent text-txt-3 hover:brightness-110"
      }`}
    >
      {icon ? <Icon name={icon} size={12} /> : null}
      {children}
      {count !== undefined ? (
        <span className="font-mono text-[10px] opacity-70">{count}</span>
      ) : null}
    </button>
  );
}

