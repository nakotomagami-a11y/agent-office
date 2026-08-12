"use client";

/**
 * Next.js client boundary for @agent-office/pixel-planets PlanetCanvas.
 * The package itself has no "use client" directive (it's framework-agnostic),
 * so we add it here in the app layer.
 */
export { PlanetCanvas } from "@agent-office/pixel-planets/react";
export type { PlanetCanvasProps } from "@agent-office/pixel-planets/react";
