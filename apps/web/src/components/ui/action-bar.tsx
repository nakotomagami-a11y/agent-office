"use client";

import { Fragment, useRef, useState, useEffect, type ReactNode } from "react";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";

export type ActionBarAction = {
  key: string;
  element: ReactNode;
  segment?: string;
  priority?: number;
};

export type ActionBarDivider = { key: string; type: "divider" };
export type ActionBarItem = ActionBarAction | ActionBarDivider;

function isDivider(item: ActionBarItem): item is ActionBarDivider {
  return "type" in item && (item as ActionBarDivider).type === "divider";
}

/**
 * Renders actions inline when the parent flex row has space; collapses to a
 * "⋯" dropdown when the row overflows. Wrap only the actions that should
 * participate in the collapse — fixed buttons (like "Add agent") stay outside.
 *
 * Pass `actions` for legacy all-or-nothing collapse.
 * Pass `items` for per-segment priority-based collapse: items with a `segment`
 * key collapse as a group; higher `priority` collapses first. Unsegmented items
 * never collapse. `{ type: "divider" }` items are hidden when both adjacent
 * segments are collapsed or absent.
 */
export function ActionBar(
  props: { actions: ActionBarAction[] } | { items: ActionBarItem[] },
) {
  if ("items" in props) return <ActionBarSegmented items={props.items} />;
  return <ActionBarLegacy actions={props.actions} />;
}

