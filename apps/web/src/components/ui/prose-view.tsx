"use client";

import { MarkdownView } from "./markdown-view";

export function ProseView({ body }: { body: string }) {
  return (
    <div className="ao-prose ao-prose-sm">
      <MarkdownView text={body} />
    </div>
  );
}
