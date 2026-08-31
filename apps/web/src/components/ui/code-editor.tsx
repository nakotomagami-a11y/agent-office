"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/cn";
import { escapeHtml as esc } from "@/lib/markdown";

// ── Syntax highlight helpers (exported so other editors can reuse) ─────────────

/** Highlight inline markdown on an already-HTML-escaped string. */
function hlInline(s: string): string {
  s = s.replace(/`([^`]+)`/g, '<span style="color:var(--md-code)">`$1`</span>');
  s = s.replace(
    /\*\*([^*]+)\*\*/g,
    '<span style="opacity:.25">**</span><span style="font-weight:700">$1</span><span style="opacity:.25">**</span>',
  );
  s = s.replace(
    /(?<!\*)\*([^*\n]+)\*(?!\*)/g,
    '<span style="opacity:.25">*</span><em>$1</em><span style="opacity:.25">*</span>',
  );
  s = s.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '[<span style="color:var(--md-link)">$1</span>](<span class="text-txt-3">$2</span>)',
  );
  return s;
}

/**
 * Convert raw markdown text into a syntax-coloured HTML string.
 * Safe to use with dangerouslySetInnerHTML — all user content is HTML-escaped.
 */
export function highlightMd(text: string, accColor = "var(--acc)"): string {
  const lines = text.split("\n");
  let inFence = false;
  const out: string[] = [];

  for (const raw of lines) {
    if (/^```/.test(raw)) {
      inFence = !inFence;
      out.push(`<span style="color:${inFence ? "var(--md-fence)" : "var(--txt-3)"}">${esc(raw)}</span>`);
      continue;
    }
    if (inFence) { out.push(`<span style="color:var(--md-code)">${esc(raw)}</span>`); continue; }

    const e = esc(raw);
    let m: RegExpMatchArray | null;

    if ((m = e.match(/^(#{1,3} )(.*)/))) {
      const lvl = m[1]!.match(/#/g)!.length;
      out.push(
        `<span style="color:${accColor}">${m[1]}</span>` +
        `<span style="font-weight:700${lvl === 1 ? ";font-size:1.08em" : ""}">${hlInline(m[2]!)}</span>`,
      );
      continue;
    }
    if ((m = e.match(/^(> ?)(.*)/))) {
      out.push(
        `<span style="color:${accColor}">${m[1]}</span>` +
        `<span class="text-txt-2 italic">${hlInline(m[2]!)}</span>`,
      );
      continue;
    }
    if ((m = e.match(/^(\s*[-*] )(.*)/) ?? e.match(/^(\s*\d+\. )(.*)/))) {
      out.push(`<span style="color:${accColor}">${m[1]}</span>${hlInline(m[2]!)}`);
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

// ── Preview renderer (GitHub-style) ──────────────────────────────────────────

function inlinePrev(s: string): string {
  let r = esc(s);
  r = r.replace(
    /`([^`]+)`/g,
    (_, m: string) =>
      `<code style="font-family:var(--font-mono);font-size:.875em;background:var(--md-inline-bg);padding:2px 5px;border-radius:4px;color:var(--acc)">${m}</code>`,
  );
  r = r.replace(/\*\*([^*]+)\*\*/g, (_, m: string) => `<strong>${m}</strong>`);
  r = r.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, (_, m: string) => `<em>${m}</em>`);
  r = r.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    (_, text: string, href: string) =>
      `<a href="${esc(href)}" style="color:var(--md-link);text-decoration:underline">${text}</a>`,
  );
  return r;
}

function renderMd(md: string, emptyLabel: string): string {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let para: string[] = [], listItems: string[] = [], listOrdered = false, listStart = 1;
  let inFence = false, fenceLines: string[] = [];

  const flushPara = () => {
    if (!para.length) return;
    out.push(`<p style="margin:0 0 14px;line-height:1.65;color:var(--txt-2)">${inlinePrev(para.join(" "))}</p>`);
    para = [];
  };
  const flushList = () => {
    if (!listItems.length) return;
    const tag = listOrdered ? "ol" : "ul";
    const attr = listOrdered
      ? `style="margin:0 0 14px;padding-left:24px;color:var(--txt-2)" start="${listStart}"`
      : `style="margin:0 0 14px;padding-left:20px;color:var(--txt-2)"`;
    out.push(`<${tag} ${attr}>${listItems.map(it => `<li style="margin-bottom:4px;line-height:1.6">${inlinePrev(it)}</li>`).join("")}</${tag}>`);
    listItems = [];
  };
  const flushFence = () => {
    const code = fenceLines.map(esc).join("\n");
    out.push(`<pre style="margin:0 0 16px;padding:14px 16px;background:var(--md-pre-bg);border:1px solid var(--line);border-radius:8px;overflow-x:auto"><code style="font-family:var(--font-mono);font-size:12px;color:var(--md-code);line-height:1.6;display:block">${code}</code></pre>`);
    fenceLines = [];
  };

  for (const raw of lines) {
    if (/^```/.test(raw)) { if (!inFence) { flushPara(); flushList(); inFence = true; } else { inFence = false; flushFence(); } continue; }
    if (inFence) { fenceLines.push(raw); continue; }
    const ln = raw.trimEnd();
    if (/^(-{3,}|\*{3,})$/.test(ln)) { flushPara(); flushList(); out.push(`<hr style="margin:20px 0;border:0;border-top:1px solid var(--line-2)" />`); continue; }
    let m: RegExpMatchArray | null;
    if ((m = ln.match(/^#### (.*)/))) { flushPara(); flushList(); out.push(`<h4 style="font-size:14px;font-weight:700;margin:16px 0 6px;color:var(--txt)">${inlinePrev(m[1]!)}</h4>`); continue; }
    if ((m = ln.match(/^### (.*)/)))  { flushPara(); flushList(); out.push(`<h3 style="font-size:17px;font-weight:700;margin:22px 0 8px;color:var(--txt)">${inlinePrev(m[1]!)}</h3>`); continue; }
    if ((m = ln.match(/^## (.*)/)))   { flushPara(); flushList(); out.push(`<h2 style="font-size:21px;font-weight:700;margin:28px 0 12px;color:var(--txt);padding-bottom:8px;border-bottom:1px solid var(--line-2)">${inlinePrev(m[1]!)}</h2>`); continue; }
    if ((m = ln.match(/^# (.*)/)))    { flushPara(); flushList(); out.push(`<h1 style="font-size:28px;font-weight:800;margin:0 0 16px;color:var(--txt);padding-bottom:10px;border-bottom:1px solid var(--line-2)">${inlinePrev(m[1]!)}</h1>`); continue; }
    if ((m = ln.match(/^> ?(.*)/))) { flushPara(); flushList(); out.push(`<blockquote style="margin:0 0 14px;padding:8px 14px;border-left:3px solid var(--acc);color:var(--txt-2);font-style:italic">${inlinePrev(m[1]!)}</blockquote>`); continue; }
    if ((m = ln.match(/^[-*] (.*)/))) { flushPara(); if (listOrdered) flushList(); listOrdered = false; listItems.push(m[1]!); continue; }
    if ((m = ln.match(/^(\d+)\. (.*)/))) { flushPara(); if (!listOrdered) { flushList(); listStart = parseInt(m[1]!, 10); } listOrdered = true; listItems.push(m[2]!); continue; }
    if (!ln) { flushPara(); flushList(); continue; }
    flushList(); para.push(ln);
  }
  flushPara(); flushList();
  if (inFence) flushFence();
  return out.join("") || `<p class="m-0 text-txt-4 italic">${esc(emptyLabel)}</p>`;
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
   * Optional preview renderer. When provided, the Preview tab renders this
   * instead of the built-in inline-styled `renderMd`. Lets callers inject a
   * richer markdown renderer (e.g. full GFM with tables) without CodeEditor
   * depending on app modules.
   */
  renderPreview?: (value: string) => React.ReactNode;
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

// These styles are applied identically to both the <pre> and <textarea>
// so their character grid aligns pixel-perfectly. Left padding reserves the
// gutter column (plus the small text gap); the numbers live in that same
// padding, positioned back toward the gutter's left edge (see preHtml).
const LAYER: React.CSSProperties = {
  position: "absolute",
  top: 0, right: 0, bottom: 0, left: 0,
  margin: 0,
  padding: `12px 14px 12px ${TEXT_PAD_PX}px`,
  fontFamily: "var(--font-mono)",
  fontSize: "12.5px",
  lineHeight: "1.6",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  overflowWrap: "break-word",
  tabSize: 2,
  overflow: "hidden",
};

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
        `<div style="position:relative">` +
        `<span style="position:absolute;left:-${TEXT_PAD_PX - 8}px;width:${GUTTER_PX - 18}px;text-align:right;font-size:11px;line-height:${LINE_PX}px;color:var(--txt-3)">${i + 1}</span>` +
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
            className="text-txt pointer-events-none"
            style={{ ...LAYER, zIndex: 0 }}
          />
          <textarea
            ref={taRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            readOnly={readOnly}
            spellCheck={false}
            style={{
              ...LAYER,
              zIndex: 1,
              color: "transparent",
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              WebkitTextFillColor: "transparent" as any,
              caretColor: "var(--txt)",
              background: "transparent",
              border: "none",
              outline: "none",
              resize: "none",
            }}
          />
        </div>
      ) : renderPreview ? (
        <div style={{ minHeight, padding: "18px 22px", overflow: "auto" }}>
          {renderPreview(value)}
        </div>
      ) : (
        <div
          style={{ minHeight, padding: "18px 22px", overflow: "auto" }}
          dangerouslySetInnerHTML={{ __html: renderMd(value, t("nothing_to_preview")) }}
        />
      )}
    </div>
  );
}
