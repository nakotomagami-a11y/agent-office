"use client";

import { useTranslations } from "next-intl";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { PlanetConfig } from "@agent-office/domain/types";
import { Icon } from "@/components/ui/icon";
import { PlanetCanvas } from "@/components/ui/planet-canvas";
import { getStatusMeta } from "@/components/ui/status-dot-colors";
import { cn } from "@/lib/cn";
import { useProjects, useUpdateProject } from "@/modules/projects/hooks/use-projects";
import { useRuns } from "@/modules/runs/hooks/use-runs";
import { BootstrapProjectModal } from "@/modules/projects/components/bootstrap-project-modal";

/**
 * Reusable project-picker dropdown menu.
 *
 * Designed to be shared by multiple triggers (the titlebar chip, the
 * tab-strip `+` button, and anything future like a command palette), so they
 * all get the same list UI + keyboard nav + "New project" flow.
 *
 * The caller owns the trigger button and anchor. This component renders the
 * menu absolutely-positioned inside a wrapper the caller places. On pick it
 * fires `onPickProject(projectId)`, `onPickAll()` (the "All projects" row), or
 * `onPickManage()` (footer button). "New project" opens the existing bootstrap
 * modal internally.
 *
 * Keyboard: Arrow up/down to move highlight, Enter to select, Escape closes.
 * Click-outside closes.
 */

export type ProjectPickerDropdownProps = {
  /** Whether the menu is currently open. */
  open: boolean;
  /** Ref of the trigger button (or any anchor element). Used for click-outside
   *  detection so pressing the trigger again closes the menu instead of
   *  immediately re-opening from a click-outside firing before the trigger's
   *  own onClick. */
  triggerRef: React.RefObject<HTMLElement | null>;
  /** Called whenever the menu should close (Escape, click outside, or a row
   *  was picked). Caller sets its `open` state to false. */
  onClose: () => void;
  /** Fired when a project row is picked. */
  onPickProject: (projectId: string) => void;
  /** Fired when the "All projects" row is picked. Optional — if omitted the
   *  row is hidden. */
  onPickAll?: () => void;
  /** Fired when the footer "Manage" button is clicked. Optional — if omitted
   *  the button is hidden. */
  onPickManage?: () => void;
  /** Fired when the footer "New project" button is clicked. When provided, the
   *  caller owns the bootstrap modal (it must live outside this component, which
   *  the parent may unmount on close). If omitted, the modal is rendered and
   *  managed internally — only safe when this component stays mounted. */
  onPickNew?: () => void;
  /** Current selection to render with the check-mark + accent bar. Match is
   *  by projectId; pass `null` to mark the "All projects" row as selected. */
  selectedProjectId?: string | null;
  /** Optional set of project ids that already have tabs open — those rows
   *  render with an "open" tag and use `focus` semantics on pick. */
  openTabProjectIds?: ReadonlySet<string>;
  /** Optional className for the outer wrapper. Caller usually sets
   *  `absolute` positioning here. */
  className?: string;
};

