"use client";

import { useMemo, useState } from "react";
import { SLASH_COMMANDS, type SlashCommand } from "../format/composer-config";

type SavedPrompt = { title: string; body: string };

export type ComposerMenusState = {
  slashOpen: boolean;
  setSlashOpen: (v: boolean) => void;
  slashIdx: number;
  setSlashIdx: React.Dispatch<React.SetStateAction<number>>;
  promptsOpen: boolean;
  setPromptsOpen: (v: boolean) => void;
  promptsIdx: number;
  setPromptsIdx: React.Dispatch<React.SetStateAction<number>>;
  filteredSlash: SlashCommand[];
  filteredPrompts: SavedPrompt[];
  updateFor: (nextValue: string) => void;
  closeAll: () => void;
};

/**
 * Bundles the slash + saved-prompt menu state and derives the filtered lists
 * from the current composer value. The caller triggers open/close via
 * `updateFor` on every keystroke.
 */
export function useComposerMenus(value: string, savedPrompts: SavedPrompt[]): ComposerMenusState {
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashIdx, setSlashIdx] = useState(0);
  const [promptsOpen, setPromptsOpen] = useState(false);
  const [promptsIdx, setPromptsIdx] = useState(0);

  const filteredSlash = useMemo(() => {
    if (!value.startsWith("/")) return [];
    const q = value.slice(1).toLowerCase();
    return SLASH_COMMANDS.filter((s) => s.cmd.slice(1).startsWith(q));
  }, [value]);

  const filteredPrompts = useMemo(() => {
    if (!value.startsWith("/")) return [];
    const q = value.slice(1).toLowerCase();
    if (!q) return savedPrompts;
    return savedPrompts.filter((p) => p.title.toLowerCase().includes(q) || p.body.toLowerCase().includes(q));
  }, [value, savedPrompts]);

  return {
    slashOpen, setSlashOpen,
    slashIdx, setSlashIdx,
    promptsOpen, setPromptsOpen,
    promptsIdx, setPromptsIdx,
    filteredSlash,
    filteredPrompts,
    updateFor(nextValue: string) {
      const triggers = nextValue.startsWith("/");
      setSlashOpen(triggers);
      setSlashIdx(0);
      setPromptsOpen(triggers);
      setPromptsIdx(0);
    },
    closeAll() {
      setSlashOpen(false);
      setPromptsOpen(false);
    },
  };
}
