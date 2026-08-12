"use client";

import { useState } from "react";
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
    '[<span style="color:var(--md-link)">$1</span>](<span style="color:var(--txt-3)">$2</span>)',
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
        `<span style="color:var(--txt-2);font-style:italic">${hlInline(m[2]!)}</span>`,
      );
      continue;
    }
    if ((m = e.match(/^(\s*[-*] )(.*)/) ?? e.match(/^(\s*\d+\. )(.*)/))) {
      out.push(`<span style="color:${accColor}">${m[1]}</span>${hlInline(m[2]!)}`);
      continue;
    }
    if (/^-{3,}$/.test(raw.trim())) {
      out.push(`<span style="color:var(--line-strong)">${e}</span>`);
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

function renderMd(md: string): string {
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
  return out.join("") || `<p style="margin:0;color:var(--txt-4);font-style:italic">Nothing to preview.</p>`;
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
};

// px per logical line: 12.5px font-size × 1.6 line-height = 20px
const LINE_PX = 20;
const PAD_PX  = 24; // 12px top + 12px bottom

// These styles are applied identically to both the <pre> and <textarea>
// so their character grid aligns pixel-perfectly.
const LAYER: React.CSSProperties = {
  position: "absolute",
  top: 0, right: 0, bottom: 0, left: 0,
  margin: 0,
  padding: "12px 14px",
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
}: CodeEditorProps) {
  const [view, setView] = useState<"write" | "preview">("write");
  const lines   = value.split("\n");
  const editorH = Math.max(minHeight, lines.length * LINE_PX + PAD_PX);

  // When empty, the <pre> layer renders the placeholder so the transparent
  // textarea doesn't need to show its own (which can't be coloured reliably
  // when -webkit-text-fill-color is transparent).
  const preHtml = value
    ? highlightMd(value)
    : placeholder
    ? `<span style="color:var(--txt-3)">${esc(placeholder)}</span>\n`
    : "\n";

  return (
    <div className={cn("flex flex-col overflow-hidden border border-line rounded-[var(--r-md)] bg-bg-2", className)}>
      {/* ── Toolbar ── */}
      <div className="flex items-center gap-[2px] px-[6px] py-[5px] bg-bg-3 border-b border-line shrink-0">
        {showPreview && (
          <>
            <button type="button" onClick={() => setView("write")}
              className={cn("inline-flex items-center px-[10px] py-[4px] rounded-[5px] font-[var(--font-mono)] text-[11.5px] transition-[background,color] duration-[100ms]",
                view === "write" ? "bg-bg-2 text-txt shadow-[0_1px_2px_rgba(0,0,0,.18)]" : "text-txt-3 hover:text-txt-2")}>
              Write
            </button>
            <button type="button" onClick={() => setView("preview")}
              className={cn("inline-flex items-center px-[10px] py-[4px] rounded-[5px] font-[var(--font-mono)] text-[11.5px] transition-[background,color] duration-[100ms]",
                view === "preview" ? "bg-bg-2 text-txt shadow-[0_1px_2px_rgba(0,0,0,.18)]" : "text-txt-3 hover:text-txt-2")}>
              Preview
            </button>
          </>
        )}
        <div className="ml-auto flex items-center gap-[10px]">
          <span className="font-[var(--font-mono)] text-[10.5px] text-[var(--txt-3)]">
            {value.length > 0 ? `${value.length.toLocaleString()} chars · ~${Math.round(value.length / 4)} tokens` : "empty"}
          </span>
          <span className="font-[var(--font-mono)] text-[10px] text-[var(--txt-3)] bg-[var(--bg-1)] border border-[var(--line)] px-[6px] py-[1px] rounded-[4px]">
            {lang}
          </span>
        </div>
      </div>

      {view === "write" ? (
        <div className="flex" style={{ height: editorH }}>
          {/* ── Gutter ── */}
          <div
            aria-hidden
            /* Gutter fill is a token, not a flat 15% black: on the dark
               theme that wash is a subtle inset, but over a light editor it
               renders as a mid-grey band that drags the line numbers down to
               2.6:1. --ao-gutter carries a per-theme value. */
            className="w-[44px] shrink-0 bg-[var(--ao-gutter)] border-r border-r-[var(--line)] pt-[12px] pb-[12px] pl-[8px] pr-[10px] font-[var(--font-mono)] text-[11.5px] leading-[1.6] text-right text-[var(--txt-3)] select-none"
          >
            {lines.map((_, i) => <div key={i}>{i + 1}</div>)}
          </div>

          {/*
           * Overlay stack
           * ─────────────
           * Both <pre> and <textarea> are position:absolute filling the same
           * container, with identical font/padding so their characters align.
           *
           * <pre>      z:0  – renders the syntax-coloured HTML (visual only)
           * <textarea> z:1  – transparent text + caret, handles all interaction
           *
           * -webkit-text-fill-color is used alongside color:transparent because
           * some browsers honour fill-color for textarea text rendering even
           * when the inherited `color` property is transparent.
           */}
          <div className="relative flex-1 min-w-0">
            <pre
              aria-hidden
              dangerouslySetInnerHTML={{ __html: preHtml }}
              className="text-txt pointer-events-none"
              style={{ ...LAYER, zIndex: 0 }}
            />
            <textarea
              value={value}
              onChange={(e) => onChange(e.target.value)}
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
        </div>
      ) : (
        <div
          style={{ minHeight, padding: "18px 22px", overflow: "auto" }}
          dangerouslySetInnerHTML={{ __html: renderMd(value) }}
        />
      )}
    </div>
  );
}
