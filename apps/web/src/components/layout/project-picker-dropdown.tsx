"use client";

import { match } from "ts-pattern";
import { useTranslations } from "next-intl";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { PlanetConfig } from "@agent-office/domain/types";
import { Icon } from "@/components/ui/icon";
import { PlanetCanvas } from "@/components/ui/planet-canvas";
import { cn } from "@/lib/cn";
import { useProjects, useUpdateProject } from "@/modules/projects/hooks/use-projects";
import { useRuns } from "@/modules/runs/hooks/use-runs";
import { BootstrapProjectModal } from "@/modules/projects/components/bootstrap-project-modal";

/**
 * Reusable project-picker dropdown menu.
 *
 * Extracted from the original `ProjectSwitcher` so multiple triggers (the
 * titlebar chip, the tab-strip `+` button, and anything future like a command
 * palette) can share the same list UI + keyboard nav + "New project" flow.
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
  const [bootstrapOpen, setBootstrapOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const shelvedCount = useMemo(() => projects.filter((p) => p.shelved).length, [projects]);
  const visibleProjects = useMemo(
    () => projects.filter((p) => (filter === "shelved" ? p.shelved : !p.shelved)),
    [projects, filter],
  );

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
  }, [open, filter]);

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
    onClose();
    setBootstrapOpen(true);
  };

  const handleManage = () => {
    onPickManage?.();
    onClose();
  };

  const onKey = (e: React.KeyboardEvent) => {
    match(e.key)
      .with("Escape", () => {
        onClose();
      })
      .with("ArrowDown", () => {
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % rows.length);
      })
      .with("ArrowUp", () => {
        e.preventDefault();
        setActiveIndex((i) => (i - 1 + rows.length) % rows.length);
      })
      .with("Enter", () => {
        e.preventDefault();
        const row = rows[activeIndex];
        if (row) pickRow(row);
      })
      .otherwise(() => {});
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
            "flex flex-col border border-line-2 bg-bg-elev rounded-[var(--r-lg)] shadow-[var(--shadow-3)] overflow-hidden w-[340px] max-h-[70vh]",
            className,
          )}
        >
          {/* Fixed header */}
          <div className="shrink-0 p-1 pb-0">
            {onPickAll ? (
              <>
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
                <Separator />
              </>
            ) : null}
            <div className="flex items-center gap-2 px-3 pt-2 pb-1">
              <span className="uppercase text-txt-3 font-[var(--font-mono)] text-[10px] tracking-[0.08em]">
                {isLoading
                  ? t("project_switcher.section_loading")
                  : t("project_switcher.section_count", { count: visibleProjects.length })}
              </span>
              <div className="ml-auto flex items-center gap-[2px] p-[2px] rounded-[6px] bg-bg-2 border border-line">
                <FilterTab active={filter === "active"} onClick={() => setFilter("active")}>
                  {t("project_switcher.filter_active")}
                </FilterTab>
                <FilterTab active={filter === "shelved"} onClick={() => setFilter("shelved")}>
                  {t("project_switcher.filter_shelved")}
                  {shelvedCount > 0 && <span className="ml-1 opacity-70">{shelvedCount}</span>}
                </FilterTab>
              </div>
            </div>
          </div>

          {/* Scrollable project list */}
          <div className="overflow-y-auto flex-1 min-h-0 px-1 [scrollbar-width:thin] [scrollbar-color:var(--line-strong)_transparent]">
            {!isLoading && visibleProjects.length === 0 ? (
              <div className="px-[10px] pt-2 pb-[10px] text-xs text-txt-3 italic">
                {filter === "shelved"
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

          <div className="flex flex-wrap border-t border-line bg-bg-2 gap-[2px] p-[6px] [&>*]:basis-[calc(50%-1px)]">
            <button
              type="button"
              role="menuitem"
              className="flex items-center gap-2 text-txt-2 py-[7px] px-[10px] rounded-[6px] text-[12.5px] hover:bg-bg-3 hover:text-txt transition-[background,color] duration-[100ms]"
              onClick={openBootstrap}
            >
              <Icon name="plus" size={13} /> {t("project_switcher.new_project")}
            </button>
            {onPickManage ? (
              <button
                type="button"
                role="menuitem"
                className="flex items-center gap-2 text-txt-2 py-[7px] px-[10px] rounded-[6px] text-[12.5px] hover:bg-bg-3 hover:text-txt transition-[background,color] duration-[100ms]"
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

function Separator() {
  return <div className="h-px bg-[var(--line)] my-1" />;
}

function FilterTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "px-[9px] h-[20px] rounded-[4px] text-[11px] font-medium transition-[background,color] duration-[100ms] inline-flex items-center",
        active ? "bg-acc text-[var(--acc-ink)]" : "text-txt-3 hover:text-txt hover:bg-bg-3",
      )}
    >
      {children}
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
        "flex items-center relative cursor-pointer w-full text-left bg-transparent border-none text-txt gap-[10px] px-[10px] py-2 rounded-[var(--r-sm)] transition-[background] duration-[100ms] hover:bg-bg-3",
        highlighted && "bg-bg-3",
        selected &&
          "bg-acc-faint before:content-[''] before:absolute before:left-0 before:top-[6px] before:bottom-[6px] before:w-[3px] before:bg-[var(--acc)] before:rounded-[0_2px_2px_0]",
      )}
    >
      {projectId ? (
        <PlanetCanvas
          projectId={projectId}
          config={planetConfig}
          size={32}
          className="rounded-full shrink-0"
        />
      ) : (
        <span className="flex items-center justify-center shrink-0 text-white font-bold w-[32px] h-[32px] rounded-[8px] text-[12px] border border-[rgba(255,255,255,0.08)] bg-bg-3">
          <Icon name="folder" size={13} className="text-txt-3" />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <div
          className={`text-[13px] font-${projectId ? "semibold" : "medium"}${italic ? " italic" : ""} overflow-hidden text-ellipsis whitespace-nowrap flex items-center gap-1.5`}
        >
          {primary}
          {selected && <Icon name="check" size={11} className="text-acc shrink-0" />}
          {tagLabel ? (
            <span className="text-[9.5px] uppercase tracking-[0.06em] text-txt-3 border border-line rounded-[3px] px-[5px] py-[1px] leading-[1.4] ml-auto shrink-0">
              {tagLabel}
            </span>
          ) : null}
        </div>
        {secondary && (
          <div className="font-mono text-[10.5px] text-txt-3 overflow-hidden text-ellipsis whitespace-nowrap">
            {secondary}
          </div>
        )}
      </span>
      {healthDot && (
        <span
          className={cn(
            "w-1.5 h-1.5 rounded-full shrink-0",
            onToggleShelve && "group-hover/row:opacity-0 transition-opacity duration-[100ms]",
          )}
          style={{
            background: healthDot === "working" ? "var(--working)" : "var(--error)",
            boxShadow: healthDot === "working" ? "0 0 5px var(--working)" : "none",
          }}
        />
      )}
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
        className="absolute right-[8px] top-1/2 -translate-y-1/2 w-[24px] h-[24px] inline-flex items-center justify-center rounded-[6px] text-txt-3 opacity-0 group-hover/row:opacity-100 hover:bg-bg-4 hover:text-txt transition-[opacity,background,color] duration-[120ms] z-[2]"
      >
        <Icon name={shelved ? "undo" : "archive"} size={13} />
      </button>
    )}
    </div>
  );
}