export function ProjectPickerDropdown({
  open,
  triggerRef,
  onClose,
  onPickProject,
  onPickAll,
  onPickManage,
  onPickNew,
  selectedProjectId,
  openTabProjectIds,
  className,
}: ProjectPickerDropdownProps) {
  const t = useTranslations();
  const { data, isLoading } = useProjects();
  const projects = useMemo(() => data ?? [], [data]);
  const { data: runs } = useRuns({ limit: 50 });
  const updateProject = useUpdateProject();

  const [activeIndex, setActiveIndex] = useState(0);
  const [filter, setFilter] = useState<"active" | "shelved">("active");
  const [query, setQuery] = useState("");
  const [bootstrapOpen, setBootstrapOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const activeCount = useMemo(() => projects.filter((p) => !p.shelved).length, [projects]);
  const shelvedCount = useMemo(() => projects.filter((p) => p.shelved).length, [projects]);
  const visibleProjects = useMemo(() => {
    const scoped = projects.filter((p) => (filter === "shelved" ? p.shelved : !p.shelved));
    const q = query.trim().toLowerCase();
    if (!q) return scoped;
    return scoped.filter((p) => p.name.toLowerCase().includes(q));
  }, [projects, filter, query]);

  // rows: optional "All projects" + each visible project.
  const rows = useMemo(() => {
    const list: Array<{
      key: string;
      projectId: string | null;
      type: "all" | "project";
    }> = [];
    if (onPickAll) list.push({ key: "__all", projectId: null, type: "all" });
    for (const p of visibleProjects) {
      list.push({ key: p.id, projectId: p.id, type: "project" });
    }
    return list;
  }, [visibleProjects, onPickAll]);

  useEffect(() => {
    if (!open) return;
    const onMouse = (e: MouseEvent) => {
      if (
        !menuRef.current?.contains(e.target as Node) &&
        !triggerRef.current?.contains(e.target as Node)
      ) {
        onClose();
      }
    };
    document.addEventListener("mousedown", onMouse);
    return () => document.removeEventListener("mousedown", onMouse);
  }, [open, onClose, triggerRef]);

  useEffect(() => {
    if (open) setActiveIndex(0);
  }, [open, filter, query]);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const toggleShelve = (projectId: string, shelved: boolean) => {
    updateProject.mutate({ id: projectId, patch: { meta: { shelved } } });
  };

  const pickRow = (row: (typeof rows)[number]) => {
    if (row.type === "all") {
      onPickAll?.();
    } else if (row.projectId) {
      onPickProject(row.projectId);
    }
    onClose();
  };

  const openBootstrap = () => {
    if (onPickNew) {
      onClose();
      onPickNew();
      return;
    }
    setBootstrapOpen(true);
  };

  const handleManage = () => {
    onPickManage?.();
    onClose();
  };

  const onKey = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case "Escape":
        onClose();
        break;
      case "ArrowDown":
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % rows.length);
        break;
      case "ArrowUp":
        e.preventDefault();
        setActiveIndex((i) => (i - 1 + rows.length) % rows.length);
        break;
      case "Enter": {
        e.preventDefault();
        const row = rows[activeIndex];
        if (row) pickRow(row);
        break;
      }
    }
  };

  return (
    <>
      <BootstrapProjectModal open={bootstrapOpen} onClose={() => setBootstrapOpen(false)} />

      {open ? (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={t("project_switcher.menu_label")}
          onKeyDown={onKey}
          className={cn(
            "flex flex-col surface-sheen rounded-[20px] shadow-[var(--lift)] overflow-hidden w-[392px]",
            className,
          )}
        >
          {/* Search + Active/Shelved filter */}
          <div className="shrink-0 flex items-center gap-[10px] py-[13px] px-[14px] border-b border-edge">
            <div className="flex-1 min-w-0 flex items-center gap-[9px] px-[11px] py-[8px] rounded-[12px] bg-card-2 border border-edge shadow-[var(--inset-hi)] cursor-text">
              <Icon name="search" size={13} className="text-txt-4 shrink-0" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("project_switcher.search_placeholder")}
                className="flex-1 min-w-0 bg-transparent border-0 outline-none text-[11.5px] text-txt placeholder:text-txt-4"
              />
            </div>
            <div className="flex items-center gap-[2px] p-[3px] rounded-[12px] bg-card-2 border border-edge shadow-[var(--inset-hi)] shrink-0">
              <FilterTab active={filter === "active"} count={activeCount} onClick={() => setFilter("active")}>
                {t("project_switcher.filter_active")}
              </FilterTab>
              <FilterTab active={filter === "shelved"} count={shelvedCount} onClick={() => setFilter("shelved")}>
                {t("project_switcher.filter_shelved")}
              </FilterTab>
            </div>
          </div>

          {onPickAll ? (
            <div className="shrink-0 p-[6px] border-b border-edge">
              <PickerRow
                primary={t("project_switcher.all_projects")}
                secondary={t("project_switcher.all_projects_subtitle")}
                italic
                selected={selectedProjectId === null}
                highlighted={activeIndex === 0}
                projectId={null}
                onHover={() => setActiveIndex(0)}
                onSelect={() => {
                  onPickAll();
                  onClose();
                }}
              />
            </div>
          ) : null}

          {/* Scrollable project list */}
          <div className="overflow-y-auto flex-1 min-h-0 p-[6px] flex flex-col gap-[1px] max-h-[min(326px,60vh)] [scrollbar-width:thin] [scrollbar-color:var(--line-strong)_transparent]">
            {!isLoading && visibleProjects.length === 0 ? (
              <div className="px-[9px] py-[10px] text-[12px] text-txt-4 italic">
                {query
                  ? t("project_switcher.no_projects")
                  : filter === "shelved"
                    ? t("project_switcher.no_shelved")
                    : t("project_switcher.no_projects")}
              </div>
            ) : (
              visibleProjects.map((p, i) => {
                const rowIndex = onPickAll ? i + 1 : i;
                const isSelected = p.id === selectedProjectId;
                const isAlreadyOpen = openTabProjectIds?.has(p.id) ?? false;
                const sub = [
                  t("project_switcher.agent_count", { count: p.instanceCount }),
                  p.cwd ? t("project_switcher.cwd_label", { path: p.cwd }) : null,
                ]
                  .filter(Boolean)
                  .join(" · ");
                const projectRuns = (runs ?? []).filter((r) => r.projectId === p.id);
                const fiveMinAgo = Date.now() - 5 * 60 * 1000;
                const hasRunning = projectRuns.some((r) => r.status === "running");
                const hasRecentError = projectRuns.some(
                  (r) => r.status === "error" && r.ts > fiveMinAgo,
                );
                const healthDot: "working" | "error" | undefined = hasRunning
                  ? "working"
                  : hasRecentError
                    ? "error"
                    : undefined;
                return (
                  <PickerRow
                    key={p.id}
                    primary={p.name}
                    secondary={sub}
                    selected={isSelected}
                    highlighted={activeIndex === rowIndex}
                    healthDot={healthDot}
                    projectId={p.id}
                    planetConfig={p.planet}
                    tagLabel={isAlreadyOpen ? t("tabs.picker_open_tag") : undefined}
                    onHover={() => setActiveIndex(rowIndex)}
                    onSelect={() => {
                      onPickProject(p.id);
                      onClose();
                    }}
                    shelved={p.shelved ?? false}
                    shelveLabel={p.shelved ? t("project_switcher.unshelve") : t("project_switcher.shelve")}
                    onToggleShelve={() => toggleShelve(p.id, !p.shelved)}
                  />
                );
              })
            )}
          </div>

          <div className="shrink-0 flex items-center gap-[10px] py-[9px] px-[12px] border-t border-edge bg-card-2">
            <button
              type="button"
              role="menuitem"
              className="flex items-center gap-[8px] py-[7px] px-[10px] rounded-[11px] text-txt-2 text-[12px] font-semibold hover:bg-card-3 hover:text-txt transition-[background,color] duration-[140ms]"
              onClick={openBootstrap}
            >
              <Icon name="plus" size={13} /> {t("project_switcher.new_project")}
            </button>
            <span className="flex-1" />
            {onPickManage ? (
              <button
                type="button"
                role="menuitem"
                className="flex items-center gap-[8px] py-[7px] px-[10px] rounded-[11px] text-txt-4 text-[12px] font-semibold hover:bg-card-3 hover:text-txt transition-[background,color] duration-[140ms]"
                onMouseEnter={() => setActiveIndex(rows.length - 1)}
                onClick={handleManage}
              >
                <Icon name="settings" size={13} /> {t("project_switcher.manage")}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}

function FilterTab({
  active,
  count,
  onClick,
  children,
}: {
  active: boolean;
  count: number;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-[5px] py-[5px] px-[10px] rounded-[9px] text-[11px] font-semibold whitespace-nowrap transition-[background,color] duration-[140ms]",
        active
          ? "bg-[linear-gradient(120deg,var(--acc),var(--acc-2))] text-white"
          : "bg-transparent text-txt-4 hover:text-txt-2",
      )}
    >
      {children}
      <span className="font-mono text-[9.5px] opacity-65">{count}</span>
    </button>
  );
}

type RowProps = {
  primary: string;
  secondary?: string;
  italic?: boolean;
  selected: boolean;
  highlighted: boolean;
  healthDot?: "working" | "error";
  onHover: () => void;
  onSelect: () => void;
  projectId?: string | null;
  planetConfig?: PlanetConfig;
  tagLabel?: string;
  shelved?: boolean;
  shelveLabel?: string;
  onToggleShelve?: () => void;
};

function PickerRow({
  primary,
  secondary,
  italic,
  selected,
  highlighted,
  healthDot,
  onHover,
  onSelect,
  projectId,
  planetConfig,
  tagLabel,
  shelved,
  shelveLabel,
  onToggleShelve,
}: RowProps) {
  const isAllRow = projectId === null;
  const openBg = Boolean(tagLabel) || (isAllRow && selected);
  const statusMeta = healthDot ? getStatusMeta(healthDot) : null;
  return (
    <div className="relative group/row" onMouseEnter={onHover}>
      <button
        type="button"
        role="menuitem"
        onClick={(e) => {
          e.preventDefault();
          onSelect();
        }}
        className={cn(
          "flex items-center relative cursor-pointer w-full text-left bg-transparent border-none gap-[11px] px-[9px] py-[8px] rounded-[12px] transition-[background] duration-[130ms]",
          highlighted ? "bg-card-3" : openBg ? "bg-acc-soft" : "hover:bg-card-3",
          selected &&
            "before:content-[''] before:absolute before:left-0 before:top-[8px] before:bottom-[8px] before:w-[2px] before:bg-[var(--acc)] before:rounded-full",
        )}
      >
        {projectId !== undefined && projectId !== null ? (
          <PlanetCanvas
            projectId={projectId}
            config={planetConfig}
            size={28}
            className="rounded-full shrink-0"
          />
        ) : (
          <span className="flex items-center justify-center shrink-0 text-txt-3 w-[28px] h-[28px] rounded-full border border-edge bg-card-2">
            <Icon name="folder" size={13} />
          </span>
        )}
        <span className="min-w-0 flex-1 leading-[1.35]">
          <div
            className={cn(
              "text-[12.5px] overflow-hidden text-ellipsis whitespace-nowrap flex items-center gap-[6px]",
              openBg ? "font-bold text-txt" : italic ? "font-medium italic text-txt-2" : "font-semibold text-txt-2",
            )}
          >
            {primary}
            {selected && <Icon name="check" size={11} className="text-acc shrink-0" />}
          </div>
          {secondary && (
            <div className="font-mono text-[10px] text-txt-4 overflow-hidden text-ellipsis whitespace-nowrap">
              {secondary}
            </div>
          )}
        </span>
        {tagLabel ? (
          <span
            className={cn(
              "text-[8.5px] font-extrabold uppercase tracking-[0.07em] px-[7px] py-[2px] rounded-full bg-green-soft text-green shrink-0",
              onToggleShelve && "group-hover/row:opacity-0 transition-opacity duration-[100ms]",
            )}
          >
            {tagLabel}
          </span>
        ) : statusMeta ? (
          <span
            className={cn(
              "w-[6px] h-[6px] rounded-full shrink-0",
              statusMeta.bgClass,
              onToggleShelve && "group-hover/row:opacity-0 transition-opacity duration-[100ms]",
            )}
            style={statusMeta.pulse ? { boxShadow: `0 0 5px var(${statusMeta.cssVar})` } : undefined}
          />
        ) : null}
      </button>
      {onToggleShelve && (
        <button
          type="button"
          aria-label={shelveLabel}
          title={shelveLabel}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onToggleShelve();
          }}
          className="absolute right-[8px] top-1/2 -translate-y-1/2 w-[24px] h-[24px] inline-flex items-center justify-center rounded-[8px] text-txt-3 opacity-0 group-hover/row:opacity-100 hover:bg-card-3 hover:text-txt transition-[opacity,background,color] duration-[120ms] z-[2]"
        >
          <Icon name={shelved ? "undo" : "archive"} size={13} />
        </button>
      )}
    </div>
  );
}
