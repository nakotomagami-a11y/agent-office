"use client";

import { useState } from "react";
import { highlight } from "./highlight";

export type CodeBlockProps = {
  body: string;
  lang?: string;
  title?: string;
  copyLabel?: string;
  copiedLabel?: string;
};

export function CodeBlock({
  body,
  lang,
  title,
  copyLabel = "Copy",
  copiedLabel = "Copied",
}: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(body);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  const highlighted = highlight(body, lang ?? "");
  const lineCount = body.split("\n").length;

  return (
    <pre className="code-block bg-[#1c1714] font-mono text-[12.5px] leading-[1.65] rounded-[10px] overflow-x-auto">
      <div className="head">
        <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-[#C7BFB7]">
          {lang ?? "code"}
        </span>
        {title && (
          <>
            <span className="text-[rgba(255,255,255,0.25)] select-none">/</span>
            <span className="text-[rgba(255,255,255,0.45)] text-[10px]">{title}</span>
          </>
        )}
        <span className="ml-auto text-[10px] text-[rgba(255,255,255,0.25)] font-mono mr-2 select-none">
          {lineCount} {lineCount === 1 ? "line" : "lines"}
        </span>
        <button type="button" className="cp" onClick={onCopy}>
          {copied ? (
            <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : (
            <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <rect x="9" y="9" width="13" height="13" rx="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
          )}
          {copied ? copiedLabel : copyLabel}
        </button>
      </div>
      <code
        className="block text-[#e8ddd5] p-[14px_16px]"
        dangerouslySetInnerHTML={{ __html: highlighted }}
      />
    </pre>
  );
}
