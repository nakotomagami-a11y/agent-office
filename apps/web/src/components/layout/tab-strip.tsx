"use client";

import { Reorder } from "framer-motion";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { PlanetConfig, ProjectSummary, Tab } from "@agent-office/domain/types";
import { PAGE_ROUTES } from "@agent-office/domain/config/routes";
import { Icon } from "@/components/ui/icon";
import { PlanetCanvas } from "@/components/ui/planet-canvas";
import { Portal } from "@/components/ui/portal";
import { cn } from "@/lib/cn";
import { useProjects } from "@/modules/projects/hooks/use-projects";
import { useTabsStore } from "@/lib/tabs-store";
import { ProjectPickerDropdown } from "./project-picker-dropdown";

/**
 * The tab strip — Chrome-style row that sits directly below the titlebar.
 *
 * Layout: [+] [ tab ] [ tab ] [ tab ] … (flex spacer)
 *
 * The `+` button reuses `ProjectPickerDropdown` in "picker mode" — clicking a
 * project row calls `openTab(projectId)`, which either focuses the existing
 * tab for that project or creates a new one. Clicking "All projects" or
 * "Manage" behaves like the legacy switcher (navigates to the projects list).
 *
 * Each tab renders:
 *   - A `PlanetCanvas` icon (same as the picker — Phase 5 will swap this for
 *     a static snapshot to save GPU when many tabs are visible).
 *   - The project name, truncated with ellipsis when the strip is tight.
 *   - A close X that appears on hover / focus. Middle-click also closes.
 *   - A right-click context menu with "Close", "Close others", "Close to the
 *     right", "Reopen closed tab".
 *   - Drag-to-reorder via `framer-motion`'s `<Reorder>` primitive.
 *
 * Rendered as a fixed overlay at `top:38px h:36px`. z-[300] matches the
 * titlebar so both stay ABOVE every portal-rendered modal (modals live at
 * z-100..z-210) — clicking a tab while a modal is open switches project
 * without dismissing the modal. This mirrors Chrome/VS Code UX: chrome is
 * always accessible. GnomeWindow reserves the 36px spacer underneath.
 *
 * The `+` picker dropdown itself portals into `document.body` at z-[400]
 * so it stacks above both chrome AND modals.
 */

const TAB_STRIP_H = 36;

type ContextMenuState = {
  tabId: string;
  x: number;
  y: number;
} | null;