function ActionBarLegacy({ actions }: { actions: ActionBarAction[] }) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef({ collapsed: false, collapseWidth: null as number | null });
  const [collapsed, setCollapsed] = useState(false);
  const [open, setOpen] = useState(false);

  const runCheck = () => {
    const el = wrapperRef.current;
    if (!el) return;
    const parent = el.parentElement;
    if (!parent) return;

    const { collapsed: isCollapsed, collapseWidth } = stateRef.current;

    if (!isCollapsed) {
      if (parent.scrollWidth > parent.clientWidth + 2) {
        stateRef.current.collapseWidth = parent.scrollWidth;
        stateRef.current.collapsed = true;
        setCollapsed(true);
      }
    } else {
      if (collapseWidth !== null && parent.clientWidth > collapseWidth + 4) {
        stateRef.current.collapsed = false;
        stateRef.current.collapseWidth = null;
        setCollapsed(false);
      }
    }
  };

   
  useEffect(() => { runCheck(); });

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const parent = el.parentElement;
    if (!parent) return;
    const observer = new ResizeObserver(runCheck);
    observer.observe(parent);
    return () => observer.disconnect();
     
  }, []);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (!dropRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  return (
    <div ref={wrapperRef} className="shrink-0 flex items-center gap-2">
      {collapsed ? (
        <div ref={dropRef} className="relative">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className={cn(
              "inline-flex items-center justify-center w-8 h-8 rounded-[8px] border border-transparent text-txt-2 transition-[background,border-color,color] duration-[120ms] hover:bg-bg-2 hover:border-line hover:text-txt",
              open && "bg-bg-2 border-line text-txt",
            )}
            title="More actions"
          >
            <Icon name="more-horizontal" size={16} />
          </button>

          {open && (
            <div className="absolute top-[calc(100%+6px)] right-0 min-w-[200px] bg-[var(--bg-elev)] border border-[var(--line-2)] rounded-[10px] shadow-[var(--shadow-3)] z-50 py-1 overflow-hidden">
              {actions.map((a) => (
                <div key={a.key} className="px-1.5 py-0.5 flex">
                  {a.element}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <>
          {actions.map((a) => a.element)}
        </>
      )}
    </div>
  );
}

function ActionBarSegmented({ items }: { items: ActionBarItem[] }) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const segRef = useRef<{
    collapsed: Set<string>;
    collapseWidths: Map<string, number>;
  }>({ collapsed: new Set(), collapseWidths: new Map() });
  const runCheckRef = useRef<() => void>(() => {});
  const [collapsedSegments, setCollapsedSegments] = useState<ReadonlySet<string>>(new Set());
  const [open, setOpen] = useState(false);

  const runCheck = () => {
    const el = wrapperRef.current;
    if (!el) return;
    const parent = el.parentElement;
    if (!parent) return;

    const { collapsed, collapseWidths } = segRef.current;

    // Unique segments sorted by priority desc (highest collapses first)
    const segMap = new Map<string, number>();
    for (const item of items) {
      if (!isDivider(item) && item.segment !== undefined && !segMap.has(item.segment)) {
        segMap.set(item.segment, item.priority ?? 0);
      }
    }
    const segments = [...segMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name]) => name);
    const segSet = new Set(segments);

    let changed = false;

    // Clean up segments that no longer exist (e.g. project changed)
    for (const seg of [...collapsed]) {
      if (!segSet.has(seg)) {
        collapsed.delete(seg);
        collapseWidths.delete(seg);
        changed = true;
      }
    }

    // Try to restore segments that now have enough room
    for (const seg of [...collapsed]) {
      const cw = collapseWidths.get(seg);
      if (cw !== undefined && parent.clientWidth > cw + 4) {
        collapsed.delete(seg);
        collapseWidths.delete(seg);
        changed = true;
      }
    }

    // Collapse highest-priority visible segment on overflow
    if (parent.scrollWidth > parent.clientWidth + 2) {
      const target = segments.find((s) => !collapsed.has(s));
      if (target) {
        collapseWidths.set(target, parent.scrollWidth);
        collapsed.add(target);
        changed = true;
      }
    }

    if (changed) setCollapsedSegments(new Set(collapsed));
  };

  runCheckRef.current = runCheck;

   
  useEffect(() => { runCheck(); });

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const parent = el.parentElement;
    if (!parent) return;
    const observer = new ResizeObserver(() => runCheckRef.current());
    observer.observe(parent);
    return () => observer.disconnect();
     
  }, []);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (!dropRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  // Filter out collapsed segments, then strip orphan dividers
  const filtered = items.filter((item) => {
    if (isDivider(item)) return true;
    const a = item as ActionBarAction;
    return a.segment === undefined || !collapsedSegments.has(a.segment);
  });
  const visibleItems = filtered.filter((item, i) => {
    if (!isDivider(item)) return true;
    const hasBefore = filtered.slice(0, i).some((x) => !isDivider(x));
    const hasAfter = filtered.slice(i + 1).some((x) => !isDivider(x));
    return hasBefore && hasAfter;
  });

  const overflowItems = items.filter(
    (item) =>
      !isDivider(item) &&
      (item as ActionBarAction).segment !== undefined &&
      collapsedSegments.has((item as ActionBarAction).segment!),
  );

  return (
    <div ref={wrapperRef} className="shrink-0 flex items-center gap-2">
      {visibleItems.map((item) => {
        if (isDivider(item)) {
          return <div key={item.key} className="w-px h-4 bg-line shrink-0" />;
        }
        const a = item as ActionBarAction;
        return <Fragment key={a.key}>{a.element}</Fragment>;
      })}

      {overflowItems.length > 0 && (
        <div ref={dropRef} className="relative">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className={cn(
              "inline-flex items-center justify-center w-8 h-8 rounded-[8px] border border-transparent text-txt-2 transition-[background,border-color,color] duration-[120ms] hover:bg-bg-2 hover:border-line hover:text-txt",
              open && "bg-bg-2 border-line text-txt",
            )}
            title="More actions"
          >
            <Icon name="more-horizontal" size={16} />
          </button>

          {open && (
            <div className="absolute top-[calc(100%+6px)] right-0 min-w-[200px] bg-[var(--bg-elev)] border border-[var(--line-2)] rounded-[10px] shadow-[var(--shadow-3)] z-50 py-1 overflow-hidden">
              {overflowItems.map((item) => {
                const a = item as ActionBarAction;
                return (
                  <div key={a.key} className="px-1.5 py-0.5 flex">
                    {a.element}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
