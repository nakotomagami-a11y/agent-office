"use client";

import { useEffect, useState } from "react";
import { isTauri, startResizeDragging, type ResizeDirection } from "@/lib/tauri-window";

const HANDLES: { dir: ResizeDirection; className: string }[] = [
  { dir: "NorthWest", className: "fixed top-0 left-0 w-[10px] h-[10px] z-[9999] cursor-nw-resize" },
  { dir: "North",     className: "fixed top-0 left-[10px] right-[10px] h-[6px] z-[9999] cursor-n-resize" },
  { dir: "NorthEast", className: "fixed top-0 right-0 w-[10px] h-[10px] z-[9999] cursor-ne-resize" },
  { dir: "East",      className: "fixed right-0 top-[10px] bottom-[10px] w-[6px] z-[9999] cursor-e-resize" },
  { dir: "SouthEast", className: "fixed bottom-0 right-0 w-[10px] h-[10px] z-[9999] cursor-se-resize" },
  { dir: "South",     className: "fixed bottom-0 left-[10px] right-[10px] h-[6px] z-[9999] cursor-s-resize" },
  { dir: "SouthWest", className: "fixed bottom-0 left-0 w-[10px] h-[10px] z-[9999] cursor-sw-resize" },
  { dir: "West",      className: "fixed left-0 top-[10px] bottom-[10px] w-[6px] z-[9999] cursor-w-resize" },
];

export function ResizeHandles() {
  const [active, setActive] = useState(false);

  useEffect(() => {
    setActive(isTauri());
  }, []);

  if (!active) return null;

  return (
    <>
      {HANDLES.map(({ dir, className }) => (
        <div
          key={dir}
          className={className}
          onMouseDown={(e) => {
            e.preventDefault();
            void startResizeDragging(dir);
          }}
        />
      ))}
    </>
  );
}
