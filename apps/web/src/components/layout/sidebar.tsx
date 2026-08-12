"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import { NavItem } from "./nav-item";
import { AgentAvatar } from "@/components/ui/agent-avatar";
import { UserAvatar } from "@/components/ui/user-avatar";
import { PAGE_ROUTES } from "@agent-office/domain/config/routes";
import { isActiveRoute } from "./sidebar-routing";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { ModalShell } from "@/components/ui/modal-shell";
import { cn } from "@/lib/cn";
import { useOfficeAgents } from "@/modules/office/hooks/use-office-agents";
import { useOfficeStore } from "@/modules/office/hooks/use-office-store";
import { useActiveProjectStore } from "@/lib/active-project-store";
import { useProcessesStore } from "@/lib/processes-store";
import { usePaletteStore } from "@/lib/palette-store";
import {
  useProject,
  useRemoveInstance,
  useUpdateInstance,
} from "@/modules/projects/hooks/use-projects";
import { useProjectSpend } from "@/modules/projects/hooks/use-project-spend";
import { useFilter } from "@/hooks/use-filter";
import { useSettings } from "@/modules/settings/hooks/use-settings";
import {
  AGENT_DRAG_MIME,
  useOfficeDragStore,
  type DragRef,
} from "@/modules/office/hooks/use-office-drag";
import { RosterGroup } from "./roster-group";
import { useRosterDisplay, type RosterRow } from "@/modules/office/hooks/use-roster-display";
import { useSpawnInstance } from "@/modules/office/hooks/use-spawn-instance";

