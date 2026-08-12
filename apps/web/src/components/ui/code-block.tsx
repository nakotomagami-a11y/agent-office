"use client";

import { useState } from "react";
import { Icon } from "./icon";
import { highlight } from "./highlight";

export type CodeBlockProps = {
  body: string;
  lang?: string;
  title?: string;
  copyLabel?: string;
  copiedLabel?: string;
  wrap?: boolean;
};

export function CodeBlock({
  body,
  lang,
  title,
  copyLabel = "Copy",
  copiedLabel = "Copied",
  wrap = false,
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
    <pre className={`code-block font-mono text-[12.5px] leading-[1.65] rounded-[10px] ${wrap ? "overflow-x-hidden" : "overflow-x-auto"}`}>
      <div className="head">
        <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--code-head-fg)]">
          {lang ?? "code"}
        </span>
        {title && (
          <>
            <span className="text-[var(--code-head-faint)] select-none">/</span>
            <span className="text-[var(--code-head-muted)] text-[10px]">{title}</span>
          </>
        )}
        <span className="ml-auto text-[10px] text-[var(--code-head-faint)] font-mono mr-2 select-none">
          {lineCount} {lineCount === 1 ? "line" : "lines"}
        </span>
        <button type="button" className="cp" onClick={onCopy}>
          <Icon name={copied ? "check" : "copy"} size={11} />
          {copied ? copiedLabel : copyLabel}
        </button>
      </div>
      <code
        className={`block text-[var(--code-fg)] p-[14px_16px]${wrap ? " whitespace-pre-wrap break-words" : ""}`}
        dangerouslySetInnerHTML={{ __html: highlighted }}
      />
    </pre>
  );
}
