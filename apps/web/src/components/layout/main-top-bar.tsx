"use client";

import { Reorder } from "framer-motion";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { PlanetConfig, ProjectSummary, Tab } from "@agent-office/domain/types";
import { PAGE_ROUTES } from "@agent-office/domain/config/routes";
import { Icon, type IconName } from "@/components/ui/icon";
import { PlanetCanvas } from "@/components/ui/planet-canvas";
import { Portal } from "@/components/ui/portal";
import { Tooltip } from "@/components/ui/tooltip";
import { UserAvatar } from "@/components/ui/user-avatar";
import { cn } from "@/lib/cn";
import { useProjects } from "@/modules/projects/hooks/use-projects";
import { useTabsStore } from "@/lib/tabs-store";
import { useThemeStore } from "@/lib/theme-store";
import { useOfficeAgents } from "@/modules/office/hooks/use-office-agents";
import { useIntegrationEnabled } from "@/modules/settings/hooks/use-settings";
import { useProcessesStore } from "@/lib/processes-store";
import { isActiveRoute } from "./sidebar-routing";
import { BootstrapProjectModal } from "@/modules/projects/components/bootstrap-project-modal";
import { ProjectPickerDropdown } from "./project-picker-dropdown";
import { RefreshButton } from "./refresh-button";
import { SkillUpdatesBell } from "./skill-updates-bell";
import { UpdateBell } from "./update-bell";
import { DevMenu } from "@/components/dev/dev-menu";

/**
 * The top row every page renders at the top of `<main>` — project tabs,
 * Docs, theme toggle, and the account chip whose dropdown carries all
 * primary page navigation.
 *
 * Docs is always shown, reachable from every page, since the app already
 * treats Docs as globally accessible — hiding it on some pages would be a
 * regression. It navigates to `/docs` as a full page rather than opening a
 * slide-over panel: the docs content (`modules/docs/*`) is a full page, not
 * a panel-ready component, and building a slide-over is real scope (props
 * for panel mode, internal nav, close handling) that hasn't been done yet.
 *
 * This row is not `position:fixed` — it renders in normal page flow — but
 * modals still anchor below it via the shared `CHROME_TOP` constant, so it's
 * never visually covered by an open modal even though it isn't a persistent
 * global overlay.
 */

const NAV_ITEMS: ReadonlyArray<{
  key: "office" | "project" | "activity" | "agents" | "memory" | "skills" | "schedules" | "servers" | "settings";
  icon: IconName;
  href: string;
  exact?: boolean;
}> = [
  { key: "office", icon: "home", href: PAGE_ROUTES.office, exact: true },
  { key: "project", icon: "settings", href: PAGE_ROUTES.projects },
  { key: "activity", icon: "activity", href: PAGE_ROUTES.activity },
  { key: "agents", icon: "templates", href: PAGE_ROUTES.agents },
  { key: "memory", icon: "memory", href: PAGE_ROUTES.memory },
  { key: "skills", icon: "sparkle", href: PAGE_ROUTES.skills },
  { key: "schedules", icon: "list", href: PAGE_ROUTES.schedules },
  { key: "servers", icon: "server", href: "#" },
  { key: "settings", icon: "settings", href: PAGE_ROUTES.settings },
];

type ContextMenuState = { tabId: string; x: number; y: number } | null;

