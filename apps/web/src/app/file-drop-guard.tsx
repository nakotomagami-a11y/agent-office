"use client";

import { useEffect } from "react";

/** The desktop shell hands drops to the webview (`disable_drag_drop_handler`), whose default for
 *  a file or link dropped outside a drop zone is to navigate the window to it, and the frameless
 *  window has no back button. Drop zones cancel the event first; anything they leave is refused. */
export function FileDropGuard() {
  useEffect(() => {
    const refuse = (e: DragEvent) => {
      const dt = e.dataTransfer;
      if (e.defaultPrevented || !dt) return;
      const files = dt.types.includes("Files");
      const editable = e.target instanceof Element && e.target.closest("input, textarea, [contenteditable='true']");
      if (!files && (!dt.types.includes("text/uri-list") || editable)) return;
      e.preventDefault();
      dt.dropEffect = "none";
    };
    window.addEventListener("dragover", refuse);
    window.addEventListener("drop", refuse);
    return () => {
      window.removeEventListener("dragover", refuse);
      window.removeEventListener("drop", refuse);
    };
  }, []);

  return null;
}
