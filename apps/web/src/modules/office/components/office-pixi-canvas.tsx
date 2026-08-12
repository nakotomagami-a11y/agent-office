"use client";

import { useOfficePixi, type OfficePixiProps } from "../hooks/use-office-pixi";

// Thin markup wrapper — the PixiJS lifecycle lives in useOfficePixi.
export function OfficePixiCanvas(props: OfficePixiProps) {
  const { containerRef } = useOfficePixi(props);
  return <div ref={containerRef} className="absolute inset-0 w-full h-full" />;
}
