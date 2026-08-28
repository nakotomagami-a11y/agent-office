"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import type { DocsIndex } from "@agent-office/domain/types";
import { Icon, type IconName } from "@/components/ui/icon";
import { cn } from "@/lib/cn";
import { DocsRender, extractHeadings, type DocHeading } from "./docs-render";
import { PageHeader } from "@/components/ui/page-header";

/**
 * `/docs` page — thin fetch-and-render shell.
 *
 * Every tab's content lives as a plain markdown file under
 * `docs/` (repo root). The tab config is served by `GET /api/docs/content`
 * (from `_index.json`). Each tab body is fetched from
 * `GET /api/docs/content?file=<name>` and rendered via {@link DocsRender}.
 *
 * The right-nav TOC is derived from the markdown headings at render time
 * (see {@link extractHeadings}), so adding a new heading in the .md file
 * automatically shows up in the nav — no hand-maintained anchor list.
 *
 * Layout mirrors the Settings surface: a left nav rail (`surface-sheen`
 * rounded card, flips to a horizontal strip under 640px) + a content card
 * + a right-hand "on this page" TOC — matching the rest of the V3 redesign
 * instead of the old horizontal underline-tab bar this page shipped with.
 */

declare const process: { env: Record<string, string | undefined> };

// Icons are keyed by tab id, not data-driven from `_index.json` (which
// carries no icon field) — same approach `SettingsNav` uses for its own
// hardcoded item list.
const TAB_ICONS: Record<string, IconName> = {
  features: "sparkle",
  "getting-started": "zap",
  concepts: "book",
  agents: "templates",
  projects: "folder",
  memory: "memory",
  usage: "terminal",
  schedules: "list",
  interface: "layers",
  reference: "code",
};

// ── Data hook ──────────────────────────────────────────────────────────────

/** Fetch the tab config from `/api/docs/content`. Returns null while loading. */
function useDocsIndex(): DocsIndex | null {
  const [index, setIndex] = useState<DocsIndex | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/docs/content")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data && Array.isArray(data.tabs)) setIndex(data as DocsIndex);
      })
      .catch(() => {
        /* silently ignore — DocsPage handles null state */
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return index;
}

interface TabContentState {
  markdown: string;
  loading: boolean;
  error: string | null;
}

/** Fetch one tab's markdown body. Refetches whenever `file` changes. */
function useTabContent(file: string | null): TabContentState {
  const [state, setState] = useState<TabContentState>({ markdown: "", loading: false, error: null });
  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    setState({ markdown: "", loading: true, error: null });
    fetch(`/api/docs/content?file=${encodeURIComponent(file)}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const text = await r.text();
        if (cancelled) return;
        setState({ markdown: text, loading: false, error: null });
      })
      .catch((err) => {
        if (cancelled) return;
        setState({ markdown: "", loading: false, error: (err as Error).message });
      });
    return () => {
      cancelled = true;
    };
  }, [file]);
  return state;
}

// ── Right-nav TOC ──────────────────────────────────────────────────────────

function DocsAside({
  headings,
  scrollContainer,
}: {
  headings: DocHeading[];
  scrollContainer: React.RefObject<HTMLDivElement | null>;
}) {
  const [activeId, setActiveId] = useState<string>(headings[0]?.id ?? "");

  // Reset the active heading whenever the underlying set changes (tab switch).
  useEffect(() => {
    setActiveId(headings[0]?.id ?? "");
  }, [headings]);

  // Track which heading is topmost in the viewport so the corresponding
  // nav link highlights. IntersectionObserver keeps this O(1) per scroll.
  useEffect(() => {
    if (headings.length === 0) return;
    const root = scrollContainer.current ?? undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        const first = visible[0];
        if (first) setActiveId(first.target.id);
      },
      { root, rootMargin: "0px 0px -60% 0px", threshold: 0 },
    );
    const elements = headings
      .map((h) => document.getElementById(h.id))
      .filter((el): el is HTMLElement => el !== null);
    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [headings, scrollContainer]);

  if (headings.length === 0) return null;

  return (
    <aside className="hidden xl:block w-[212px] flex-shrink-0">
      <nav className="sticky top-0 flex flex-col gap-[2px]" aria-label="On this page">
        <span className="font-[var(--font-mono)] text-[9px] font-extrabold tracking-[0.1em] uppercase text-txt-4 px-[8px] pb-[8px] select-none">
          On this page
        </span>
        {headings.map((h) => {
          const isActive = activeId === h.id;
          return (
            <a
              key={h.id}
              href={`#${h.id}`}
              onClick={(e) => {
                e.preventDefault();
                const el = document.getElementById(h.id);
                if (el && scrollContainer.current) {
                  scrollContainer.current.scrollTo({
                    top: el.offsetTop - 20,
                    behavior: "smooth",
                  });
                }
              }}
              className={cn(
                "text-[12px] leading-[1.4] px-[8px] py-[6px] rounded-[9px] transition-colors duration-150",
                // h3 subheadings indent under their parent h2 for a natural outline.
                h.level === 3 && "pl-[20px]",
                isActive ? "font-semibold text-acc bg-acc-soft" : "text-txt-3 hover:text-txt-2 hover:bg-card-2",
              )}
            >
              {h.text}
            </a>
          );
        })}
      </nav>
    </aside>
  );
}

