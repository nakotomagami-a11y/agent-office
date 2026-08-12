"use client";

import type React from "react";

/**
 * Tiny renderer for the description-preview markdown. Deliberately minimal —
 * headings, paragraphs, bullet lists, and inline code/bold/italic — because
 * the description field is short and we don't want to pull the whole
 * markdown-plus-remark bundle in for it.
 *
 * The `dangerouslySetInnerHTML` calls are safe because `inline()` escapes
 * `&`, `<`, and `>` before applying the inline formatters.
 */
export function MarkdownPreview({ md }: { md: string }) {
  const inline = (s: string) =>
    s
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\*([^*]+)\*/g, "<em>$1</em>");

  const out: React.ReactNode[] = [];
  let para: string[] = [];
  let list: string[] = [];

  const flushPara = () => {
    if (!para.length) return;
    out.push(<p key={out.length} dangerouslySetInnerHTML={{ __html: inline(para.join(" ")) }} />);
    para = [];
  };
  const flushList = () => {
    if (!list.length) return;
    out.push(
      <ul key={out.length}>
        {list.map((it, i) => (
          <li key={i} dangerouslySetInnerHTML={{ __html: inline(it) }} />
        ))}
      </ul>,
    );
    list = [];
  };

  for (const raw of md.split("\n")) {
    const ln = raw.trimEnd();
    if (renderLine(ln, out, flushList, flushPara, list, para, inline)) continue;
  }
  flushPara();
  flushList();
  return <>{out}</>;
}

function renderLine(
  ln: string,
  out: React.ReactNode[],
  flushList: () => void,
  flushPara: () => void,
  list: string[],
  para: string[],
  inline: (s: string) => string,
): boolean {
  if (/^# /.test(ln))   { flushList(); flushPara(); out.push(<h1 key={out.length} dangerouslySetInnerHTML={{ __html: inline(ln.slice(2)) }} />); return true; }
  if (/^## /.test(ln))  { flushList(); flushPara(); out.push(<h2 key={out.length} dangerouslySetInnerHTML={{ __html: inline(ln.slice(3)) }} />); return true; }
  if (/^### /.test(ln)) { flushList(); flushPara(); out.push(<h2 key={out.length} dangerouslySetInnerHTML={{ __html: inline(ln.slice(4)) }} />); return true; }
  if (/^[-*] /.test(ln)) { flushPara(); list.push(ln.slice(2)); return true; }
  if (!ln.trim()) { flushPara(); flushList(); return true; }
  flushList();
  para.push(ln);
  return true;
}
