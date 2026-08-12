"use client";

import { useState, type ClipboardEvent, type DragEvent } from "react";
import { API_ROUTES } from "@agent-office/domain/config/routes";
import { uploadAttachment, fetchClipboardImage } from "@/lib/api/uploads";
import { isTauri } from "@/lib/tauri-window";
import { nextAttachmentId, type Attachment } from "../format/composer-config";

export type UseComposerAttachmentsInput = {
  agentId: string;
  projectId: string | undefined;
};

export type UseComposerAttachmentsResult = {
  attachments: Attachment[];
  setAttachments: React.Dispatch<React.SetStateAction<Attachment[]>>;
  dragOver: boolean;
  uploadOne: (file: File) => Promise<void>;
  onDragOver: (e: DragEvent<HTMLDivElement>) => void;
  onDragLeave: (e: DragEvent<HTMLDivElement>) => void;
  onDrop: (e: DragEvent<HTMLDivElement>) => void;
  onPaste: (e: ClipboardEvent<HTMLTextAreaElement>) => void;
  removeAttachment: (localId: string) => void;
  clearAll: () => void;
  hasPending: boolean;
  hasReady: boolean;
};

/**
 * Owns the attachment lifecycle for the composer: pending → uploaded → error.
 * Handles drag-and-drop, paste (with the Wayland/WebKit fallback for Tauri),
 * and file-picker input.
 */
export function useComposerAttachments(input: UseComposerAttachmentsInput): UseComposerAttachmentsResult {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const uploadOne = makeUploadOne(input, setAttachments);
  const dragHandlers = makeDragHandlers(setDragOver, uploadOne);

  return {
    attachments,
    setAttachments,
    dragOver,
    uploadOne,
    onDragOver: dragHandlers.onDragOver,
    onDragLeave: dragHandlers.onDragLeave,
    onDrop: dragHandlers.onDrop,
    onPaste: (e) => (isTauri() ? handlePasteInTauri(e, uploadOne) : handlePasteInBrowser(e, uploadOne)),
    removeAttachment: (localId: string) => setAttachments((prev) => prev.filter((a) => a.localId !== localId)),
    clearAll: () => setAttachments([]),
    hasPending: attachments.some((a) => a.pending),
    hasReady: attachments.some((a) => a.path),
  };
}

function makeUploadOne(
  input: UseComposerAttachmentsInput,
  setAttachments: React.Dispatch<React.SetStateAction<Attachment[]>>,
): (file: File) => Promise<void> {
  return async (file: File): Promise<void> => {
    const localId = nextAttachmentId();
    setAttachments((prev) => [...prev, { localId, name: file.name, pending: true }]);
    try {
      const target = input.projectId ? API_ROUTES.projectUploads(input.projectId) : API_ROUTES.agentUploads(input.agentId);
      const data = await uploadAttachment(target, file);
      setAttachments((prev) => prev.map((a) => (a.localId === localId ? { ...a, pending: false, path: data.path, name: data.filename } : a)));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setAttachments((prev) => prev.map((a) => (a.localId === localId ? { ...a, pending: false, error: msg } : a)));
    }
  };
}

function makeDragHandlers(setDragOver: (v: boolean) => void, uploadOne: (file: File) => Promise<void>) {
  return {
    onDragOver: (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragOver(true);
    },
    onDragLeave: (e: DragEvent<HTMLDivElement>) => {
      // Only clear when leaving the composer-inner container entirely.
      if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node | null)) setDragOver(false);
    },
    onDrop: (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragOver(false);
      for (const file of Array.from(e.dataTransfer.files)) void uploadOne(file);
    },
  };
}

/** Tauri paste path: WebKit2GTK strips clipboardData, so poll wl-paste. */
function handlePasteInTauri(e: ClipboardEvent<HTMLTextAreaElement>, uploadOne: (file: File) => Promise<void>): void {
  const items = Array.from(e.clipboardData.items);
  const hasText = items.some((item) => item.kind === "string");
  if (hasText) return; // let default textarea behaviour handle the text
  e.preventDefault();
  void fetchClipboardImage()
    .then((blob) => {
      if (blob.size <= 100) return;
      const ext = (blob.type || "image/png").split("/")[1] ?? "png";
      void uploadOne(new File([blob], `pasted-${Date.now()}.${ext}`, { type: blob.type || "image/png" }));
    })
    .catch(() => { /* swallow — nothing on clipboard is a common case */ });
}

/** Browser paste path: clipboardData.items is populated normally. */
function handlePasteInBrowser(e: ClipboardEvent<HTMLTextAreaElement>, uploadOne: (file: File) => Promise<void>): void {
  const files: File[] = [];
  for (const item of Array.from(e.clipboardData.items)) {
    if (item.kind !== "file") continue;
    const f = item.getAsFile();
    if (!f) continue;
    const ext = f.type.split("/")[1] ?? "png";
    files.push(new File([f], `pasted-${Date.now()}.${ext}`, { type: f.type }));
  }
  if (files.length === 0) return;
  e.preventDefault();
  for (const file of files) void uploadOne(file);
}
