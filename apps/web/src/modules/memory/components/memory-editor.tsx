"use client";

import { CodeEditor } from "@/components/ui/code-editor";
import { Button } from "@/components/ui/button";
import { DocsRender } from "@/modules/docs/docs-render";
import { useMemoryDraft } from "../hooks/use-memory-draft";

export type MemoryEditorProps = {
  value: string;
  onSave: (content: string) => Promise<unknown> | unknown;
  label?: string;
  placeholder?: string;
  rows?: number;
  saveLabel?: string;
  savingLabel?: string;
  savedLabel?: string;
  resetLabel?: string;
};

export function MemoryEditor({
  value,
  onSave,
  label: _label,
  placeholder,
  rows = 14,
  saveLabel = "Save",
  savingLabel = "Saving…",
  savedLabel = "Saved.",
  resetLabel = "Reset",
}: MemoryEditorProps) {
  const draft = useMemoryDraft({ initialValue: value, onSave });

  // The editor owns its own bounded scroll region (absolute inset-0) so the
  // action cluster can float over it — pinned bottom-right, always reachable
  // no matter how long the content is, instead of scrolling away below.
  return (
    <div className="relative flex-1 min-h-0">
      <div className="absolute inset-0 overflow-y-auto p-[20px]">
        <CodeEditor
          className="shrink-0"
          value={draft.draft}
          onChange={(v) => draft.setDraft(v)}
          placeholder={placeholder}
          minHeight={rows * 22}
          renderPreview={(md) => <DocsRender markdown={md} />}
        />
      </div>

      {/* Floaty actions — the wrapper is click-through; only the pills catch
          pointer events so the text under them stays selectable. */}
      <div className="absolute bottom-4 right-5 flex items-center gap-2.5 pointer-events-none">
        <span
          aria-live="polite"
          className="text-[12px] text-[var(--done)] font-mono transition-opacity duration-200"
          style={{ opacity: draft.savedRecently ? 1 : 0 }}
        >
          {savedLabel}
        </span>
        {draft.isDirty && (
          <Button
            className="pointer-events-auto shadow-[0_3px_14px_rgba(0,0,0,.35)]"
            disabled={draft.isSaving}
            onClick={() => draft.reset()}
          >
            {resetLabel}
          </Button>
        )}
        <Button
          variant="primary"
          className="pointer-events-auto shadow-[0_3px_14px_rgba(0,0,0,.35)]"
          disabled={!draft.isDirty || draft.isSaving}
          onClick={() => {
            void draft.save();
          }}
        >
          {draft.isSaving ? savingLabel : saveLabel}
        </Button>
      </div>
    </div>
  );
}