export function MainTopBar() {
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname();
  const setProcessesOpen = useProcessesStore((s) => s.setOpen);

  const theme = useThemeStore((s) => s.theme);
  const toggleTheme = useThemeStore((s) => s.toggle);

  const { spendToday, agents } = useOfficeAgents();
  // The office page is iso-only now; hide its nav entry unless the Isometric
  // view integration is enabled (matches OfficeView's gate).
  const isoEnabled = useIntegrationEnabled("iso-view");

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
  const openProjectIds = useMemo(() => new Set(tabs.map((tab) => tab.projectId)), [tabs]);

  // The active project is the project of the currently-active tab. The "Project"
  // nav entry deep-links to it (`/projects/<id>`) and falls back to the projects
  // list when nothing is open. Office is hidden here unless iso is enabled.
  const activeProjectId = useMemo(
    () => (activeTabId ? tabs.find((tab) => tab.id === activeTabId)?.projectId ?? null : null),
    [activeTabId, tabs],
  );
  const navItems = useMemo(() => {
    const projectHref = activeProjectId ? PAGE_ROUTES.project(activeProjectId) : PAGE_ROUTES.projects;
    return NAV_ITEMS
      .filter((i) => isoEnabled || i.key !== "office")
      .map((i) => (i.key === "project" ? { ...i, href: projectHref } : i));
  }, [isoEnabled, activeProjectId]);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [bootstrapOpen, setBootstrapOpen] = useState(false);
  const [navMenuOpen, setNavMenuOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);
  const plusRef = useRef<HTMLButtonElement>(null);
  const navMenuRef = useRef<HTMLDivElement>(null);

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

  const handlePickAll = useCallback(() => router.push(PAGE_ROUTES.projects), [router]);

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
      const nextTab = nextActiveId ? useTabsStore.getState().tabs.find((t2) => t2.id === nextActiveId) : null;
      if (nextTab) router.push(nextTab.currentPath);
      else if (tab.id === activeTabId) router.push(PAGE_ROUTES.projects);
    },
    [closeTab, router, activeTabId],
  );

  const handleReorder = useCallback(
    (nextTabs: Tab[]) => reorderTabs(nextTabs.map((tab) => tab.id)),
    [reorderTabs],
  );

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
      for (const t2 of list.slice(idx + 1)) closeTab(t2.id);
    },
    [closeTab],
  );

  const handleRestoreClosed = useCallback(() => {
    const restored = restoreLastClosed();
    if (restored) router.push(restored.currentPath);
  }, [restoreLastClosed, router]);

  // Tab context menu — outside click / Escape.
  useEffect(() => {
    if (!contextMenu) return;
    const onMouse = () => setContextMenu(null);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setContextMenu(null); };
    const timer = window.setTimeout(() => document.addEventListener("mousedown", onMouse), 0);
    document.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("mousedown", onMouse);
      document.removeEventListener("keydown", onKey);
    };
  }, [contextMenu]);

  // Account/nav menu — outside click / Escape.
  useEffect(() => {
    if (!navMenuOpen) return;
    const onMouse = (e: MouseEvent) => {
      if (!navMenuRef.current?.contains(e.target as Node)) setNavMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setNavMenuOpen(false); };
    document.addEventListener("mousedown", onMouse);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onMouse);
      document.removeEventListener("keydown", onKey);
    };
  }, [navMenuOpen]);

  // Global ⌘/ (Ctrl+/) opens Docs, matching the keyboard-shortcut badge
  // shown on the Docs button.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "/") {
        e.preventDefault();
        router.push(PAGE_ROUTES.docs);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  const navBadge = useCallback(
    (key: (typeof NAV_ITEMS)[number]["key"]): string | undefined => {
      if (key === "activity") return spendToday > 0 ? `$${spendToday.toFixed(2)}` : undefined;
      if (key === "agents") return agents.length > 0 ? String(agents.length) : undefined;
      return undefined;
    },
    [spendToday, agents.length],
  );

  return (
    <div className="shrink-0 flex items-center gap-[10px] px-[20px] pt-[16px] pb-[16px]" data-tauri-drag-region>
      {/* Project tabs — sheen pill, drag-to-reorder, right-click menu */}
      <div className="surface-sheen flex items-center gap-[3px] min-w-0 p-[5px] rounded-2xl shadow-[var(--lift)]" data-tauri-drag-region="false">
        {tabs.length === 0 ? (
          <span className="text-[12px] text-txt-4 italic px-2 select-none whitespace-nowrap">{t("tabs.empty_hint")}</span>
        ) : (
          <Reorder.Group
            axis="x"
            values={tabs}
            onReorder={handleReorder}
            as="div"
            className="flex items-stretch gap-[2px] min-w-0 overflow-x-auto overflow-y-hidden [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
          >
            {tabs.map((tab) => (
              <Reorder.Item key={tab.id} value={tab} as="div" dragElastic={0.05} dragTransition={{ bounceStiffness: 400, bounceDamping: 30 }} className="shrink-0">
                <TabPill
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

        {tabs.length > 0 ? <span className="w-px h-5 bg-edge mx-[3px] shrink-0" aria-hidden /> : null}

        <Tooltip content={t("tabs.open_project_title")} side="bottom" className="shrink-0">
          <button
            ref={plusRef}
            type="button"
            onClick={() => setPickerOpen((v) => !v)}
            aria-label={t("tabs.open_project_title")}
            aria-haspopup="menu"
            aria-expanded={pickerOpen}
            className="w-[30px] h-[30px] flex items-center justify-center rounded-xl text-txt-4 hover:bg-card-3 hover:text-txt transition-colors duration-150"
          >
            <Icon name="plus" size={14} className={cn("transition-transform duration-150", pickerOpen && "rotate-45")} />
          </button>
        </Tooltip>

        {pickerOpen ? (
          <Portal>
            <div className="fixed z-[400]" style={{ top: (plusRef.current?.getBoundingClientRect().bottom ?? 0) + 8, left: (plusRef.current?.getBoundingClientRect().left ?? 0) - 10 }}>
              <ProjectPickerDropdown
                open={pickerOpen}
                triggerRef={plusRef}
                onClose={() => setPickerOpen(false)}
                onPickProject={handlePickProject}
                onPickAll={handlePickAll}
                onPickNew={() => setBootstrapOpen(true)}
                selectedProjectId={activeTabId ? (tabs.find((t2) => t2.id === activeTabId)?.projectId ?? null) : null}
                openTabProjectIds={openProjectIds}
              />
            </div>
          </Portal>
        ) : null}
      </div>

      <BootstrapProjectModal open={bootstrapOpen} onClose={() => setBootstrapOpen(false)} />

      {contextMenu ? (
        <TabContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          canRestore={closedStackLen > 0}
          onClose={() => { const tab = tabs.find((t2) => t2.id === contextMenu.tabId); if (tab) handleClose(tab); setContextMenu(null); }}
          onCloseOthers={() => { handleCloseOthers(contextMenu.tabId); setContextMenu(null); }}
          onCloseRight={() => { handleCloseRight(contextMenu.tabId); setContextMenu(null); }}
          onRestore={() => { handleRestoreClosed(); setContextMenu(null); }}
          labels={{ close: t("tabs.ctx_close"), closeOthers: t("tabs.ctx_close_others"), closeRight: t("tabs.ctx_close_right"), restore: t("tabs.ctx_restore_closed") }}
        />
      ) : null}

      <span className="flex-1" data-tauri-drag-region />

      {/* Dev/update affordances — kept small and muted; SkillUpdatesBell/
          UpdateBell render nothing when there's nothing to report. */}
      <div className="flex items-center gap-1 shrink-0" data-tauri-drag-region="false">
        <SkillUpdatesBell />
        <UpdateBell />
        <DevMenu />
        <RefreshButton />
      </div>

      {/* Docs — always shown, see file doc-comment above */}
      <Tooltip content={t("titlebar.documentation_title")} side="bottom" className="shrink-0">
        <Link
          href={PAGE_ROUTES.docs}
          className="group surface-sheen h-[38px] flex items-center gap-[8px] pl-[12px] pr-[14px] rounded-full text-txt-2 hover:text-txt font-semibold text-[12.5px] shadow-[var(--lift)] transition-[transform,box-shadow,color] duration-200 no-underline hover:-translate-y-px hover:shadow-[0_28px_58px_-26px_rgba(0,0,0,0.95),0_4px_16px_-4px_color-mix(in_srgb,var(--acc)_38%,transparent),inset_0_1px_0_rgba(255,255,255,0.12)] active:translate-y-0 active:shadow-[var(--lift)]"
          data-tauri-drag-region="false"
        >
          <Icon name="book" size={15} className="text-acc transition-transform duration-200 group-hover:scale-110" />
          Docs
          <span className="font-[var(--font-mono)] text-[10px] font-medium px-[6px] py-[2px] rounded-[7px] bg-card-3 text-txt-4 transition-colors duration-200 group-hover:text-txt-2">⌘/</span>
        </Link>
      </Tooltip>

      {/* Theme toggle */}
      <Tooltip content={t("titlebar.toggle_theme_title")} side="bottom" className="shrink-0">
        <button
          type="button"
          onClick={toggleTheme}
          aria-label={theme === "dark" ? t("titlebar.switch_to_light") : t("titlebar.switch_to_dark")}
          className="group surface-sheen w-[38px] h-[38px] flex items-center justify-center rounded-full text-txt-2 hover:text-txt shadow-[var(--lift)] transition-[transform,box-shadow,color] duration-200 hover:-translate-y-px hover:shadow-[0_28px_58px_-26px_rgba(0,0,0,0.95),0_4px_16px_-4px_color-mix(in_srgb,var(--acc)_32%,transparent),inset_0_1px_0_rgba(255,255,255,0.12)] active:translate-y-0 active:shadow-[var(--lift)]"
          data-tauri-drag-region="false"
        >
          <Icon
            name={theme === "dark" ? "moon" : "sun"}
            size={16}
            className="transition-transform duration-300 ease-out group-hover:-rotate-[18deg] group-hover:scale-110"
          />
        </button>
      </Tooltip>

      {/* Account chip — dropdown carries all primary page navigation */}
      <div className="relative shrink-0" ref={navMenuRef} data-tauri-drag-region="false">
        <button
          type="button"
          onClick={() => setNavMenuOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={navMenuOpen}
          className="group surface-sheen flex items-center gap-[9px] py-[5px] pl-[5px] pr-[12px] rounded-full shadow-[var(--lift)] cursor-pointer transition-[transform,box-shadow] duration-200 hover:-translate-y-px hover:shadow-[0_28px_58px_-26px_rgba(0,0,0,0.95),0_4px_16px_-4px_color-mix(in_srgb,var(--acc)_32%,transparent),inset_0_1px_0_rgba(255,255,255,0.12)] active:translate-y-0 active:shadow-[var(--lift)]"
        >
          <UserAvatar size={28} className="rounded-full transition-transform duration-200 group-hover:scale-[1.08]" />
          <span className="leading-[1.2] text-left">
            <span className="block text-[12.5px] font-semibold whitespace-nowrap">{t("sidebar.me_name")}</span>
            <span className="block text-[10.5px] text-txt-4 whitespace-nowrap">{t("sidebar.me_sub")}</span>
          </span>
          <Icon name="chevron-down" size={13} className={cn("text-txt-4 shrink-0 transition-transform duration-150", navMenuOpen ? "rotate-180" : "group-hover:translate-y-px")} />
        </button>

        {navMenuOpen ? (
          <div className="absolute top-[calc(100%+8px)] right-0 w-[226px] p-[7px] surface-sheen rounded-[18px] shadow-[var(--lift)] z-[60]">
            {navItems.map((item) => {
              const active = isActiveRoute(pathname, item.href, { exact: item.exact });
              // nav.servers doesn't exist — the shared key for this entry is
              // "processes" (see messages/en.json), reused here so the
              // Servers modal trigger and the sidebar's old ProcessesNavButton
              // don't fork the same label into two translation keys.
              const label = item.key === "servers" ? t("nav.processes") : t(`nav.${item.key}`);
              const badge = navBadge(item.key);
              const shared = "flex items-center gap-[10px] px-[10px] py-[8px] rounded-[11px] cursor-pointer no-underline transition-colors duration-150";
              const content = (
                <>
                  <span className="w-4 h-4 flex items-center justify-center shrink-0">
                    <Icon name={item.icon} size={15} />
                  </span>
                  <span className="flex-1 text-[12.5px] whitespace-nowrap">{label}</span>
                  {badge ? (
                    <span className="font-[var(--font-mono)] text-[9.5px] font-semibold px-[7px] py-[1px] rounded-full bg-card-3 text-txt-4 whitespace-nowrap shrink-0">
                      {badge}
                    </span>
                  ) : null}
                </>
              );
              if (item.key === "servers") {
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => { setNavMenuOpen(false); setProcessesOpen(true); }}
                    className={cn(shared, "w-full text-left bg-transparent border-0 font-[inherit]", active ? "bg-acc-soft text-acc font-bold" : "text-txt-2 hover:bg-card-2")}
                  >
                    {content}
                  </button>
                );
              }
              return (
                <Link
                  key={item.key}
                  href={item.href}
                  onClick={() => setNavMenuOpen(false)}
                  className={cn(shared, active ? "bg-acc-soft text-acc font-bold" : "text-txt-2 hover:bg-card-2")}
                >
                  {content}
                </Link>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}

type TabPillProps = {
  tab: Tab;
  isActive: boolean;
  projectName: string;
  projectPlanet: PlanetConfig | undefined;
  onActivate: () => void;
  onClose: () => void;
  onContextMenu: (x: number, y: number) => void;
  closeLabel: string;
};

function TabPill({ tab, isActive, projectName, projectPlanet, onActivate, onClose, onContextMenu, closeLabel }: TabPillProps) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      className={cn(
        "group relative flex items-center gap-[8px] pl-[8px] pr-[6px] max-w-[220px] min-w-[110px] h-[38px] rounded-xl cursor-pointer select-none text-[12.5px] font-semibold transition-colors duration-150",
        isActive ? "bg-card-2" : "text-txt-2 hover:bg-card-2",
      )}
      role="tab"
      aria-selected={isActive}
      aria-label={projectName}
      title={projectName}
      tabIndex={0}
      onClick={onActivate}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onActivate(); } }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onAuxClick={(e) => { if (e.button === 1) { e.preventDefault(); onClose(); } }}
      onContextMenu={(e) => { e.preventDefault(); onContextMenu(e.clientX, e.clientY); }}
    >
      <PlanetCanvas projectId={tab.projectId} config={projectPlanet} size={18} className="rounded-full shrink-0 pointer-events-none" />
      <span className="flex-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap pointer-events-none">{projectName}</span>
      <Tooltip content={closeLabel} side="bottom" className="shrink-0">
        <button
          type="button"
          aria-label={closeLabel}
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          onPointerDown={(e) => e.stopPropagation()}
          className={cn(
            "inline-flex items-center justify-center w-[16px] h-[16px] rounded-[5px] text-txt-4 hover:bg-card-3 hover:text-txt transition-[background,color,opacity] duration-100",
            isActive || hovered ? "opacity-100" : "opacity-0",
          )}
        >
          <Icon name="x" size={10} />
        </button>
      </Tooltip>
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
  labels: { close: string; closeOthers: string; closeRight: string; restore: string };
};

function TabContextMenu({ x, y, canRestore, onClose, onCloseOthers, onCloseRight, onRestore, labels }: TabContextMenuProps) {
  const style: React.CSSProperties = {
    left: Math.min(x, (typeof window !== "undefined" ? window.innerWidth : 1200) - 220),
    top: Math.min(y, (typeof window !== "undefined" ? window.innerHeight : 800) - 140),
  };
  return (
    <Portal>
      <div role="menu" className="fixed z-[500] flex flex-col min-w-[200px] py-1 surface-sheen rounded-[var(--r-md)] shadow-[var(--lift)]" style={style} onMouseDown={(e) => e.stopPropagation()}>
        <MenuItem onClick={onClose} label={labels.close} />
        <MenuItem onClick={onCloseOthers} label={labels.closeOthers} />
        <MenuItem onClick={onCloseRight} label={labels.closeRight} />
        <div className="h-px bg-edge my-1" />
        <MenuItem onClick={onRestore} label={labels.restore} disabled={!canRestore} />
      </div>
    </Portal>
  );
}

function MenuItem({ onClick, label, disabled }: { onClick: () => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      className="text-left px-3 py-[6px] text-[12.5px] text-txt cursor-pointer hover:bg-card-2 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors duration-100"
      onClick={onClick}
    >
      {label}
    </button>
  );
}
