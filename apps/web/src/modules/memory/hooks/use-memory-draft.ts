"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const SAVED_FLASH_MS = 1500;

export type UseMemoryDraftArgs = {
  initialValue: string;
  onSave: (content: string) => Promise<unknown> | unknown;
};

export type UseMemoryDraftReturn = {
  draft: string;
  setDraft: (next: string) => void;
  isDirty: boolean;
  save: () => Promise<void>;
  isSaving: boolean;
  savedRecently: boolean;
};

export function useMemoryDraft({
  initialValue,
  onSave,
}: UseMemoryDraftArgs): UseMemoryDraftReturn {
  const [draft, setDraftState] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [savedRecently, setSavedRecently] = useState(false);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    };
  }, []);

  const value = draft ?? initialValue;
  const isDirty = draft !== null && draft !== initialValue;

  const setDraft = useCallback((next: string) => {
    setDraftState(next);
  }, []);

  const save = useCallback(async () => {
    if (draft === null) return;
    setIsSaving(true);
    try {
      await onSave(draft);
      setDraftState(null);
      setSavedRecently(true);
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
      flashTimerRef.current = setTimeout(() => setSavedRecently(false), SAVED_FLASH_MS);
    } finally {
      setIsSaving(false);
    }
  }, [draft, onSave]);

  return {
    draft: value,
    setDraft,
    isDirty,
    save,
    isSaving,
    savedRecently,
  };
}