export function Sidebar() {
  const t = useTranslations();
  const pathname = usePathname();
  const { agents, runs, workingCount, spendToday } = useOfficeAgents();
  const selectedId = useOfficeStore((s) => s.selectedId);
  const selectedInstanceId = useOfficeStore((s) => s.selectedInstanceId);
  const select = useOfficeStore((s) => s.select);
  const expandedGroups = useOfficeStore((s) => s.expandedGroups);
  const toggleGroup = useOfficeStore((s) => s.toggleGroup);
  const setGroupExpanded = useOfficeStore((s) => s.setGroupExpanded);
  const pinnedGroups = useOfficeStore((s) => s.pinnedGroups);
  const togglePin = useOfficeStore((s) => s.togglePin);
  const navHeight = useOfficeStore((s) => s.navHeight);
  const setNavHeight = useOfficeStore((s) => s.setNavHeight);

  const activeProjectId = useActiveProjectStore((s) => s.id);
  const projectQ = useProject(activeProjectId);
  const project = projectQ.data;
  const removeMut = useRemoveInstance();
  const updateMut = useUpdateInstance();

  const settingsQ = useSettings();
  const isMultiInstance = settingsQ.data?.features?.multiInstance === true;

  // Per-instance spend — fetched once at sidebar level, passed down to rows
  const spendQ = useProjectSpend(isMultiInstance ? activeProjectId : null);
  const spendByInstance = spendQ.data?.byInstance ?? {};

  // Track which instance is currently being renamed
  const [renamingInstanceId, setRenamingInstanceId] = useState<string | null>(null);

  // Pending removal — drives the confirm modal. `null` = no dialog open.
  // Set by both the row-level X button (`onRemove`) and the caret-menu
  // action (`onRemoveById`) so a single modal serves both entry points.
  const [pendingRemove, setPendingRemove] = useState<{
    instanceId: string;
    displayName: string;
  } | null>(null);

  // When a project is active, the roster lists *instances* (one row per
  // entry in `project.meta.roster`). Two `frontend-craftsman` instances
  // become two separate rows. When no project is active, fall back to a
  // flat agent-definition list.
  const { rosterRows, rosterGroups } = useRosterDisplay({
    agents,
    runs,
    project,
    expandedGroups,
    activeProjectId,
  });

  // Auto-expand a group when its instance becomes selected
  useEffect(() => {
    if (!activeProjectId || !selectedInstanceId || !isMultiInstance) return;
    const group = rosterGroups.find((g) =>
      g.instances.some((i) => i.instanceId === selectedInstanceId),
    );
    if (group && group.instances.length > 1) {
      setGroupExpanded(activeProjectId, group.agentId, true);
    }
  }, [selectedInstanceId, rosterGroups, activeProjectId, isMultiInstance, setGroupExpanded]);

  const [filterFocused, setFilterFocused] = useState(false);
  const { query: filter, setQuery: setFilter, filtered } = useFilter(
    rosterRows,
    (r, q) => {
      const lq = q.toLowerCase();
      if (r.displayName.toLowerCase().includes(lq)) return true;
      if (r.agent.short.toLowerCase().includes(lq)) return true;
      if (r.agent.skills?.some((s) => s.toLowerCase().includes(lq)) ?? false) return true;
      if (r.agent.task?.toLowerCase().includes(lq) ?? false) return true;
      return false;
    },
  );

  const pinnedIds = useMemo(
    () => pinnedGroups[activeProjectId ?? ""] ?? [],
    [pinnedGroups, activeProjectId],
  );

  const visibleGroups = useMemo(
    () =>
      (filter
        ? rosterGroups.filter((g) =>
            g.agent.name.toLowerCase().includes(filter.toLowerCase())
          )
        : rosterGroups
      )
        .slice()
        .sort((a, b) => (pinnedIds.includes(b.agentId) ? 1 : 0) - (pinnedIds.includes(a.agentId) ? 1 : 0)),
    [rosterGroups, filter, pinnedIds],
  );

  const onRemove = useCallback((row: RosterRow) => {
    if (!activeProjectId || !row.instance) return;
    setPendingRemove({
      instanceId: row.instance.instanceId,
      displayName: row.displayName,
    });
  }, [activeProjectId]);

  const onRemoveById = useCallback((instanceId: string) => {
    if (!activeProjectId || !project) return;
    const row = rosterRows.find((r) => r.instance?.instanceId === instanceId);
    if (!row) return;
    setPendingRemove({ instanceId, displayName: row.displayName });
  }, [activeProjectId, project, rosterRows]);

  const confirmRemove = useCallback(() => {
    if (!activeProjectId || !pendingRemove) return;
    removeMut.mutate({ projectId: activeProjectId, instanceId: pendingRemove.instanceId });
    setPendingRemove(null);
  }, [activeProjectId, pendingRemove, removeMut]);

  const { spawnInstance: onSpawn } = useSpawnInstance({ activeProjectId });

  const onRenameStart = useCallback((instanceId: string) => {
    setRenamingInstanceId(instanceId);
  }, []);

  const onRenameCommit = useCallback((instanceId: string, label: string) => {
    if (!activeProjectId) return;
    setRenamingInstanceId(null);
    if (!label) return; // empty → keep current label
    updateMut.mutate({ projectId: activeProjectId, instanceId, patch: { label } });
  }, [activeProjectId, updateMut]);

  const onRenameCancel = useCallback(() => {
    setRenamingInstanceId(null);
  }, []);

  // Draggable divider between the links (nav) block and the roster block. The
  // nav is pinned to `navHeight`; the roster block flexes to fill the rest.
  const asideRef = useRef<HTMLElement>(null);
  const [draggingSplit, setDraggingSplit] = useState(false);

  useEffect(() => {
    if (!draggingSplit) return;
    const prevCursor = document.body.style.cursor;
    const prevSelect = document.body.style.userSelect;
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
    const onMove = (e: PointerEvent) => {
      const rect = asideRef.current?.getBoundingClientRect();
      if (!rect) return;
      // Leave room for the roster header + a few rows + the footer.
      const max = Math.max(96, rect.height - 220);
      setNavHeight(Math.round(Math.min(max, Math.max(96, e.clientY - rect.top))));
    };
    const onUp = () => setDraggingSplit(false);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      document.body.style.cursor = prevCursor;
      document.body.style.userSelect = prevSelect;
    };
  }, [draggingSplit, setNavHeight]);

  return (
    <aside
      ref={asideRef}
      className="bg-bg-2 border-r border-line flex flex-col min-h-0 h-full overflow-hidden max-[1024px]:overflow-hidden max-[600px]:hidden"
      aria-label={t("app.name")}
    >
      <nav
        className="p-[6px] flex flex-col gap-[2px] overflow-y-auto"
        style={
          navHeight != null
            ? { flexBasis: navHeight, flexGrow: 0, flexShrink: 1, minHeight: 96 }
            : { flexShrink: 0, minHeight: 96 }
        }
        aria-label={t("nav.primary_label")}
      >
        <NavItem
          href={PAGE_ROUTES.office}
          icon="home"
          label={t("nav.office")}
          badge={workingCount > 0 ? t("nav.live_badge", { count: workingCount }) : undefined}
          active={isActiveRoute(pathname, PAGE_ROUTES.office, { exact: true })}
        />
        <NavItem
          href={activeProjectId ? PAGE_ROUTES.project(activeProjectId) : PAGE_ROUTES.projects}
          icon="settings"
          label={t("nav.project")}
          active={isActiveRoute(pathname, PAGE_ROUTES.projects)}
        />
        <NavItem
          href={
            activeProjectId
              ? `${PAGE_ROUTES.activity}?project=${encodeURIComponent(activeProjectId)}`
              : PAGE_ROUTES.activity
          }
          icon="activity"
          label={t("nav.activity")}
          active={isActiveRoute(pathname, PAGE_ROUTES.activity)}
        />
        <NavItem
          href={PAGE_ROUTES.agents}
          icon="templates"
          label={t("nav.agents")}
          active={isActiveRoute(pathname, PAGE_ROUTES.agents)}
        />
        <NavItem
          href={PAGE_ROUTES.memory}
          icon="memory"
          label={t("nav.memory")}
          active={isActiveRoute(pathname, PAGE_ROUTES.memory)}
        />
        <NavItem
          href={PAGE_ROUTES.skills}
          icon="sparkle"
          label="Skills"
          active={isActiveRoute(pathname, PAGE_ROUTES.skills)}
        />
        <NavItem
          href={PAGE_ROUTES.analytics}
          icon="activity"
          label="Analytics"
          badge={`$${spendToday.toFixed(2)}`}
          active={isActiveRoute(pathname, PAGE_ROUTES.analytics)}
        />
        <NavItem
          href={PAGE_ROUTES.schedules}
          icon="list"
          label="Schedules"
          active={isActiveRoute(pathname, PAGE_ROUTES.schedules)}
        />
        <ProcessesNavButton />
        <CommandPaletteNavButton />
      </nav>

      {/* Draggable divider. Geometry + cursor are inline styles on purpose: the
          dev JIT sometimes drops arbitrary utilities mid-session (see MainShell),
          and a 0-height handle silently kills the drag. */}
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label={t("sidebar.resize_blocks_aria")}
        onPointerDown={(e) => { e.preventDefault(); setDraggingSplit(true); }}
        onDoubleClick={() => setNavHeight(null)}
        title={t("sidebar.resize_blocks_title")}
        className="group/split relative shrink-0"
        style={{ height: 11, cursor: "row-resize", touchAction: "none", zIndex: 10 }}
      >
        <div
          className={cn("transition-colors", draggingSplit ? "bg-acc" : "bg-line group-hover/split:bg-acc")}
          style={{ position: "absolute", left: 0, right: 0, top: 5, height: 1 }}
        />
      </div>

      <div className="flex flex-col min-h-0 flex-1">
        {/* Roster header */}
        <div className="flex items-center gap-[6px] px-[10px] py-[8px] border-b border-line shrink-0">
          <span className="text-[11.5px] font-semibold text-txt tracking-[0.01em] flex-1">Roster</span>
          <span className="font-[var(--font-mono)] text-[10px] bg-bg-3 border border-line text-txt-3 rounded-full px-[7px] py-[1px]">
            {project ? visibleGroups.length : filtered.length}
          </span>
          <button
            type="button"
            onClick={() => { setFilterFocused((v) => !v); if (filterFocused) setFilter(""); }}
            className={cn(
              "w-[24px] h-[24px] flex items-center justify-center rounded-[5px] transition-[background,color] duration-[120ms]",
              filterFocused || filter ? "bg-bg-3 text-acc" : "text-txt-3 hover:bg-bg-3 hover:text-txt",
            )}
            aria-label={t("sidebar.filter_aria")}
          >
            <Icon name="search" size={12} />
          </button>
        </div>

        {/* Expandable search input */}
        {(filterFocused || filter) && (
          <div className="px-[8px] py-[6px] border-b border-line shrink-0">
            <div className="flex items-center gap-[6px] bg-bg-1 border border-line rounded-[7px] px-[8px] focus-within:border-line-2">
              <Icon name="search" size={11} className="text-txt-4 shrink-0" />
              <input
                // Intentional autoFocus — user opened the filter popover
                // explicitly so we take the cursor.
                autoFocus
                type="text"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                onBlur={() => { if (!filter) setFilterFocused(false); }}
                onKeyDown={(e) => { if (e.key === "Escape") { setFilter(""); setFilterFocused(false); } }}
                placeholder={t("common.search_placeholder")}
                aria-label={t("sidebar.filter_aria")}
                className="flex-1 bg-transparent border-0 outline-none text-txt text-[12px] py-[6px] font-[var(--font-mono)] placeholder:text-txt-4"
              />
              {filter && (
                <button
                  type="button"
                  onClick={() => setFilter("")}
                  className="w-[16px] h-[16px] flex items-center justify-center text-txt-4 hover:text-txt shrink-0"
                >
                  <Icon name="x" size={10} />
                </button>
              )}
            </div>
          </div>
        )}

        <div className="overflow-y-auto flex flex-col gap-[2px] min-h-0 pb-2 px-[6px] flex-1">
          {project && rosterRows.length === 0 ? (
            <div className="text-txt-3 px-[14px] py-3 text-[12px] leading-[1.4]">
              {t("sidebar.no_agents_in_project", { project: project.meta.name })}
            </div>
          ) : !project && rosterRows.length === 0 ? (
            <div className="text-txt-3 px-[14px] py-3 text-[12px] leading-[1.4]">
              {t("sidebar.no_agent_definitions")}
            </div>
          ) : project ? (
            // Project active: always render grouped rows (multi-instance or not)
            <>
              {(visibleGroups as typeof rosterGroups).map((group) => (
                <RosterGroup
                  key={group.agentId}
                  group={group}
                  projectId={activeProjectId ?? ""}
                  selectedInstanceId={selectedInstanceId}
                  renamingInstanceId={renamingInstanceId}
                  onSelect={(instanceId) =>
                    select(group.agent.id, { instanceId })
                  }
                  onSpawn={onSpawn}
                  onRemove={onRemoveById}
                  onToggle={() =>
                    activeProjectId && toggleGroup(activeProjectId, group.agentId)
                  }
                  onRenameStart={onRenameStart}
                  onRenameCommit={onRenameCommit}
                  onRenameCancel={onRenameCancel}
                  spendByInstance={spendByInstance}
                  pinned={pinnedIds.includes(group.agentId)}
                  onTogglePin={() => activeProjectId && togglePin(activeProjectId, group.agentId)}
                />
              ))}
              {visibleGroups.length === 0 && (
                <div className="text-txt-3 px-[14px] py-2 text-[11px]">
                  {t("common.no_matches", { query: filter })}
                </div>
              )}
            </>
          ) : (
            // Legacy single-instance mode (or no project): flat rows
            <>
              {filtered.map((row) => {
                const isSelected =
                  selectedId === row.agent.id &&
                  (row.instance ? selectedInstanceId === row.instance.instanceId : selectedInstanceId === null);
                return (
                  <RosterEntry
                    key={row.key}
                    row={row}
                    selected={isSelected}
                    canRemove={!!row.instance}
                    onSelect={() =>
                      select(row.agent.id, {
                        instanceId: row.instance?.instanceId ?? null,
                      })
                    }
                    onRemove={() => onRemove(row)}
                  />
                );
              })}
              {filtered.length === 0 && rosterRows.length > 0 ? (
                <div className="text-txt-3 px-[14px] py-2 text-[11px]">
                  {t("common.no_matches", { query: filter })}
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>

      <SidebarFoot spendToday={spendToday} />
      <ModalShell
        open={pendingRemove !== null}
        onClose={() => setPendingRemove(null)}
        title={t("sidebar.remove_from_project_title")}
        size="sm"
        footer={
          <>
            <Button size="sm" variant="ghost" onClick={() => setPendingRemove(null)}>
              {t("common.cancel")}
            </Button>
            <Button size="sm" variant="primary" onClick={confirmRemove}>
              {t("common.remove")}
            </Button>
          </>
        }
      >
        {pendingRemove && (
          <p className="m-0 text-[13px] text-txt-2 leading-[1.55]">
            {t("sidebar.remove_confirm", {
              name: pendingRemove.displayName,
              project: project?.meta.name ?? "",
            })}
          </p>
        )}
      </ModalShell>
    </aside>
  );
}

function SidebarFoot({ spendToday }: { spendToday: number }) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  return (
    <div ref={containerRef} className="relative border-t border-line">
      {/* Dropdown menu — fixed so it escapes aside's overflow:hidden */}
      {open && (() => {
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return null;
        return (
          <>
            <div
              className="fixed inset-0 z-[49]"
              onClick={() => setOpen(false)}
            />
            <div
              className="fixed z-50 bg-bg-2 border border-line rounded-t-[8px] overflow-hidden shadow-[0_-8px_24px_rgba(0,0,0,0.3)]"
              style={{ bottom: window.innerHeight - rect.top + 1, left: rect.left, width: rect.width }}
            >
            <Link
              href={PAGE_ROUTES.settings}
              onClick={() => setOpen(false)}
              className="flex items-center gap-[10px] px-[12px] py-[9px] text-[13px] text-txt-2 hover:bg-bg-3 hover:text-txt transition-colors no-underline"
            >
              <Icon name="settings" size={14} className="text-txt-3 shrink-0" />
              <span>{t("nav.settings")}</span>
            </Link>
            <Link
              href={PAGE_ROUTES.docs}
              onClick={() => setOpen(false)}
              className="flex items-center gap-[10px] px-[12px] py-[9px] text-[13px] text-txt-2 hover:bg-bg-3 hover:text-txt transition-colors no-underline border-t border-line"
            >
              <Icon name="help-circle" size={14} className="text-txt-3 shrink-0" />
              <span>Documentation</span>
            </Link>
          </div>
        </>
        );
      })()}

      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full p-[8px] flex items-center gap-[10px] text-txt hover:bg-bg-3 transition-colors max-[1024px]:justify-center max-[1024px]:px-0 max-[1024px]:py-3"
        aria-label={t("common.open_settings")}
        aria-expanded={open}
      >
        <UserAvatar size={60} className="shrink-0" />
        <div className="min-w-0 flex flex-col gap-[2px] leading-none text-left max-[1024px]:hidden">
          <div className="text-[12px] font-medium leading-none">{t("sidebar.me_name")}</div>
          <div className="text-[10.5px] text-txt-3 font-[var(--font-mono)] leading-none">{t("sidebar.me_sub")}</div>
        </div>
        <div className="ml-auto flex items-center gap-[6px] max-[1024px]:hidden shrink-0">
          <span className="font-[var(--font-mono)] text-[11px] bg-bg-1 border border-line py-1 px-2 rounded-[999px] text-txt-2" aria-label={t("common.spend_today_aria", { amount: spendToday.toFixed(2) })}>
            ${spendToday.toFixed(2)}
          </span>
          <Icon name="chevron" size={12} className={cn("text-txt-4 transition-transform duration-150", open ? "" : "rotate-180")} />
        </div>
      </button>
    </div>
  );
}

function RosterEntry({
  row,
  selected,
  canRemove,
  onSelect,
  onRemove,
}: {
  row: RosterRow;
  selected: boolean;
  canRemove: boolean;
  onSelect: () => void;
  onRemove: () => void;
}) {
  const t = useTranslations();
  const { agent, instance, displayName } = row;
  const setDragging = useOfficeDragStore((s) => s.setDragging);

  const dragRef: DragRef = instance
    ? { agentId: agent.id, instanceId: instance.instanceId }
    : { agentId: agent.id };

  const onDragStart = (e: React.DragEvent<HTMLDivElement>) => {
    // Stash a JSON payload so onDrop can reconstruct the ref; also push
    // a plain-text fallback for browsers that ignore custom MIME types.
    e.dataTransfer.setData(AGENT_DRAG_MIME, JSON.stringify(dragRef));
    e.dataTransfer.setData("text/plain", agent.id);
    e.dataTransfer.effectAllowed = "move";
    setDragging(dragRef);
  };

  const onDragEnd = () => setDragging(null);

  const ledClass = cn(
    "absolute -bottom-[2px] -right-[2px] w-[8px] h-[8px] rounded-full border-[2px] border-bg-2",
    (agent.status === "working" || agent.status === "thinking") && "bg-[var(--working)] shadow-[0_0_5px_var(--working)]",
    (agent.status === "queued" || agent.status === "done") && "bg-[var(--queued)]",
    agent.status === "error" && "bg-[var(--error)]",
    !["working","thinking","queued","done","error"].includes(agent.status) && "bg-txt-4",
  );

  return (
    <div
      className={cn(
        "group relative cursor-grab flex items-center gap-[10px]",
        "rounded-[8px] hover:bg-bg-3 px-[6px] py-[6px]",
        selected ? "bg-acc-faint" : "",
      )}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onSelect(); }}
      title={t("sidebar.row_open_chat_title")}
    >
      {/* Avatar + LED badge */}
      <div className="relative shrink-0 w-[30px] h-[30px]">
        <AgentAvatar unit={agent.unitChoice} size={30} className="rounded-[8px] border border-line" />
        <span className={ledClass} />
      </div>

      {/* Name */}
      <span className="flex-1 min-w-0 text-[14px] font-semibold text-txt overflow-hidden text-ellipsis whitespace-nowrap">
        {displayName}
      </span>

      {/* Remove button on hover */}
      <div className="relative shrink-0 w-[20px] h-[20px]">
        {canRemove && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
            aria-label={t("sidebar.remove_from_project_aria", { name: displayName })}
            title={t("sidebar.remove_from_project_title")}
            className="absolute inset-0 bg-bg-1 border border-line rounded-full inline-flex items-center justify-center text-txt-3 cursor-pointer opacity-0 group-hover:opacity-100 hover:text-[var(--error)] hover:border-[var(--error)] transition-opacity duration-[120ms]"
          >
            <Icon name="x" size={10} />
          </button>
        )}
      </div>
    </div>
  );
}

