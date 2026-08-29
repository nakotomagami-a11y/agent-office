"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { AgentAvatar } from "@/components/ui/agent-avatar";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { ModalShell } from "@/components/ui/modal-shell";
import { cn } from "@/lib/cn";
import { useOfficeAgents } from "@/modules/office/hooks/use-office-agents";
import { useOfficeStore } from "@/modules/office/hooks/use-office-store";
import { useActiveProjectStore } from "@/lib/active-project-store";
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
import { isTauri, closeWindow, minimizeWindow, toggleMaximizeWindow } from "@/lib/tauri-window";
import { RosterGroup } from "./roster-group";
import { useRosterDisplay, type RosterRow } from "@/modules/office/hooks/use-roster-display";
import { useSpawnInstance } from "@/modules/office/hooks/use-spawn-instance";
import { AddAgentModal } from "@/modules/projects/components/add-agent-modal";

/**
 * The roster sidebar is purely the roster — no primary page nav (that lives
 * in the account chip's dropdown menu, see `main-top-bar.tsx`), no
 * draggable nav/roster split, no footer account dropdown.
 *
 * Traffic-light window controls render at the top of the sidebar instead of
 * a separate chrome row.
 */
export function Sidebar() {
  const t = useTranslations();
  const { agents, runs, workingCount } = useOfficeAgents();
  const selectedId = useOfficeStore((s) => s.selectedId);
  const selectedInstanceId = useOfficeStore((s) => s.selectedInstanceId);
  const select = useOfficeStore((s) => s.select);
  const expandedGroups = useOfficeStore((s) => s.expandedGroups);
  const toggleGroup = useOfficeStore((s) => s.toggleGroup);
  const setGroupExpanded = useOfficeStore((s) => s.setGroupExpanded);
  const pinnedGroups = useOfficeStore((s) => s.pinnedGroups);
  const togglePin = useOfficeStore((s) => s.togglePin);

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
  const [addAgentOpen, setAddAgentOpen] = useState(false);

  // Pending removal — drives the confirm modal. `null` = no dialog open.
  const [pendingRemove, setPendingRemove] = useState<{
    instanceId: string;
    displayName: string;
  } | null>(null);

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

  // Pinned/rest split: a "Pinned" header only appears when something is
  // pinned, and the remaining section reads "All agents" in that case, or
  // plain "Agents" when nothing is pinned.
  const { pinnedList, restList } = useMemo(() => {
    const base = filter
      ? rosterGroups.filter((g) => g.agent.name.toLowerCase().includes(filter.toLowerCase()))
      : rosterGroups;
    return {
      pinnedList: base.filter((g) => pinnedIds.includes(g.agentId)),
      restList: base.filter((g) => !pinnedIds.includes(g.agentId)),
    };
  }, [rosterGroups, filter, pinnedIds]);

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

  const totalCount = project ? pinnedList.length + restList.length : filtered.length;
  const tauri = isTauri();

  return (
    <aside
      className="flex flex-col min-h-0 h-full overflow-hidden p-[14px] gap-[16px] max-[1024px]:overflow-hidden max-[600px]:hidden"
      aria-label={t("app.name")}
    >
      {tauri && (
        <div className="flex items-center gap-2 px-2 pt-[2px] shrink-0" data-tauri-drag-region>
          <TrafficDot kind="close" onClick={() => void closeWindow()} label={t("titlebar.win_close")} />
          <TrafficDot kind="min" onClick={() => void minimizeWindow()} label={t("titlebar.win_min")} />
          <TrafficDot kind="max" onClick={() => void toggleMaximizeWindow()} label={t("titlebar.win_max")} />
        </div>
      )}

      <div className="flex-1 min-h-0 flex flex-col gap-[3px]">
        {/* Below 1024px, main-shell.tsx collapses this sidebar's wrapper to a
            64px icon rail (`max-[1024px]:w-[64px]`). This label row has
            nothing useful to say at that width — hide it instead of letting
            `whitespace-nowrap` hard-clip "Roster" mid-word past the rail's
            edge (found during the Phase 10 responsive sweep). */}
        <div className="flex items-center gap-[9px] px-[8px] pb-[8px] max-[1024px]:hidden">
          <span className="text-[15px] font-extrabold tracking-[-0.02em] whitespace-nowrap">{t("sidebar.roster_title")}</span>
          <span className="font-[var(--font-mono)] text-[11px] text-txt-4 whitespace-nowrap">{totalCount}</span>
          <span className="flex-1" />
          {workingCount > 0 && (
            <span className="flex items-center gap-[5px] px-2 py-[2px] rounded-full bg-green-soft text-[10.5px] font-bold text-green whitespace-nowrap">
              <span className="w-[5px] h-[5px] rounded-full bg-green animate-pulse" />
              {t("nav.live_badge", { count: workingCount })}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 mx-[6px] mb-[8px] px-[11px] py-[8px] rounded-xl bg-card-2 border border-edge shadow-[var(--inset-hi)]">
          <Icon name="search" size={13} className="text-txt-4 shrink-0" />
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Escape") setFilter(""); }}
            placeholder={t("sidebar.filter_placeholder")}
            aria-label={t("sidebar.filter_aria")}
            className="flex-1 min-w-0 bg-transparent border-0 outline-none text-txt text-[11.5px] font-[inherit] placeholder:text-txt-4"
          />
          {filter && (
            <button type="button" onClick={() => setFilter("")} className="text-txt-4 hover:text-txt shrink-0" aria-label={t("common.clear")}>
              <Icon name="x" size={11} />
            </button>
          )}
        </div>

        <div className="overflow-y-auto flex flex-col gap-[1px] min-h-0 flex-1 p-[2px]">
          {project && rosterRows.length === 0 ? (
            <EmptyHint>{t("sidebar.no_agents_in_project", { project: project.meta.name })}</EmptyHint>
          ) : !project && rosterRows.length === 0 ? (
            <EmptyHint>{t("sidebar.no_agent_definitions")}</EmptyHint>
          ) : project ? (
            <>
              {pinnedList.length > 0 && (
                <>
                  <RosterHeader label={t("sidebar.header_pinned")} count={pinnedList.length} pinned />
                  {pinnedList.map((group) => (
                    <RosterGroup
                      key={group.agentId}
                      group={group}
                      projectId={activeProjectId ?? ""}
                      selectedInstanceId={selectedInstanceId}
                      renamingInstanceId={renamingInstanceId}
                      onSelect={(instanceId) => select(group.agent.id, { instanceId })}
                      onSpawn={onSpawn}
                      onRemove={onRemoveById}
                      onToggle={() => activeProjectId && toggleGroup(activeProjectId, group.agentId)}
                      onRenameStart={onRenameStart}
                      onRenameCommit={onRenameCommit}
                      onRenameCancel={onRenameCancel}
                      spendByInstance={spendByInstance}
                      pinned
                      onTogglePin={() => activeProjectId && togglePin(activeProjectId, group.agentId)}
                    />
                  ))}
                </>
              )}
              <RosterHeader
                label={pinnedList.length > 0 ? t("sidebar.header_all_agents") : t("sidebar.header_agents")}
                count={restList.length}
              />
              {restList.map((group) => (
                <RosterGroup
                  key={group.agentId}
                  group={group}
                  projectId={activeProjectId ?? ""}
                  selectedInstanceId={selectedInstanceId}
                  renamingInstanceId={renamingInstanceId}
                  onSelect={(instanceId) => select(group.agent.id, { instanceId })}
                  onSpawn={onSpawn}
                  onRemove={onRemoveById}
                  onToggle={() => activeProjectId && toggleGroup(activeProjectId, group.agentId)}
                  onRenameStart={onRenameStart}
                  onRenameCommit={onRenameCommit}
                  onRenameCancel={onRenameCancel}
                  spendByInstance={spendByInstance}
                  pinned={false}
                  onTogglePin={() => activeProjectId && togglePin(activeProjectId, group.agentId)}
                />
              ))}
              {pinnedList.length === 0 && restList.length === 0 && (
                <div className="text-txt-3 px-[14px] py-2 text-[11px]">{t("common.no_matches", { query: filter })}</div>
              )}
            </>
          ) : (
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
                      select(row.agent.id, { instanceId: row.instance?.instanceId ?? null })
                    }
                    onRemove={() => onRemove(row)}
                  />
                );
              })}
              {filtered.length === 0 && rosterRows.length > 0 ? (
                <div className="text-txt-3 px-[14px] py-2 text-[11px]">{t("common.no_matches", { query: filter })}</div>
              ) : null}
            </>
          )}
        </div>

        <button
          type="button"
          title={t("sidebar.add_agent_title")}
          disabled={!activeProjectId}
          onClick={() => setAddAgentOpen(true)}
          className="mt-[6px] flex items-center justify-center py-2 rounded-[10px] border border-dashed border-edge-2 bg-transparent text-txt-3 shrink-0 transition-colors duration-150 hover:text-txt hover:border-txt-4 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Icon name="plus" size={14} />
        </button>
      </div>

      <AddAgentModal open={addAgentOpen} projectId={activeProjectId} onClose={() => setAddAgentOpen(false)} />

      <ModalShell
        open={pendingRemove !== null}
        onClose={() => setPendingRemove(null)}
        onEnter={confirmRemove}
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

