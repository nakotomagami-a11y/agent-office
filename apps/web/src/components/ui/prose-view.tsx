"use client";

import React from "react";
import { CodeBlock } from "./code-block";
import { splitProse, escapeHtml, type ProseItem } from "@/lib/markdown";

function inlineMd(s: string): string {
  return escapeHtml(s)
    .replace(/`([^`]+)`/g, '<code class="px-[4px] py-[1px] rounded-[4px] bg-[var(--md-inline-bg)] text-[var(--code-inline-fg)] font-mono text-[0.9em]">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");
}

function Prose({ items }: { items: ProseItem[] }) {
  const out: React.ReactNode[] = [];
  let paraBuf: string[] = [];
  let listBuf: string[] = [];

  const flushPara = (key: string) => {
    if (!paraBuf.length) return;
    out.push(
      <p key={key} className="mb-[10px] last:mb-0 text-txt leading-[1.65]"
        dangerouslySetInnerHTML={{ __html: inlineMd(paraBuf.join(" ")) }} />,
    );
    paraBuf = [];
  };
  const flushList = (key: string) => {
    if (!listBuf.length) return;
    out.push(
      <ul key={key} className="mb-[12px] pl-[20px] list-disc">
        {listBuf.map((it, i) => (
          <li key={i} className="mb-[3px] text-txt leading-[1.65]"
            dangerouslySetInnerHTML={{ __html: inlineMd(it) }} />
        ))}
      </ul>,
    );
    listBuf = [];
  };

  items.forEach((item, idx) => {
    const k = `n${idx}`;
    if (typeof item === "object" && item.type === "code") {
      flushPara(`p${k}`); flushList(`l${k}`);
      out.push(<div key={k} className="my-[10px]"><CodeBlock body={item.body} lang={item.lang} /></div>);
      return;
    }
    const ln = item as string;
    if (/^#{1,3}\s+/.test(ln)) {
      flushPara(`p${k}`); flushList(`l${k}`);
      const level = (ln.match(/^#+/) ?? [""])[0].length;
      const content = ln.replace(/^#+\s+/, "");
      const cls = level === 1
        ? "text-[15px] font-bold text-txt mt-[20px] mb-[8px] first:mt-0"
        : level === 2
          ? "text-[14px] font-semibold text-txt mt-[16px] mb-[6px] first:mt-0"
          : "text-[13.5px] font-semibold text-txt-2 mt-[12px] mb-[4px] first:mt-0";
      out.push(<p key={k} className={cls} dangerouslySetInnerHTML={{ __html: inlineMd(content) }} />);
      return;
    }
    if (/^[-*]\s+/.test(ln)) { flushPara(`p${k}`); listBuf.push(ln.replace(/^[-*]\s+/, "")); return; }
    if (/^\d+\.\s+/.test(ln)) { flushPara(`p${k}`); listBuf.push(ln.replace(/^\d+\.\s+/, "")); return; }
    if (ln.trim() === "") { flushPara(`p${k}`); flushList(`l${k}`); return; }
    flushList(`l${k}`);
    paraBuf.push(ln);
  });

  flushPara("pf"); flushList("lf");
  return <>{out}</>;
}

export function ProseView({ body }: { body: string }) {
  const items = splitProse(body);
  return (
    <div className="text-[13px] text-txt">
      <Prose items={items} />
    </div>
  );
}
