"use client";

import React, { useMemo } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { CodeBlock } from "@/components/ui/code-block";

/**
 * Markdown renderer for the /docs page.
 *
 * All docs content lives as plain .md files under `docs/` (repo root). Each
 * tab renders one file through this component. GFM (tables, task lists,
 * strikethrough) is enabled. Code blocks route through the app's existing
 * <CodeBlock> primitive so syntax highlighting matches the rest of the UI.
 *
 * Callouts use GitHub / Obsidian syntax:
 *
 *   > [!NOTE]
 *   > body text
 *
 *   > [!TIP]
 *   > ...
 *
 *   > [!WARN] (aka WARNING)
 *   > ...
 *
 * The callout parser runs BEFORE react-markdown so blockquote content
 * with a leading [!KIND] line becomes a styled aside instead of a plain
 * blockquote. This mirrors GitHub's rendering.
 */

// ── Callout preprocessing ──────────────────────────────────────────────────

/**
 * Strip GitHub/Obsidian callout syntax from raw markdown, replacing each
 * matched blockquote with a fenced `callout-<kind>` block whose "language"
 * carries the kind. The code renderer picks up that fence and styles it as
 * an aside. Simpler than a full remark plugin, works for every callout
 * kind we care about.
 */
function preprocessCallouts(md: string): string {
  return md.replace(
    /(^|\n)((?:>\s*(?:\[!(?:NOTE|TIP|WARN|WARNING|IMPORTANT|CAUTION)\]).*(?:\n>.*)*))/g,
    (_full, prefix: string, block: string) => {
      const lines = block.split(/\n/);
      const first = lines[0]!.trim();
      const kindMatch = first.match(/^>\s*\[!(NOTE|TIP|WARN|WARNING|IMPORTANT|CAUTION)\]\s*(.*)$/);
      if (!kindMatch) return `${prefix}${block}`;
      const kind = (kindMatch[1] === "WARN" ? "WARNING" : kindMatch[1] ?? "NOTE").toLowerCase();
      const bodyLines: string[] = [];
      if (kindMatch[2] && kindMatch[2].trim().length > 0) bodyLines.push(kindMatch[2]);
      for (let i = 1; i < lines.length; i++) {
        bodyLines.push(lines[i]!.replace(/^>\s?/, ""));
      }
      return `${prefix}\n\n\`\`\`callout-${kind}\n${bodyLines.join("\n")}\n\`\`\`\n`;
    },
  );
}

// ── Callout rendering ──────────────────────────────────────────────────────

// Uses the app's theme-aware status tokens (cyan/green/acc/amber/red)
// instead of hardcoded Tailwind palette colors, so callouts stay correct
// in both dark and light mode like every other status chip in the app.
const CALLOUT_STYLES: Record<string, { bg: string; label: string; tint: string; icon: string }> = {
  note:      { bg: "bg-cyan/[0.07]",   label: "Note",      tint: "text-cyan",   icon: "ℹ" },
  tip:       { bg: "bg-green/[0.08]",  label: "Tip",       tint: "text-green",  icon: "✓" },
  important: { bg: "bg-acc-soft",      label: "Important", tint: "text-acc",    icon: "!" },
  warning:   { bg: "bg-amber/[0.08]",  label: "Warning",   tint: "text-amber",  icon: "⚠" },
  caution:   { bg: "bg-red/[0.08]",    label: "Caution",   tint: "text-red",    icon: "⚠" },
};

function Callout({ kind, body }: { kind: string; body: string }) {
  const style = CALLOUT_STYLES[kind] ?? CALLOUT_STYLES.note!;
  return (
    <div className={`my-4 px-[16px] py-[13px] rounded-[10px] ${style.bg}`}>
      <div className={`flex items-center gap-2 text-[11px] uppercase tracking-[0.08em] font-semibold ${style.tint} mb-2`}>
        <span aria-hidden>{style.icon}</span>
        <span>{style.label}</span>
      </div>
      {/* react-markdown wraps a fenced block in <pre>, which would force
          `white-space: pre` + a monospace font onto this body (long lines
          then clip instead of wrapping). Reset both back to normal prose. */}
      <div className="text-[13px] text-txt-2 leading-[1.65] whitespace-normal break-words [font-family:var(--font-sans)]">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
      </div>
    </div>
  );
}

// ── Heading anchor slugify (must match TOC generator) ──────────────────────

/**
 * Derive a stable URL slug from heading text. Same algorithm as
 * {@link extractHeadings} so anchors from the right-nav match anchors in
 * the rendered doc.
 */
