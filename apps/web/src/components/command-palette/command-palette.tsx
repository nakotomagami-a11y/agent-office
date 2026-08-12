"use client";

import {
  useEffect,
  useRef,
  useState,
  useCallback,
  type KeyboardEvent,
} from "react";
import { useFilter } from "@/hooks/use-filter";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { Icon, type IconName } from "@/components/ui/icon";
import { cn } from "@/lib/cn";
import { usePaletteStore } from "@/lib/palette-store";
import { useProcessesStore } from "@/lib/processes-store";
import { useFlutterStore } from "@/lib/flutter-store";
import { useThemeStore } from "@/lib/theme-store";
import { abortAllRuns } from "@/lib/api/runs-ops";
import { PAGE_ROUTES } from "@agent-office/domain/config/routes";

// Command registry

type Command = {
  id: string;
  label: string;
  secondary?: string;
  icon: IconName;
  section: string;
  action: (router: AppRouterInstance) => void;
};

const COMMANDS: Command[] = [
  // ── Navigate ──────────────────────────────────────────────────────────────
  { id: "nav-office",    label: "Go to Office",    icon: "home",      section: "Navigate", action: (r) => r.push(PAGE_ROUTES.office) },
  { id: "nav-activity",  label: "Go to Activity",  icon: "activity",  section: "Navigate", action: (r) => r.push(PAGE_ROUTES.activity) },
  { id: "nav-analytics", label: "Go to Analytics", icon: "gauge",     section: "Navigate", action: (r) => r.push(PAGE_ROUTES.analytics) },
  { id: "nav-agents",    label: "Go to Agents",    icon: "templates", section: "Navigate", action: (r) => r.push(PAGE_ROUTES.agents) },
  { id: "nav-projects",  label: "Go to Projects",  icon: "folder",    section: "Navigate", action: (r) => r.push(PAGE_ROUTES.projects) },
  { id: "nav-memory",    label: "Go to Memory",    icon: "memory",    section: "Navigate", action: (r) => r.push(PAGE_ROUTES.memory) },
  { id: "nav-skills",    label: "Go to Skills",    icon: "layers",    section: "Navigate", action: (r) => r.push(PAGE_ROUTES.skills) },
  { id: "nav-settings",  label: "Go to Settings",  icon: "settings",  section: "Navigate", action: (r) => r.push(PAGE_ROUTES.settings) },
  { id: "nav-docs",      label: "Go to Docs",      icon: "help-circle", section: "Navigate", action: (r) => r.push(PAGE_ROUTES.docs) },
  { id: "nav-search",    label: "Search Runs",     icon: "search",    section: "Navigate", secondary: "⌘K then type", action: (r) => r.push("/search") },
  { id: "new-agent",     label: "New Agent",       icon: "plus",      section: "Navigate", action: (r) => r.push("/agents/new") },
  // ── Actions ───────────────────────────────────────────────────────────────
  {
    id: "toggle-theme",
    label: "Toggle Theme",
    secondary: "dark / light",
    icon: "sun",
    section: "Actions",
    action: () => useThemeStore.getState().toggle(),
  },
  {
    id: "kill-all-runs",
    label: "Stop all running agents",
    icon: "stop",
    section: "Actions",
    action: () => {
      void abortAllRuns();
    },
  },
  // ── Tools ─────────────────────────────────────────────────────────────────
  {
    id: "open-servers",
    label: "Running Servers",
    icon: "server",
    section: "Tools",
    action: () => useProcessesStore.getState().setOpen(true),
  },
  {
    id: "open-flutter",
    label: "Flutter Device Manager",
    icon: "smartphone",
    section: "Tools",
    action: () => useFlutterStore.getState().setOpen(true),
  },
];

// Component