function CommandPaletteNavButton() {
  const setOpen = usePaletteStore((s) => s.setOpen);
  const isMac =
    typeof navigator !== "undefined" && navigator.platform.includes("Mac");
  return (
    <button
      type="button"
      className="flex items-center gap-[10px] h-[34px] px-[10px] rounded-[var(--r-sm)] text-[13px] text-txt-3 cursor-pointer border-none bg-transparent font-[inherit] text-left no-underline hover:bg-bg-3 w-full"
      onClick={() => setOpen(true)}
      aria-label="Open command palette"
    >
      <Icon name="search" />
      <span className="flex-1 text-left">Command palette</span>
      <span className="bg-bg-2 border border-line text-txt-3 text-[10px] font-[var(--font-mono)] rounded px-[5px] py-[1px]">
        {isMac ? "⌘K" : "Ctrl+K"}
      </span>
    </button>
  );
}


function ProcessesNavButton() {
  const t = useTranslations();
  const setOpen = useProcessesStore((s) => s.setOpen);
  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="flex items-center gap-[10px] h-[34px] px-[10px] rounded-[var(--r-sm)] text-[13px] text-txt-2 cursor-pointer border-none bg-transparent font-[inherit] text-left no-underline hover:bg-bg-3 w-full"
      aria-label={t("processes.title")}
    >
      <Icon name="server" />
      <span>{t("nav.processes")}</span>
    </button>
  );
}