function EmptyHint({ children }: { children: React.ReactNode }) {
  return <div className="text-txt-3 px-[14px] py-3 text-[12px] leading-[1.4]">{children}</div>;
}

function RosterHeader({ label, count, pinned = false }: { label: string; count: number; pinned?: boolean }) {
  return (
    <div className="flex items-center gap-[7px] px-[7px] pt-[10px] pb-[6px] max-[1024px]:hidden">
      {pinned && <Icon name="pin" size={10} className="text-acc shrink-0" />}
      <span className={cn("text-[9.5px] font-bold tracking-[0.09em] uppercase whitespace-nowrap", pinned ? "text-acc" : "text-txt-4")}>
        {label}
      </span>
      <span className="flex-1 h-px bg-edge" />
      <span className="font-[var(--font-mono)] text-[9.5px] text-txt-4">{count}</span>
    </div>
  );
}

function TrafficDot({ kind, onClick, label }: { kind: "close" | "min" | "max"; onClick: () => void; label: string }) {
  const bg = { close: "bg-[#FF5F57]", min: "bg-[#FFBD2E]", max: "bg-[#28C840]" }[kind];
  return (
    <span
      role="button"
      tabIndex={0}
      aria-label={label}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onClick(); }}
      data-tauri-drag-region="false"
      className={cn(bg, "w-[12px] h-[12px] rounded-full cursor-pointer border border-[rgba(0,0,0,0.08)]")}
    />
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
    e.dataTransfer.setData(AGENT_DRAG_MIME, JSON.stringify(dragRef));
    e.dataTransfer.setData("text/plain", agent.id);
    e.dataTransfer.effectAllowed = "move";
    setDragging(dragRef);
  };

  const onDragEnd = () => setDragging(null);

  const ledClass = cn(
    "absolute -bottom-[2px] -right-[2px] w-[8px] h-[8px] rounded-full border-2 border-canvas",
    (agent.status === "working" || agent.status === "thinking") && "bg-green shadow-[0_0_5px_var(--green)]",
    (agent.status === "queued" || agent.status === "done") && "bg-amber",
    agent.status === "error" && "bg-red",
    !["working", "thinking", "queued", "done", "error"].includes(agent.status) && "bg-txt-4",
  );

  return (
    <div
      className={cn(
        "group relative cursor-grab flex items-center gap-[9px] rounded-[10px] px-[7px] py-[6px] transition-colors duration-150 hover:bg-card-3",
        selected && "bg-acc-faint",
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
      <div className="relative shrink-0 w-[30px] h-[30px] rounded-[9px] overflow-hidden">
        <AgentAvatar unit={agent.unitChoice} size={30} className="rounded-[9px] border border-edge" />
        <span className={ledClass} />
      </div>

      <span className="flex-1 min-w-0 text-[12.5px] font-semibold text-txt overflow-hidden text-ellipsis whitespace-nowrap">
        {displayName}
      </span>

      {canRemove && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          aria-label={t("sidebar.remove_from_project_aria", { name: displayName })}
          title={t("sidebar.remove_from_project_title")}
          className="shrink-0 w-[20px] h-[20px] flex items-center justify-center rounded-[6px] text-txt-4 opacity-0 group-hover:opacity-100 hover:bg-red-soft hover:text-red transition-[background,color,opacity] duration-150"
        >
          <Icon name="x" size={10} />
        </button>
      )}
    </div>
  );
}
