"use client";

import { type KeyboardEvent } from "react";

export type UseComposerKeyboardInput = {
  slashOpen: boolean;
  setSlashOpen: (v: boolean) => void;
  slashIdx: number;
  setSlashIdx: (updater: (n: number) => number) => void;
  filteredSlashLength: number;
  onPickSlash: () => void;
  promptsOpen: boolean;
  setPromptsOpen: (v: boolean) => void;
  promptsIdx: number;
  setPromptsIdx: (updater: (n: number) => number) => void;
  filteredPromptsLength: number;
  onPickPrompt: () => void;
  onSend: () => void;
  onOpenPicker: () => void;
};

/**
 * Returns the `onKeyDown` handler for the composer textarea. All keyboard
 * routing (menu navigation, Ctrl/Cmd+P, Enter to send) lives here so the
 * component body stays free of `if (e.key === …)` cascades.
 */
export function useComposerKeyboard(input: UseComposerKeyboardInput): (e: KeyboardEvent<HTMLTextAreaElement>) => void {
  return (e) => {
    if (isCtrlP(e)) {
      e.preventDefault();
      input.onOpenPicker();
      return;
    }
    if (input.promptsOpen && handlePromptsMenuKey(e, input)) return;
    if (input.slashOpen && input.filteredSlashLength > 0 && handleSlashMenuKey(e, input)) return;
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      input.onSend();
    }
  };
}

function isCtrlP(e: KeyboardEvent<HTMLTextAreaElement>): boolean {
  return e.key === "p" && (e.ctrlKey || e.metaKey);
}

function handlePromptsMenuKey(e: KeyboardEvent<HTMLTextAreaElement>, input: UseComposerKeyboardInput): boolean {
  if (e.key === "ArrowDown") {
    e.preventDefault();
    input.setPromptsIdx((i) => Math.min(Math.max(input.filteredPromptsLength - 1, 0), i + 1));
    return true;
  }
  if (e.key === "ArrowUp") {
    e.preventDefault();
    input.setPromptsIdx((i) => Math.max(0, i - 1));
    return true;
  }
  if (e.key === "Enter" && !e.shiftKey && input.filteredPromptsLength > 0) {
    e.preventDefault();
    input.onPickPrompt();
    return true;
  }
  if (e.key === "Escape") {
    e.preventDefault();
    input.setPromptsOpen(false);
    input.setSlashOpen(false);
    return true;
  }
  return false;
}

function handleSlashMenuKey(e: KeyboardEvent<HTMLTextAreaElement>, input: UseComposerKeyboardInput): boolean {
  if (e.key === "ArrowDown") {
    e.preventDefault();
    input.setSlashIdx((i) => Math.min(input.filteredSlashLength - 1, i + 1));
    return true;
  }
  if (e.key === "ArrowUp") {
    e.preventDefault();
    input.setSlashIdx((i) => Math.max(0, i - 1));
    return true;
  }
  if (e.key === "Tab") {
    e.preventDefault();
    input.onPickSlash();
    return true;
  }
  if (e.key === "Escape") {
    input.setSlashOpen(false);
    input.setPromptsOpen(false);
    return true;
  }
  return false;
}
