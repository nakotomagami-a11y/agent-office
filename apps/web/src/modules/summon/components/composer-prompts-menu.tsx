"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/cn";

export type ComposerPromptItem = { title: string; body: string };

export type ComposerPromptsMenuProps = {
  filtered: ComposerPromptItem[];
  activeIdx: number;
  onHover: (idx: number) => void;
  onPick: (body: string) => void;
};

/**
 * Auto-complete popover for saved prompts. Rendered above the composer
 * textarea when the user's input starts with `/` and matches nothing in
 * the slash-command menu.
 */
export function ComposerPromptsMenu({ filtered, activeIdx, onHover, onPick }: ComposerPromptsMenuProps): React.ReactElement {
  const t = useTranslations();
  return (
    <div
      className="absolute bg-[var(--bg-1)] border border-[var(--line)] bottom-[calc(100%+8px)] left-0 right-0 max-w-full max-h-[200px] rounded-[10px] shadow-[0_2px_6px_rgba(40,30,25,0.06),0_8px_24px_rgba(40,30,25,0.08)] p-1 z-[20] overflow-y-auto"
      role="listbox"
      aria-label={t("composer.saved_prompts_aria")}
    >
      {filtered.length === 0 ? (
        <div className="text-txt-3 px-3 py-[10px] text-[12px]">{t("composer.saved_prompts_empty")}</div>
      ) : (
        filtered.map((p, i) => (
          <button
            key={p.body}
            type="button"
            role="option"
            aria-selected={i === activeIdx}
            className={cn(
              "cursor-pointer flex flex-col items-start gap-0.5 px-[10px] py-2 rounded-[6px] w-full",
              i === activeIdx ? "bg-[var(--bg-2)]" : "hover:bg-[var(--bg-2)]",
            )}
            onMouseEnter={() => onHover(i)}
            onClick={() => onPick(p.body)}
          >
            <span className="font-semibold text-txt text-[12px]">{p.title}</span>
            <span className="text-[var(--txt-2)] text-[12px]">
              {p.body.length > 60 ? p.body.slice(0, 57) + "…" : p.body}
            </span>
          </button>
        ))
      )}
    </div>
  );
}
