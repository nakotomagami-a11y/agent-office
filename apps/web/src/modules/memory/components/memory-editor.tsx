"use client";

import type { ReactNode } from "react";
import { CodeEditor } from "@/components/ui/code-editor";
import { Icon } from "@/components/ui/icon";
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
  scopeLabel?: ReactNode;
  /** Drop the inner CodeEditor's sheen frame — for when the editor sits inside another sheen surface (e.g. a modal). */
  frameless?: boolean;
};

export function MemoryEditor({
  value,
  onSave,
  label: _label,
  placeholder,
  rows = 14,
  saveLabel = "Save",
  savingLabel = "Saving…",
  savedLabel = "saved",
  resetLabel = "Reset",
  scopeLabel,
  frameless = false,
}: MemoryEditorProps) {
  const draft = useMemoryDraft({ initialValue: value, onSave });

  // The editor owns its own bounded scroll region (absolute inset-0) so the
  // action cluster can float over it — pinned bottom-right, always reachable
  // no matter how long the content is, instead of scrolling away below.
  return (
    <div className="relative flex-1 min-h-0">
      <div className="absolute inset-0 overflow-y-auto">
        <CodeEditor
          className="shrink-0 min-h-full"
          value={draft.draft}
          onChange={(v) => draft.setDraft(v)}
          placeholder={placeholder}
          minHeight={rows * 22}
          scopeLabel={scopeLabel}
          frameless={frameless}
          renderPreview={(md) => <DocsRender markdown={md} />}
        />
      </div>

      {/* Floaty actions — the wrapper is click-through; only the pills catch
          pointer events so the text under them stays selectable. */}
      <div className="absolute bottom-[16px] right-[18px] flex items-center gap-[10px] pointer-events-none">
        <span
          aria-live="polite"
          className="font-mono text-[10.5px] text-txt-4 whitespace-nowrap transition-opacity duration-200"
          style={{ opacity: draft.savedRecently ? 1 : 0 }}
        >
          {savedLabel}
        </span>
        {draft.isDirty && (
          <button
            type="button"
            onClick={() => draft.reset()}
            disabled={draft.isSaving}
            className="pointer-events-auto py-[10px] px-[16px] rounded-[13px] bg-card-2 border border-edge shadow-[var(--lift)] text-txt-2 text-[13px] font-semibold whitespace-nowrap cursor-pointer transition-colors duration-150 hover:text-txt disabled:opacity-50"
          >
            {resetLabel}
          </button>
        )}
        <button
          type="button"
          onClick={() => void draft.save()}
          disabled={!draft.isDirty || draft.isSaving}
          className="pointer-events-auto flex items-center gap-[7px] py-[10px] px-[18px] rounded-[13px] bg-[linear-gradient(120deg,var(--acc-cta),var(--acc-2))] text-white text-[13px] font-bold whitespace-nowrap cursor-pointer shadow-[0_14px_30px_-14px_rgba(139,123,255,0.95)] transition-transform duration-150 hover:-translate-y-[2px] disabled:opacity-50 disabled:pointer-events-none disabled:translate-y-0"
        >
          <Icon name="download" size={14} /> {draft.isSaving ? savingLabel : saveLabel}
        </button>
      </div>
    </div>
  );
}
