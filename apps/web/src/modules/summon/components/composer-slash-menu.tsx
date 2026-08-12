"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/cn";
import type { SlashCommand } from "../format/composer-config";

export type ComposerSlashMenuProps = {
  filtered: SlashCommand[];
  activeIdx: number;
  onHover: (idx: number) => void;
  onPick: (cmd: string) => void;
};

/**
 * Auto-complete popover for `/` slash commands. Rendered above the composer
 * textarea when the user's input starts with `/`.
 */
export function ComposerSlashMenu({ filtered, activeIdx, onHover, onPick }: ComposerSlashMenuProps): React.ReactElement | null {
  const t = useTranslations();
  if (filtered.length === 0) return null;
  return (
    <div
      className="absolute bg-[var(--bg-1)] border border-[var(--line)] bottom-[calc(100%+8px)] left-[24px] right-[24px] max-w-[380px] rounded-[10px] shadow-[0_2px_6px_rgba(40,30,25,0.06),0_8px_24px_rgba(40,30,25,0.08)] p-1 z-[20]"
      role="listbox"
      aria-label="Slash commands"
    >
      {filtered.map((s, i) => (
        <button
          key={s.cmd}
          type="button"
          role="option"
          aria-selected={i === activeIdx}
          className={cn(
            "cursor-pointer flex items-center gap-[10px] px-[10px] py-2 rounded-[6px] w-full",
            i === activeIdx ? "bg-[var(--bg-2)]" : "hover:bg-[var(--bg-2)]",
          )}
          onMouseEnter={() => onHover(i)}
          onClick={() => onPick(s.cmd)}
        >
          <span className="text-[var(--acc)] font-semibold font-[var(--font-mono)] text-[12px]">{s.cmd}</span>
          <span className="text-[var(--txt-2)] text-[12px]">{t(s.descKey)}</span>
        </button>
      ))}
    </div>
  );
}