export function TabStrip() {
  const t = useTranslations();
  const router = useRouter();
  const tabs = useTabsStore((s) => s.tabs);
  const activeTabId = useTabsStore((s) => s.activeTabId);
  const closedStackLen = useTabsStore((s) => s.closedStack.length);
  const openTab = useTabsStore((s) => s.openTab);
  const closeTab = useTabsStore((s) => s.closeTab);
  const setActiveTab = useTabsStore((s) => s.setActiveTab);
  const reorderTabs = useTabsStore((s) => s.reorderTabs);
  const restoreLastClosed = useTabsStore((s) => s.restoreLastClosed);

  const { data } = useProjects();
  const projectsById = useMemo(() => {
    const m = new Map<string, ProjectSummary>();
    for (const p of data ?? []) m.set(p.id, p);
    return m;
  }, [data]);

  const openProjectIds = useMemo(
    () => new Set(tabs.map((tab) => tab.projectId)),
    [tabs],
  );

  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerAnchor, setPickerAnchor] = useState<{ top: number; left: number } | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);
  const plusRef = useRef<HTMLButtonElement>(null);

  // Measure the `+` button on open so the portalled dropdown can position
  // itself in viewport coords. Recomputed on window resize so a shrunk window
  // doesn't leave the menu anchored to a stale x.
  useEffect(() => {
    if (!pickerOpen) return;
    const measure = () => {
      const rect = plusRef.current?.getBoundingClientRect();
      if (rect) setPickerAnchor({ top: rect.bottom + 4, left: rect.left });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [pickerOpen]);

  const handlePickProject = useCallback(
    (projectId: string) => {
      const tabId = openTab(projectId);
      const targetPath =
        useTabsStore.getState().tabs.find((tab) => tab.id === tabId)?.currentPath ??
        PAGE_ROUTES.project(projectId);
      router.push(targetPath);
    },
    [openTab, router],
  );

  const handlePickAll = useCallback(() => {
    router.push(PAGE_ROUTES.projects);
  }, [router]);

  const handleActivate = useCallback(
    (tab: Tab) => {
      setActiveTab(tab.id);
      router.push(tab.currentPath);
    },
    [router, setActiveTab],
  );

  const handleClose = useCallback(
    (tab: Tab) => {
      closeTab(tab.id);
      const nextActiveId = useTabsStore.getState().activeTabId;
      const nextTab = nextActiveId
        ? useTabsStore.getState().tabs.find((t2) => t2.id === nextActiveId)
        : null;
      if (nextTab) router.push(nextTab.currentPath);
      else if (tab.id === activeTabId) router.push(PAGE_ROUTES.projects);
    },
    [closeTab, router, activeTabId],
  );

  const handleReorder = useCallback(
    (nextTabs: Tab[]) => {
      reorderTabs(nextTabs.map((tab) => tab.id));
    },
    [reorderTabs],
  );

  // Right-click actions.
  const handleCloseOthers = useCallback(
    (keepId: string) => {
      const others = useTabsStore.getState().tabs.filter((t2) => t2.id !== keepId);
      for (const o of others) closeTab(o.id);
      const keep = useTabsStore.getState().tabs.find((t2) => t2.id === keepId);
      if (keep) {
        setActiveTab(keep.id);
        router.push(keep.currentPath);
      }
    },
    [closeTab, router, setActiveTab],
  );

  const handleCloseRight = useCallback(
    (fromId: string) => {
      const list = useTabsStore.getState().tabs;
      const idx = list.findIndex((t2) => t2.id === fromId);
      if (idx === -1) return;
      const toClose = list.slice(idx + 1);
      for (const t2 of toClose) closeTab(t2.id);
    },
    [closeTab],
  );

  const handleRestoreClosed = useCallback(() => {
    const restored = restoreLastClosed();
    if (restored) router.push(restored.currentPath);
  }, [restoreLastClosed, router]);

  // Close the context menu on any outside click / Escape.
  useEffect(() => {
    if (!contextMenu) return;
    const onMouse = () => setContextMenu(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setContextMenu(null);
    };
    // Delay adding mousedown so the click that OPENED the menu doesn't close it.
    const t = window.setTimeout(() => {
      document.addEventListener("mousedown", onMouse);
    }, 0);
    document.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("mousedown", onMouse);
      document.removeEventListener("keydown", onKey);
    };
  }, [contextMenu]);

  return (
    <>
      <div
        className="fixed left-0 right-0 z-[300] flex items-center bg-bg-1 border-b border-line"
        style={{ top: 38, height: TAB_STRIP_H, gap: 2, paddingLeft: 8, paddingRight: 8 }}
        data-tauri-drag-region
      >
        <button
          ref={plusRef}
          type="button"
          className="shrink-0 relative inline-flex items-center justify-center rounded-[6px] text-txt-2 hover:bg-bg-3 hover:text-txt transition-[background,color] duration-[120ms] cursor-pointer"
          style={{ width: 26, height: 26, marginRight: 6, zIndex: 2 }}
          aria-label={t("tabs.open_project_title")}
          aria-haspopup="menu"
          aria-expanded={pickerOpen}
          title={t("tabs.open_project_title")}
          onClick={() => setPickerOpen((v) => !v)}
          data-tauri-drag-region="false"
        >
          <Icon name="plus" size={14} />
        </button>

        {tabs.length === 0 ? (
          <span
            className="self-center text-[12px] text-txt-3 italic px-2 select-none"
            data-tauri-drag-region="false"
          >
            {t("tabs.empty_hint")}
          </span>
        ) : (
          <Reorder.Group
            axis="x"
            values={tabs}
            onReorder={handleReorder}
            as="div"
            className="flex-1 min-w-0 flex items-stretch gap-[2px] overflow-x-auto overflow-y-hidden [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
            data-tauri-drag-region="false"
          >
            {tabs.map((tab) => (
              <Reorder.Item
                key={tab.id}
                value={tab}
                as="div"
                dragElastic={0.05}
                dragTransition={{ bounceStiffness: 400, bounceDamping: 30 }}
                className="shrink-0"
              >
                <TabButton
                  tab={tab}
                  isActive={tab.id === activeTabId}
                  projectName={projectsById.get(tab.projectId)?.name ?? tab.projectId}
                  projectPlanet={projectsById.get(tab.projectId)?.planet}
                  onActivate={() => handleActivate(tab)}
                  onClose={() => handleClose(tab)}
                  closeLabel={t("tabs.close_tab_label")}
                  onContextMenu={(x, y) => setContextMenu({ tabId: tab.id, x, y })}
                />
              </Reorder.Item>
            ))}
          </Reorder.Group>
        )}
      </div>

      {pickerOpen && pickerAnchor ? (
        <Portal>
          <div
            className="fixed z-[400]"
            style={{ top: pickerAnchor.top, left: pickerAnchor.left }}
          >
            <ProjectPickerDropdown
              open={pickerOpen}
              triggerRef={plusRef}
              onClose={() => setPickerOpen(false)}
              onPickProject={handlePickProject}
              onPickAll={handlePickAll}
              selectedProjectId={
                activeTabId ? (tabs.find((t2) => t2.id === activeTabId)?.projectId ?? null) : null
              }
              openTabProjectIds={openProjectIds}
            />
          </div>
        </Portal>
      ) : null}

      {contextMenu ? (
        <TabContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          canRestore={closedStackLen > 0}
          onClose={() => {
            const tab = tabs.find((t2) => t2.id === contextMenu.tabId);
            if (tab) handleClose(tab);
            setContextMenu(null);
          }}
          onCloseOthers={() => {
            handleCloseOthers(contextMenu.tabId);
            setContextMenu(null);
          }}
          onCloseRight={() => {
            handleCloseRight(contextMenu.tabId);
            setContextMenu(null);
          }}
          onRestore={() => {
            handleRestoreClosed();
            setContextMenu(null);
          }}
          onDismiss={() => setContextMenu(null)}
          labels={{
            close: t("tabs.ctx_close"),
            closeOthers: t("tabs.ctx_close_others"),
            closeRight: t("tabs.ctx_close_right"),
            restore: t("tabs.ctx_restore_closed"),
          }}
        />
      ) : null}
    </>
  );
}

