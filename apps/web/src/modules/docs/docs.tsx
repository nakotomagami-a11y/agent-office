"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { DocsRender, extractHeadings, type DocHeading } from "./docs-render";
import { PageHeader } from "@/components/ui/page-header";

/**
 * `/docs` page — thin fetch-and-render shell.
 *
 * Every tab's content lives as a plain markdown file under
 * `apps/web/docs/`. The tab config is served by `GET /api/docs/content`
 * (from `_index.json`). Each tab body is fetched from
 * `GET /api/docs/content?file=<name>` and rendered via {@link DocsRender}.
 *
 * The right-nav TOC is derived from the markdown headings at render time
 * (see {@link extractHeadings}), so adding a new heading in the .md file
 * automatically shows up in the nav — no hand-maintained anchor list.
 */

declare const process: { env: Record<string, string | undefined> };

// ── Design tokens ──────────────────────────────────────────────────────────
const B = "border-[rgba(255,255,255,0.08)]";

// ── Tab config ─────────────────────────────────────────────────────────────

interface DocsTabConfig {
  id: string;
  label: string;
  file: string;
}

interface DocsIndex {
  version: number;
  tabs: DocsTabConfig[];
}

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
    <aside className="hidden md:block w-[220px] flex-shrink-0">
      <nav className="sticky top-5 flex flex-col gap-0.5" aria-label="On this page">
        <span className="font-[var(--font-mono)] text-[8px] font-bold tracking-[0.18em] uppercase text-[var(--txt-4)] px-2 pb-2 select-none">
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
              className={[
                "text-[12px] leading-[1.4] px-2 py-1.5 rounded-[5px] transition-colors duration-100",
                // h3 subheadings indent under their parent h2 for a natural outline.
                h.level === 3 ? "pl-5" : "",
                isActive
                  ? "font-semibold text-[var(--acc)] bg-[var(--acc-faint)]"
                  : "text-[var(--txt-3)] hover:text-[var(--txt-2)] hover:bg-[var(--bg-2)]",
              ].join(" ")}
            >
              {h.text}
            </a>
          );
        })}
      </nav>
    </aside>
  );
}

// ── Tab bar styling ────────────────────────────────────────────────────────
const TAB_BASE =
  "px-4 py-2 mr-1 text-[12.5px] font-medium transition-all duration-100 border-b-2 -mb-px cursor-pointer whitespace-nowrap rounded-t-[4px]";
const TAB_ACTIVE = "text-[var(--txt)] border-[var(--acc)] bg-[var(--bg-0)]";
const TAB_INACTIVE =
  "text-[var(--txt-3)] border-transparent hover:text-[var(--txt-2)] hover:bg-[var(--bg-0)]/50";

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
    <div className="flex flex-col h-full min-h-0 overflow-hidden bg-[var(--bg-0)]">
      {/* ── Page header ─────────────────────────────────── */}
      {/* Use the shared PageHeader so /docs matches Agents / Memory /
          Activity / Settings / Skills. Do NOT hand-roll a header here. */}
      <PageHeader
        title="Documentation"
        sub={`· Agent Office v${process.env.NEXT_PUBLIC_APP_VERSION ?? "dev"}`}
      />

      {/* ── Tab bar ─────────────────────────────────────── */}
      <div className={`flex-shrink-0 bg-[var(--bg-1)] border-b ${B}`}>
        <div className="max-w-[1280px] mx-auto px-[28px]">
          <div className="flex flex-wrap pt-3">
            {(index?.tabs ?? []).map((t) => {
              const active = activeId === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => {
                    setActiveId(t.id);
                    scrollRef.current?.scrollTo({ top: 0 });
                  }}
                  className={`${TAB_BASE} ${active ? TAB_ACTIVE : TAB_INACTIVE}`}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Content ─────────────────────────────────────── */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto min-h-0">
        <div className="max-w-[1280px] mx-auto flex gap-6 px-[28px] pt-5 pb-24">
          <div className="flex-1 min-w-0">
            {!index && (
              <div className="text-[13px] text-[var(--txt-3)] font-mono py-6">Loading docs config…</div>
            )}
            {index && !activeTab && index.tabs.length === 0 && (
              <div className="text-[13px] text-[var(--txt-3)] py-6">
                No documentation tabs configured. Add entries to <code>apps/web/docs/_index.json</code>.
              </div>
            )}
            {activeTab && content.loading && (
              <div className="text-[13px] text-[var(--txt-3)] font-mono py-6">Loading {activeTab.file}…</div>
            )}
            {activeTab && content.error && (
              <div className="text-[13px] text-red-300 font-mono py-6">
                Failed to load {activeTab.file}: {content.error}
              </div>
            )}
            {activeTab && !content.loading && !content.error && (
              <DocsRender markdown={content.markdown} />
            )}
          </div>
          <DocsAside headings={headings} scrollContainer={scrollRef} />
        </div>
      </div>
    </div>
  );
}
