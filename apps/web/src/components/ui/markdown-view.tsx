"use client";

import { memo, type ReactElement, type ReactNode } from "react";
import renderMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { openExternalUrl } from "@/lib/tauri-window";
import { safeLinkHref } from "@/lib/markdown";
import { CodeBlock } from "./code-block";

export type RenderCode = (lang: string, body: string) => ReactNode;

const REMARK_PLUGINS = [remarkGfm];

function textOf(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  const n = node as { type?: string; value?: string; children?: unknown[] };
  if (n.type === "text") return n.value ?? "";
  return (n.children ?? []).map(textOf).join("");
}

function langOf(node: unknown): string {
  const code = (node as { children?: Array<{ properties?: { className?: unknown } }> })?.children?.[0];
  const cls = code?.properties?.className;
  const first = Array.isArray(cls) ? String(cls.find((c) => String(c).startsWith("language-")) ?? "") : "";
  return first.replace(/^language-/, "");
}

// `target=_blank` is a no-op in the desktop webview, so every link goes through the system opener.
function ExternalAnchor({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" onClick={(e) => { e.preventDefault(); void openExternalUrl(href); }}>
      {children}
    </a>
  );
}

const defaultRenderCode: RenderCode = (lang, body) => (
  <div className="my-[10px]"><CodeBlock body={body} lang={lang || undefined} /></div>
);

function buildComponents(renderCode: RenderCode): Components {
  return {
    pre: ({ node }) => <>{renderCode(langOf(node), textOf(node).replace(/\n$/, ""))}</>,
    a: ({ href, children }) => (href ? <ExternalAnchor href={href}>{children}</ExternalAnchor> : <span>{children}</span>),
    // Thumbnails come from ImageStrip; an inline <img> would load remote URLs inside the prose.
    img: ({ src, alt }) => (typeof src === "string" && src ? <ExternalAnchor href={src}>{alt || src}</ExternalAnchor> : <span>{alt}</span>),
    table: ({ children }) => (
      <div className="my-[10px] overflow-x-auto rounded-[10px] border border-line">
        <table className="ao-table w-full border-collapse text-[13px]">{children}</table>
      </div>
    ),
  };
}

// A new components map is a new element type per tag, which remounts every code block each frame.
const componentsByRenderer = new WeakMap<RenderCode, Components>();
function componentsFor(renderCode: RenderCode): Components {
  let components = componentsByRenderer.get(renderCode);
  if (!components) {
    components = buildComponents(renderCode);
    componentsByRenderer.set(renderCode, components);
  }
  return components;
}

export type MarkdownViewProps = {
  text: string;
  /** Overrides how fenced code renders (the chat streams plain text, then highlights). */
  renderCode?: RenderCode;
};

// Parsing costs ~4 ms per KB, so reopening a chat re-parsed every visible message. The element tree
// is immutable and depends only on the text and renderer, so it can be reused across mounts.
const RENDER_CACHE_MAX = 300;
const renderCache = new WeakMap<RenderCode, Map<string, ReactElement>>();

function renderCached(text: string, renderCode: RenderCode): ReactElement {
  let byText = renderCache.get(renderCode);
  if (!byText) renderCache.set(renderCode, (byText = new Map()));
  const hit = byText.get(text);
  if (hit) {
    byText.delete(text);
    byText.set(text, hit);
    return hit;
  }
  const element = renderMarkdown({ children: text, remarkPlugins: REMARK_PLUGINS, urlTransform: safeLinkHref, components: componentsFor(renderCode) });
  byText.set(text, element);
  if (byText.size > RENDER_CACHE_MAX) byText.delete(byText.keys().next().value!);
  return element;
}

/** GFM markdown; only absolute http(s)/mailto links survive, and raw HTML is never rendered. */
export const MarkdownView = memo(function MarkdownView({ text, renderCode }: MarkdownViewProps) {
  return renderCached(text, renderCode ?? defaultRenderCode);
});
