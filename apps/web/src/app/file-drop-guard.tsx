"use client";

import { useEffect } from "react";

/** The desktop shell hands file drops to the webview (`disable_drag_drop_handler`), whose default
 *  for a file dropped outside a drop zone is to navigate the window to it, and the frameless
 *  window has no back button. Drop zones cancel the event first; anything they leave is refused. */
export function FileDropGuard() {
  useEffect(() => {
    const refuse = (e: DragEvent) => {
      if (e.defaultPrevented || !e.dataTransfer?.types.includes("Files")) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "none";
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
