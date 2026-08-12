"use client";

import { CodeEditor } from "@/components/ui/code-editor";
import { Button } from "@/components/ui/button";
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
}: MemoryEditorProps) {
  const draft = useMemoryDraft({ initialValue: value, onSave });

  return (
    <div className="flex flex-col gap-2.5">
      <CodeEditor
        value={draft.draft}
        onChange={(v) => draft.setDraft(v)}
        placeholder={placeholder}
        minHeight={rows * 22}
      />
      <div className="flex items-center justify-end gap-2.5">
        <span
          aria-live="polite"
          className="text-[12px] text-[var(--done)] font-mono min-h-[16px] transition-opacity duration-200"
          style={{ opacity: draft.savedRecently ? 1 : 0 }}
        >
          {savedLabel}
        </span>
        <Button
          variant="primary"
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
