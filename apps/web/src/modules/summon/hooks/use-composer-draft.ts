"use client";

import { useEffect, type RefObject } from "react";
import { loadDraft, saveDraft } from "../format/draft-store";
import { autosizeTextarea } from "../format/textarea-autosize";

/**
 * Restores the persisted draft into the composer textarea on mount and
 * reflects seed prompts (from a "Branch from here" click or similar) into
 * the textarea when they change. Both effects auto-size the textarea so
 * the caller doesn't have to think about it.
 */
export function useComposerDraft(input: {
  draftKey: string | undefined;
  seed: string | undefined;
  textRef: RefObject<HTMLTextAreaElement | null>;
  setValue: (v: string) => void;
  /** Reset the source seed to undefined once it has been injected. Without
   *  this the seed lives on in the persistent per-tKey registry and gets
   *  re-injected (and re-saved as the draft) on every remount — e.g. a tab
   *  switch resurrects an already-sent recovery/resummon message. */
  onSeedConsumed?: () => void;
}): void {
  const { draftKey, seed, textRef, setValue, onSeedConsumed } = input;

  // Resize once on mount so a restored draft is fully visible without input.
  useEffect(() => {
    autosizeTextarea(textRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- fires once on mount
  }, []);

  // Load the persisted draft async. `draftKey` is stable for the lifetime of
  // the composer instance (key= remounts on agent/instance change).
  useEffect(() => {
    if (!draftKey) return;
    loadDraft(draftKey).then((text) => {
      if (!text) return;
      setValue(text);
      autosizeTextarea(textRef.current);
    }).catch(() => { /* ignore */ });
  // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once on mount; draftKey is stable
  }, []);

  // Reflect an external seed (e.g. suggestion click) into the textarea.
  useEffect(() => {
    if (seed === undefined) return;
    setValue(seed);
    if (draftKey) void saveDraft(draftKey, seed);
    textRef.current?.focus();
    autosizeTextarea(textRef.current);
    // Consume the seed so it can't be re-injected on the next remount.
    onSeedConsumed?.();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- draftKey is stable per composer instance
  }, [seed]);
}
