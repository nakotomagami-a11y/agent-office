"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/cn";
import { escapeHtml as esc } from "@/lib/markdown";

// ── Syntax highlight helpers ─────────────────────────────────────────────────
//
// These build an HTML string for the "Write" tab's highlight layer (see the
// two-layer overlay in the component below). Colour/weight/style come from
// Tailwind token classes — `text-acc`, `text-[var(--md-code)]`, etc. — the
// same convention `code-block.tsx`/`highlight.ts` use for their `.hl-*`
// tokens, so theme changes apply here for free. All source text is
// HTML-escaped via `esc` before interpolation.

/** Highlight inline markdown on an already-HTML-escaped string. */
function hlInline(s: string): string {
  s = s.replace(/`([^`]+)`/g, '<span class="text-[var(--md-code)]">`$1`</span>');
  s = s.replace(
    /\*\*([^*]+)\*\*/g,
    '<span class="opacity-25">**</span><span class="font-bold">$1</span><span class="opacity-25">**</span>',
  );
  s = s.replace(
    /(?<!\*)\*([^*\n]+)\*(?!\*)/g,
    '<span class="opacity-25">*</span><em>$1</em><span class="opacity-25">*</span>',
  );
  s = s.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '[<span class="text-[var(--md-link)]">$1</span>](<span class="text-txt-3">$2</span>)',
  );
  return s;
}

/**
 * Convert raw markdown text into a syntax-coloured HTML string.
 * Safe to use with dangerouslySetInnerHTML — all user content is HTML-escaped.
 */
export function highlightMd(text: string): string {
  const lines = text.split("\n");
  let inFence = false;
  const out: string[] = [];

  for (const raw of lines) {
    if (/^```/.test(raw)) {
      inFence = !inFence;
      out.push(`<span class="${inFence ? "text-[var(--md-fence)]" : "text-txt-3"}">${esc(raw)}</span>`);
      continue;
    }
    if (inFence) { out.push(`<span class="text-[var(--md-code)]">${esc(raw)}</span>`); continue; }

    const e = esc(raw);
    let m: RegExpMatchArray | null;

    if ((m = e.match(/^(#{1,3} )(.*)/))) {
      const lvl = m[1]!.match(/#/g)!.length;
      out.push(
        `<span class="text-acc">${m[1]}</span>` +
        `<span class="font-bold${lvl === 1 ? " text-[length:1.08em]" : ""}">${hlInline(m[2]!)}</span>`,
      );
      continue;
    }
    if ((m = e.match(/^(> ?)(.*)/))) {
      out.push(
        `<span class="text-acc">${m[1]}</span>` +
        `<span class="text-txt-2 italic">${hlInline(m[2]!)}</span>`,
      );
      continue;
    }
    if ((m = e.match(/^(\s*[-*] )(.*)/) ?? e.match(/^(\s*\d+\. )(.*)/))) {
      out.push(`<span class="text-acc">${m[1]}</span>${hlInline(m[2]!)}`);
      continue;
    }
    if (/^-{3,}$/.test(raw.trim())) {
      out.push(`<span class="text-line-strong">${e}</span>`);
      continue;
    }

    out.push(hlInline(e));
  }

  return out.join("\n") + "\n"; // trailing \n keeps caret visible after last line
}

// ── Component ─────────────────────────────────────────────────────────────────

export type CodeEditorProps = {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  minHeight?: number;
  lang?: string;
  showPreview?: boolean;
  className?: string;
  /**
   * Renders the Preview tab's content. CodeEditor is a `components/ui`
   * primitive and doesn't know about app-level markdown rendering, so
   * callers supply their own renderer — typically `DocsRender` (react-markdown
   * + remark-gfm) from `@/modules/docs/docs-render`.
   */
  renderPreview: (value: string) => React.ReactNode;
  /**
   * Read-only view: the textarea can't be edited, and the editor opens on the
   * Preview tab (formatted) by default. Keeps the same framed chrome so a
   * read-only doc/skill looks identical to the editable memory editors.
   */
  readOnly?: boolean;
  /** Optional mono label rendered in the toolbar, between the tabs and the meta (e.g. a file path). */
  scopeLabel?: React.ReactNode;
  /**
   * Drop the editor's own `surface-sheen` frame (border, rounding, lift
   * shadow). Use when the editor sits directly inside another sheen surface —
   * e.g. a modal — so the corner sheen highlight doesn't render twice.
   */
  frameless?: boolean;
};

// px per logical line: 12.5px font-size × 1.6 line-height = 20px
const LINE_PX = 20;
const PAD_PX  = 24; // 12px top + 12px bottom
const GUTTER_PX = 44; // width of the visual gutter band (background + border)
const TEXT_PAD_PX = GUTTER_PX + 8; // where text starts — a small gap past the gutter's border, not flush against it

// Applied identically to both the <pre> and <textarea> so their character
// grid aligns pixel-perfectly — every property here is a fixed literal, so
// it lives in Tailwind classes rather than a style object. Only the left
// padding depends on a runtime constant (TEXT_PAD_PX); that's the one value
// that stays inline (see LAYER_STYLE below).
const LAYER_CLASS =
  "absolute inset-0 m-0 pt-[12px] pr-[14px] pb-[12px] font-mono text-[12.5px] leading-[1.6] " +
  "whitespace-pre-wrap break-words [word-break:break-word] [tab-size:2] overflow-hidden";

// Left padding reserves the gutter column (plus the small text gap); the
// line numbers live in that same padding, positioned back toward the
// gutter's left edge (see preHtml).
const LAYER_STYLE: React.CSSProperties = { paddingLeft: TEXT_PAD_PX };

export function CodeEditor({
  value,
  onChange,
  placeholder,
  minHeight = 220,
  lang = "markdown",
  showPreview = true,
  className,
  renderPreview,
  readOnly = false,
  scopeLabel,
  frameless = false,
}: CodeEditorProps) {
  const t = useTranslations("common.code_editor");
  const [view, setView] = useState<"write" | "preview">(readOnly ? "preview" : "write");
  const taRef = useRef<HTMLTextAreaElement>(null);
  const [measuredH, setMeasuredH] = useState(0);
  const lines   = value.split("\n");
  // The logical-line estimate (lines × LINE_PX) undercounts when long lines
  // soft-wrap, which clipped the bottom of wrapped content in Write view (the
  // textarea's overflow is hidden and the container height is fixed). Measure
  // the textarea's true scrollHeight and grow to whichever is larger.
  const editorH = Math.max(minHeight, lines.length * LINE_PX + PAD_PX, measuredH);

  useEffect(() => {
    const ta = taRef.current;
    if (view !== "write" || !ta) return;
    const measure = () => setMeasuredH(ta.scrollHeight);
    measure();
    // Re-measure when the textarea's width changes (wrapping shifts) or content
    // grows — ResizeObserver covers panel/window resizes the deps miss.
    const ro = new ResizeObserver(measure);
    ro.observe(ta);
    return () => ro.disconnect();
  }, [value, view]);

  // When empty, the <pre> layer renders the placeholder so the transparent
  // textarea doesn't need to show its own (which can't be coloured reliably
  // when -webkit-text-fill-color is transparent).
  //
  // highlightMd emits one entry per source line (no internal newlines), joined
  // by "\n" with a trailing "\n". We split it back to per-line HTML and wrap
  // each line in a block that carries its own number, absolutely positioned in
  // the reserved left padding. Because the numbers ride the same wrapping flow
  // as the text, they stay aligned with wrapped lines and always reach the
  // bottom — unlike a fixed-line-height gutter column.
  const htmlLines = value
    ? highlightMd(value).replace(/\n$/, "").split("\n")
    : [placeholder ? `<span class="text-txt-3">${esc(placeholder)}</span>` : "&nbsp;"];
  const preHtml = htmlLines
    .map(
      (h, i) =>
        `<div class="relative">` +
        `<span class="absolute text-right text-[11px] text-txt-3" style="left:-${TEXT_PAD_PX - 8}px;width:${GUTTER_PX - 18}px;line-height:${LINE_PX}px">${i + 1}</span>` +
        (h || "&nbsp;") +
        `</div>`,
    )
    .join("");

  return (
    <div className={cn("flex flex-col overflow-hidden", frameless ? "" : "rounded-[22px] surface-sheen shadow-[var(--lift)]", className)}>
      {/* ── Toolbar ── */}
      <div className="flex items-center gap-[12px] px-[16px] py-[12px] border-b border-edge shrink-0">
        {showPreview && (
          <div className="flex items-center gap-[2px] p-[3px] rounded-[12px] bg-card-2 border border-edge shadow-[var(--inset-hi)] shrink-0">
            <button type="button" onClick={() => setView("write")}
              className={cn("py-[6px] px-[14px] rounded-[9px] text-[12px] font-semibold whitespace-nowrap cursor-pointer transition-all duration-150",
                view === "write" ? "bg-card text-txt shadow-[var(--inset-hi),0_0_0_1px_var(--edge)]" : "text-txt-3 hover:text-txt")}>
              {t("write_tab")}
            </button>
            <button type="button" onClick={() => setView("preview")}
              className={cn("py-[6px] px-[14px] rounded-[9px] text-[12px] font-semibold whitespace-nowrap cursor-pointer transition-all duration-150",
                view === "preview" ? "bg-card text-txt shadow-[var(--inset-hi),0_0_0_1px_var(--edge)]" : "text-txt-3 hover:text-txt")}>
              {t("preview_tab")}
            </button>
          </div>
        )}
        {scopeLabel ? (
          <span className="font-mono text-[10.5px] text-txt-4 whitespace-nowrap truncate min-w-0">{scopeLabel}</span>
        ) : null}
        <span className="flex-1" />
        <span className="font-mono text-[10.5px] text-txt-4 whitespace-nowrap shrink-0">
          {value.length > 0
            ? t("char_count", { count: value.length.toLocaleString(), tokens: Math.round(value.length / 4) })
            : t("empty")}
        </span>
        <span className="font-mono text-[10px] text-txt-3 bg-card-2 border border-edge py-[3px] px-[8px] rounded-full whitespace-nowrap shrink-0">
          {lang}
        </span>
      </div>

      {view === "write" ? (
        /*
         * Overlay stack
         * ─────────────
         * A full-height gutter band sits behind the <pre>; the line numbers
         * themselves live inside the <pre>'s reserved left padding (see
         * preHtml) so they ride the same wrapping flow as the text — staying
         * aligned with wrapped lines and always reaching the bottom.
         *
         * <pre>      z:0  – renders the syntax-coloured HTML + numbers (visual)
         * <textarea> z:1  – transparent text + caret, handles all interaction
         *
         * Both are position:absolute filling the same box with identical
         * font/padding so their characters align. -webkit-text-fill-color is
         * used alongside color:transparent because some browsers honour
         * fill-color for textarea text even when `color` is transparent.
         */
        <div className="relative flex-1" style={{ minHeight: editorH }}>
          {/* Gutter fill is a token (--ao-gutter), not flat black, so it stays
              legible per-theme. */}
          <div
            aria-hidden
            className="absolute left-0 top-0 bottom-0 w-[44px] bg-[var(--ao-gutter)] border-r border-r-edge pointer-events-none"
          />
          <pre
            aria-hidden
            dangerouslySetInnerHTML={{ __html: preHtml }}
            className={cn(LAYER_CLASS, "z-0 text-txt pointer-events-none")}
            style={LAYER_STYLE}
          />
          <textarea
            ref={taRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            readOnly={readOnly}
            spellCheck={false}
            className={cn(LAYER_CLASS, "z-[1] text-transparent caret-[var(--txt)] bg-transparent border-none outline-none resize-none")}
            // WebkitTextFillColor isn't in React's CSSProperties type and has no
            // Tailwind utility. Some browsers honour it over `color` for textarea
            // text, so `text-transparent` alone isn't enough to hide the
            // (redundant, since the <pre> shows the highlighted text) native glyphs.
            style={{ ...LAYER_STYLE, WebkitTextFillColor: "transparent" } as React.CSSProperties}
          />
        </div>
      ) : (
        <div className="px-[22px] py-[18px] overflow-auto" style={{ minHeight }}>
          {renderPreview(value)}
        </div>
      )}
    </div>
  );
}
