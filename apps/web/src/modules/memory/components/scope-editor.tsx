"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { Skeleton } from "@/components/ui/skeleton";
import { useMemory, isReadOnly, type MemoryScope } from "../hooks/use-memory";
import { MemoryEditor } from "./memory-editor";
import { scopeKey } from "../scope/scope";
import { CodeEditor } from "@/components/ui/code-editor";
import { DocsRender } from "@/modules/docs/docs-render";

type ScopeEditorProps = {
  scope: MemoryScope;
  onContentLoaded: (key: string, hasContent: boolean) => void;
};

export function ScopeEditor({ scope, onContentLoaded }: ScopeEditorProps) {
  const t = useTranslations("memory_page");
  const memory = useMemory(scope);

  useEffect(() => {
    if (!memory.isLoading) {
      onContentLoaded(scopeKey(scope), memory.content.trim().length > 0);
    }
  }, [memory.isLoading, memory.content, scope, onContentLoaded]);

  if (memory.isLoading) {
    return (
      <div className="flex flex-col gap-[6px] p-[20px]">
        <Skeleton width="80%" height={14} />
        <Skeleton width="60%" height={14} />
        <Skeleton width="70%" height={14} />
      </div>
    );
  }

  if (memory.loadError) {
    return (
      <div className="px-[14px] py-3 m-[20px] border border-status-error rounded-md text-[13px] bg-[color-mix(in_oklch,var(--error)_8%,transparent)] text-status-error">
        {memory.loadError.message}
      </div>
    );
  }

  if (isReadOnly(scope)) {
    // Skill / reference preview — no save path. Use the SAME framed CodeEditor
    // as the editable memory tiers (so it looks consistent, not a bare docs
    // blob), in read-only mode: opens on the Preview tab and injects the full
    // GFM renderer so headings, tables, and code fences format properly.
    return (
      <div className="relative flex-1 min-h-0">
        <div className="absolute inset-0 overflow-y-auto p-[20px]">
          {memory.content ? (
            <CodeEditor
              className="shrink-0"
              value={memory.content}
              onChange={() => {}}
              readOnly
              renderPreview={(md) => <DocsRender markdown={md} />}
            />
          ) : (
            <div className="text-txt-3 italic">{t("no_content")}</div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <MemoryEditor
        value={memory.content}
        onSave={memory.save}
        placeholder={t("no_content")}
      />
    </div>
  );
}