export function CommandPalette() {
  const open = usePaletteStore((s) => s.open);
  const setOpen = usePaletteStore((s) => s.setOpen);
  const router = useRouter();

  const { query, setQuery, filtered } = useFilter(
    COMMANDS,
    (c, q) => c.label.toLowerCase().includes(q.toLowerCase()) || c.section.toLowerCase().includes(q.toLowerCase()),
  );
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  // SSR safety for portal
  useEffect(() => {
    setMounted(true);
  }, []);

  // Global Cmd+K / Ctrl+K toggle
  useEffect(() => {
    const onGlobalKey = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen(true);
      }
    };
    document.addEventListener("keydown", onGlobalKey);
    return () => document.removeEventListener("keydown", onGlobalKey);
  }, [setOpen]);

  // Reset query + active index when palette opens; focus input
  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
      // rAF so the element is visible before we focus
      requestAnimationFrame(() => inputRef.current?.focus());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally scoped to open transitions
  }, [open]);

  // Scroll active row into view
  useEffect(() => {
    if (!listRef.current) return;
    const active = listRef.current.querySelector<HTMLElement>(
      "[data-active='true']",
    );
    active?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const close = useCallback(() => setOpen(false), [setOpen]);

  const execute = useCallback(
    (cmd: Command) => {
      close();
      cmd.action(router);
    },
    [close, router],
  );

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (filtered.length === 0 ? 0 : (i + 1) % filtered.length));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) =>
        filtered.length === 0 ? 0 : (i - 1 + filtered.length) % filtered.length,
      );
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const cmd = filtered[activeIndex];
      if (cmd) execute(cmd);
      return;
    }
  };

  // Keep activeIndex in bounds when filter changes
  useEffect(() => {
    setActiveIndex((i) => (filtered.length === 0 ? 0 : Math.min(i, filtered.length - 1)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  if (!mounted || !open) return null;

  return createPortal(
    // Backdrop
    <div
      role="presentation"
      onClick={close}
      className="app-modal-backdrop fixed inset-0 bg-black/40 z-[100] flex items-start justify-center pt-[15vh]"
      style={{ top: 74 }}
    >
      {/* Panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onClick={(e) => e.stopPropagation()}
        className="w-[min(580px,92vw)] max-h-[480px] bg-[var(--bg-1)] border border-[var(--line)] rounded-[8px] shadow-[var(--shadow-window)] overflow-hidden flex flex-col"
      >
        {/* Search input */}
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={true}
          aria-autocomplete="list"
          aria-controls="cmd-palette-list"
          aria-activedescendant={
            filtered[activeIndex] ? `cmd-${filtered[activeIndex]!.id}` : undefined
          }
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Search commands…"
          className="w-full border-none border-b border-[var(--line)] px-4 py-[14px] text-[15px] bg-transparent text-[var(--txt)] outline-none box-border"
        />

        {/* Results */}
        <div
          id="cmd-palette-list"
          ref={listRef}
          role="listbox"
          aria-label="Commands"
          className="overflow-y-auto max-h-[360px] p-[6px]"
        >
          {filtered.length === 0 ? (
            <div className="px-[10px] py-3 text-[13px] text-[var(--txt-3)] text-center">
              No commands found
            </div>
          ) : (() => {
            const elements: React.ReactNode[] = [];
            let lastSection = "";
            filtered.forEach((cmd, idx) => {
              const isActive = idx === activeIndex;
              if (!query && cmd.section !== lastSection) {
                lastSection = cmd.section;
                elements.push(
                  <div key={`sec-${cmd.section}`} className="px-[10px] pt-[10px] pb-[4px] text-[10.5px] font-semibold uppercase tracking-[0.1em] text-[var(--txt-4)]">
                    {cmd.section}
                  </div>
                );
              }
              elements.push(
                <div
                  key={cmd.id}
                  id={`cmd-${cmd.id}`}
                  role="option"
                  aria-selected={isActive}
                  data-active={isActive}
                  onClick={() => execute(cmd)}
                  onMouseEnter={() => setActiveIndex(idx)}
                  className={cn("flex items-center gap-[10px] px-[10px] py-[8px] rounded-[var(--r-md)] cursor-pointer select-none", isActive ? "bg-bg-2" : "bg-transparent")}
                >
                  <Icon name={cmd.icon} size={15} aria-hidden />
                  <span className="flex-1 text-[13.5px] text-[var(--txt)]">
                    {cmd.label}
                  </span>
                  {cmd.secondary ? (
                    <span className="text-[11px] font-[var(--font-mono)] text-[var(--txt-3)]">
                      {cmd.secondary}
                    </span>
                  ) : null}
                </div>
              );
            });
            return elements;
          })()}
        </div>
      </div>
    </div>,
    document.body,
  );
}
