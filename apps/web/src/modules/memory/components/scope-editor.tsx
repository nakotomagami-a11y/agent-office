"use client";

import { useEffect } from "react";
import { match } from "ts-pattern";
import { useTranslations } from "next-intl";
import { useMemory, isReadOnly, type MemoryScope } from "../hooks/use-memory";
import { MemoryEditor } from "./memory-editor";
import { scopeKey } from "../scope/scope";
import { CodeEditor } from "@/components/ui/code-editor";
import { DocsRender } from "@/modules/docs/docs-render";
import { SkillSectionsPanel } from "./skill-sections-panel";

type ScopeEditorProps = {
  scope: MemoryScope;
  onContentLoaded: (key: string, hasContent: boolean) => void;
};

/** Display-only path label — mirrors the real on-disk layout documented in
 *  `packages/domain/src/services/infra/paths.ts`, not a live filesystem read. */
function pathLabelFor(scope: MemoryScope): string {
  return match(scope)
    .with({ kind: "global" }, () => "~/.claude/agents/_global.memory.md")
    .with({ kind: "project" }, (s) => `~/.claude/projects/${s.id}/project.md`)
    .with({ kind: "agent" }, (s) => `~/.claude/agents/${s.id}.memory.md`)
    .with({ kind: "agent-skill" }, (s) => `~/.claude/agents/_skills/${s.skillSlug}/SKILL.md`)
    .exhaustive();
}

export function ScopeEditor({ scope, onContentLoaded }: ScopeEditorProps) {
  const t = useTranslations("memory_page");
  const memory = useMemory(scope);

  useEffect(() => {
    if (!memory.isLoading) {
      onContentLoaded(scopeKey(scope), memory.content.trim().length > 0);
    }
  }, [memory.isLoading, memory.content, scope, onContentLoaded]);

  if (memory.isLoading) return null;

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
          {scope.kind === "agent-skill" && <SkillSectionsPanel slug={scope.skillSlug} />}
          {memory.content ? (
            <CodeEditor
              className="shrink-0"
              value={memory.content}
              onChange={() => {}}
              readOnly
              scopeLabel={pathLabelFor(scope)}
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
        scopeLabel={pathLabelFor(scope)}
      />
    </div>
  );
}