type TabButtonProps = {
  tab: Tab;
  isActive: boolean;
  projectName: string;
  projectPlanet: PlanetConfig | undefined;
  onActivate: () => void;
  onClose: () => void;
  onContextMenu: (x: number, y: number) => void;
  closeLabel: string;
};

function TabButton({
  tab,
  isActive,
  projectName,
  projectPlanet,
  onActivate,
  onClose,
  onContextMenu,
  closeLabel,
}: TabButtonProps) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      className={cn(
        "group relative flex items-center gap-[8px] pl-[8px] pr-[6px] max-w-[220px] min-w-[120px] h-[28px] my-[4px] rounded-[6px] cursor-pointer select-none text-[12.5px]",
        "transition-[background,color] duration-[120ms]",
        isActive
          ? "bg-bg-elev text-txt border border-line-2 shadow-[var(--shadow-1)]"
          : "text-txt-2 hover:bg-bg-2 hover:text-txt border border-transparent",
      )}
      role="tab"
      aria-selected={isActive}
      aria-label={projectName}
      title={projectName}
      tabIndex={0}
      onClick={onActivate}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onActivate();
        }
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onAuxClick={(e) => {
        if (e.button === 1) {
          e.preventDefault();
          onClose();
        }
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        onContextMenu(e.clientX, e.clientY);
      }}
    >
      <PlanetCanvas
        projectId={tab.projectId}
        config={projectPlanet}
        size={18}
        className="rounded-full shrink-0 pointer-events-none"
      />
      <span className="flex-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap pointer-events-none">
        {projectName}
      </span>
      <button
        type="button"
        aria-label={closeLabel}
        title={closeLabel}
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        onPointerDown={(e) => e.stopPropagation()}
        className={cn(
          "shrink-0 inline-flex items-center justify-center w-[16px] h-[16px] rounded-[4px] text-txt-3 hover:bg-bg-3 hover:text-txt transition-[background,color,opacity] duration-[100ms]",
          isActive || hovered ? "opacity-100" : "opacity-0",
        )}
      >
        <Icon name="x" size={10} />
      </button>
    </div>
  );
}

type TabContextMenuProps = {
  x: number;
  y: number;
  canRestore: boolean;
  onClose: () => void;
  onCloseOthers: () => void;
  onCloseRight: () => void;
  onRestore: () => void;
  onDismiss: () => void;
  labels: {
    close: string;
    closeOthers: string;
    closeRight: string;
    restore: string;
  };
};

function TabContextMenu({
  x,
  y,
  canRestore,
  onClose,
  onCloseOthers,
  onCloseRight,
  onRestore,
  labels,
}: TabContextMenuProps) {
  // Clamp inside viewport — best-effort, assumes 220x140 menu.
  const style: React.CSSProperties = {
    left: Math.min(x, (typeof window !== "undefined" ? window.innerWidth : 1200) - 220),
    top: Math.min(y, (typeof window !== "undefined" ? window.innerHeight : 800) - 140),
  };
  return (
    <div
      role="menu"
      className="fixed z-[80] flex flex-col min-w-[200px] py-1 bg-bg-elev border border-line-2 rounded-[var(--r-md)] shadow-[var(--shadow-3)]"
      style={style}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <MenuItem onClick={onClose} label={labels.close} />
      <MenuItem onClick={onCloseOthers} label={labels.closeOthers} />
      <MenuItem onClick={onCloseRight} label={labels.closeRight} />
      <div className="h-px bg-line my-1" />
      <MenuItem onClick={onRestore} label={labels.restore} disabled={!canRestore} />
    </div>
  );
}

function MenuItem({
  onClick,
  label,
  disabled,
}: {
  onClick: () => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      className={cn(
        "text-left px-3 py-[6px] text-[12.5px] text-txt cursor-pointer",
        "hover:bg-bg-3 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent",
        "transition-[background] duration-[80ms]",
      )}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

export const TAB_STRIP_HEIGHT = TAB_STRIP_H;