export function slugifyHeading(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

// ── Heading extractor for the right-nav TOC ────────────────────────────────

export interface DocHeading {
  level: 2 | 3;
  id: string;
  text: string;
}

/**
 * Walk the markdown source and pull out every `##` and `###` heading. Same
 * slug rule as {@link slugifyHeading} so the right-nav anchors match. Code
 * blocks are skipped so `## Something inside a fence` doesn't leak into
 * the TOC.
 */
export function extractHeadings(md: string): DocHeading[] {
  const out: DocHeading[] = [];
  const lines = md.split(/\n/);
  let inFence = false;
  for (const raw of lines) {
    if (/^```/.test(raw)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const h2 = raw.match(/^##\s+(.+?)\s*$/);
    if (h2) {
      const text = h2[1]!.trim();
      out.push({ level: 2, id: slugifyHeading(text), text });
      continue;
    }
    const h3 = raw.match(/^###\s+(.+?)\s*$/);
    if (h3) {
      const text = h3[1]!.trim();
      out.push({ level: 3, id: slugifyHeading(text), text });
    }
  }
  return out;
}

// ── Main renderer ──────────────────────────────────────────────────────────

/** Extract a plain-text string from react-markdown children (may be an array
 *  of strings + nested elements). Used to derive stable heading anchors. */
function childrenToText(children: React.ReactNode): string {
  if (typeof children === "string") return children;
  if (Array.isArray(children)) {
    return children.map((c) => (typeof c === "string" ? c : "")).join("");
  }
  return "";
}

// Component overrides use `Components` from react-markdown so TS knows what
// props each override receives. We cast children through childrenToText to
// derive heading anchors that match the extractHeadings algorithm.
const MD_COMPONENTS: Components = {
  h1: ({ children, ...rest }) => (
    <h1
      id={slugifyHeading(childrenToText(children))}
      className="text-[26px] font-bold text-txt tracking-[-0.01em] mt-8 mb-4 first:mt-0"
      {...rest}
    >
      {children}
    </h1>
  ),
  h2: ({ children, ...rest }) => (
    <h2
      id={slugifyHeading(childrenToText(children))}
      className="text-[20px] font-semibold text-txt tracking-[-0.01em] mt-10 mb-3 pb-2 border-b border-edge scroll-mt-24"
      {...rest}
    >
      {children}
    </h2>
  ),
  h3: ({ children, ...rest }) => (
    <h3
      id={slugifyHeading(childrenToText(children))}
      className="text-[15px] font-semibold text-txt mt-6 mb-2 scroll-mt-24"
      {...rest}
    >
      {children}
    </h3>
  ),
  h4: ({ children, ...rest }) => (
    <h4 className="text-[13.5px] font-semibold text-txt mt-4 mb-2 uppercase tracking-[0.04em]" {...rest}>
      {children}
    </h4>
  ),
  p:  ({ children, ...rest }) => <p className="my-3" {...rest}>{children}</p>,
  a:  ({ children, href, ...rest }) => (
    <a
      href={href}
      className="text-acc underline decoration-acc-faint underline-offset-[3px] hover:decoration-acc"
      target={href?.startsWith("http") ? "_blank" : undefined}
      rel={href?.startsWith("http") ? "noreferrer noopener" : undefined}
      {...rest}
    >
      {children}
    </a>
  ),
  strong: ({ children, ...rest }) => <strong className="text-txt font-semibold" {...rest}>{children}</strong>,
  em:     ({ children, ...rest }) => <em className="italic text-txt-2" {...rest}>{children}</em>,
  ul: ({ children, ...rest }) => <ul className="my-3 pl-6 list-disc marker:text-txt-4" {...rest}>{children}</ul>,
  ol: ({ children, ...rest }) => <ol className="my-3 pl-6 list-decimal marker:text-txt-4" {...rest}>{children}</ol>,
  li: ({ children, ...rest }) => <li className="my-1 leading-[1.65]" {...rest}>{children}</li>,
  blockquote: ({ children, ...rest }) => (
    <blockquote className="my-4 pl-4 border-l-[3px] border-edge-2 text-txt-3 italic" {...rest}>
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-8 border-t border-edge" />,
  table: ({ children, ...rest }) => (
    <div className="my-4 overflow-x-auto rounded-[12px] border border-edge-2 bg-card-2">
      <table className="w-full border-collapse text-[12.5px]" {...rest}>{children}</table>
    </div>
  ),
  thead: ({ children, ...rest }) => <thead className="bg-card-3" {...rest}>{children}</thead>,
  th:    ({ children, ...rest }) => (
    <th className="text-left px-4 py-3 font-[var(--font-mono)] text-[8.5px] font-bold tracking-[0.14em] uppercase text-txt-4 border-b border-edge-2" {...rest}>
      {children}
    </th>
  ),
  tr: ({ children, ...rest }) => (
    <tr className="border-b border-edge last:border-b-0 hover:bg-card-3 transition-colors duration-75" {...rest}>
      {children}
    </tr>
  ),
  td: ({ children, ...rest }) => (
    <td className="px-4 py-3 text-txt-2 align-top leading-[1.55]" {...rest}>
      {children}
    </td>
  ),
  // react-markdown wraps every fenced block in a <pre>. Both our fenced
  // targets — <Callout> and <CodeBlock> — supply their own container, and the
  // outer <pre> only leaks `white-space: pre` + a monospace font down into the
  // callout body (long lines then clip instead of wrapping). Unwrap it.
  pre: ({ children }) => <>{children}</>,
  code: ({ className, children }) => {
    const langMatch = /language-(\S+)/.exec(className ?? "");
    const lang = langMatch?.[1] ?? "";
    const body = String(children).replace(/\n$/, "");

    // Callout fence — produced by preprocessCallouts.
    if (lang.startsWith("callout-")) {
      return <Callout kind={lang.slice("callout-".length)} body={body} />;
    }

    // Inline code (no language, no newlines).
    if (!lang && !body.includes("\n")) {
      return (
        <code className="font-[var(--font-mono)] text-[0.84em] text-acc bg-acc-faint px-[5px] py-[1px] rounded-[5px] whitespace-nowrap">
          {children}
        </code>
      );
    }

    // Fenced code block — pass to the app's shared CodeBlock component.
    return <CodeBlock lang={lang || "text"} body={body} />;
  },
};

export interface DocsRenderProps {
  /** Raw markdown source. Callouts are pre-processed; GFM is enabled. */
  markdown: string;
}

export function DocsRender({ markdown }: DocsRenderProps) {
  const preprocessed = useMemo(() => preprocessCallouts(markdown), [markdown]);

  return (
    <div className="docs-content flex flex-col gap-[8px] text-[13.5px] leading-[1.7] text-txt-2">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS}>
        {preprocessed}
      </ReactMarkdown>
    </div>
  );
}