// ── Left nav rail — mirrors `SettingsNav`'s surface-sheen card treatment ──

function DocsNav({
  tabs,
  activeId,
  onChange,
}: {
  tabs: DocsIndex["tabs"];
  activeId: string | null;
  onChange: (id: string) => void;
}) {
  return (
    <nav
      aria-label="Documentation sections"
      className={cn(
        "shrink-0 w-[212px] surface-sheen rounded-[22px] shadow-[var(--lift)] py-[12px] px-[10px] overflow-y-auto",
        "flex flex-col gap-[2px]",
        "max-[640px]:w-full max-[640px]:flex-row max-[640px]:items-center",
        "max-[640px]:rounded-[14px] max-[640px]:overflow-x-auto max-[640px]:overflow-y-hidden",
        "max-[640px]:py-[8px] max-[640px]:px-[10px]",
      )}
    >
      {tabs.map((t) => {
        const active = t.id === activeId;
        return (
          <button
            key={t.id}
            type="button"
            aria-current={active ? "page" : undefined}
            onClick={() => onChange(t.id)}
            className={cn(
              "flex items-center gap-[10px] py-[8px] px-[10px] rounded-[12px] w-full text-left",
              "text-[12.5px] whitespace-nowrap cursor-pointer transition-colors duration-150",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acc",
              "max-[640px]:w-auto max-[640px]:shrink-0",
              active ? "bg-acc-soft text-acc font-bold" : "text-txt-2 hover:bg-card-2",
            )}
          >
            <Icon name={TAB_ICONS[t.id] ?? "book"} size={14} className="shrink-0 opacity-90" />
            {t.label}
          </button>
        );
      })}
    </nav>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function DocsPage() {
  const index = useDocsIndex();
  const [activeId, setActiveId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Sync the active tab to the first entry once the index loads.
  useEffect(() => {
    if (index && index.tabs.length > 0 && activeId === null) {
      setActiveId(index.tabs[0]!.id);
    }
  }, [index, activeId]);

  const activeTab = useMemo(
    () => index?.tabs.find((t) => t.id === activeId) ?? null,
    [index, activeId],
  );
  const content = useTabContent(activeTab?.file ?? null);
  const headings = useMemo(() => extractHeadings(content.markdown), [content.markdown]);

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      {/* ── Page header ─────────────────────────────────── */}
      {/* Use the shared PageHeader so /docs matches Agents / Memory /
          Activity / Settings / Skills. Do NOT hand-roll a header here. */}
      <PageHeader
        title="Documentation"
        sub={`Agent Office v${process.env.NEXT_PUBLIC_APP_VERSION ?? "dev"}`}
      />

      {/* ── Nav rail + content, same shell shape as SettingsPage ──── */}
      <div className="flex-1 min-h-0 flex flex-nowrap gap-[16px] px-[20px] pt-[16px] pb-[20px] max-[640px]:flex-col max-[640px]:gap-[10px] overflow-hidden">
        <DocsNav
          tabs={index?.tabs ?? []}
          activeId={activeId}
          onChange={(id) => {
            setActiveId(id);
            scrollRef.current?.scrollTo({ top: 0 });
          }}
        />

        <div ref={scrollRef} className="flex-1 min-w-0 overflow-y-auto">
          <div className="flex items-start gap-[16px] pb-[20px]">
            <div className="flex-1 min-w-0 surface-sheen rounded-[22px] shadow-[var(--lift)] overflow-hidden">
              <div className="px-[32px] py-[28px]">
                {!index && (
                  <div className="text-[13px] text-txt-3 font-mono py-6">Loading docs config…</div>
                )}
                {index && !activeTab && index.tabs.length === 0 && (
                  <div className="text-[13px] text-txt-3 py-6">
                    No documentation tabs configured. Add entries to <code>docs/_index.json</code>.
                  </div>
                )}
                {activeTab && content.loading && (
                  <div className="text-[13px] text-txt-3 font-mono py-6">Loading {activeTab.file}…</div>
                )}
                {activeTab && content.error && (
                  <div className="text-[13px] text-red py-6">
                    Failed to load {activeTab.file}: {content.error}
                  </div>
                )}
                {activeTab && !content.loading && !content.error && (
                  <DocsRender markdown={content.markdown} />
                )}
              </div>
            </div>
            <DocsAside headings={headings} scrollContainer={scrollRef} />
          </div>
        </div>
      </div>
    </div>
  );
}
