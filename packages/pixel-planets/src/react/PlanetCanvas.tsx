/**
 * React component wrapper for the pixel-planets WebGL renderer.
 *
 * Design decisions:
 *
 * Singleton renderer
 *   A module-level `PlanetRenderer` instance is shared by every `<PlanetCanvas>`
 *   on the page. This is intentional — WebGL contexts are expensive OS resources
 *   (browsers cap them at 8–16 per page). The singleton uses one context and
 *   renders all planets in a single rAF loop, copying each result to its
 *   display canvas with `drawImage`.
 *
 * No "use client" directive
 *   That directive is Next.js-specific. This component is framework-agnostic.
 *   If you're using Next.js (or another RSC framework), wrap this in your own
 *   thin client component:
 *
 *     "use client";
 *     export { PlanetCanvas } from "@agent-office/pixel-planets/react";
 *
 * Stable registration key
 *   The `key` string encodes every prop that affects the rendered output. When
 *   a prop changes, React re-runs the effect, we unregister the old key and
 *   register a new one. The renderer then re-computes params on the next frame.
 *   This is O(1) and avoids unnecessary re-renders.
 *
 * Sizing and the wrapper div
 *   For star (2×) and black-hole (3×), the WebGL canvas is larger than `size`
 *   so the disc fills `size` pixels and the effects (blobs, flares, ring) fill
 *   the extra space. A wrapper div is always sized to `size × size` and
 *   flex-centers the canvas inside — callers control overflow via `className`:
 *
 *     overflow-hidden rounded-full   → clips to a circle (good for list icons)
 *     (omit overflow-hidden)         → effects bleed outside the box (good for
 *                                      large previews and freeform types)
 */
import { memo, useEffect, useMemo, useRef } from "react";
import type { PlanetConfig } from "../types";
import { getPlanetParams } from "../params";
import { PlanetRenderer } from "../renderer/index";

// Module-level singleton — created lazily on first render

let globalRenderer: PlanetRenderer | null = null;

function getRenderer(): PlanetRenderer | null {
  if (typeof window === "undefined") return null;
  if (!globalRenderer) globalRenderer = new PlanetRenderer();
  return globalRenderer;
}

// Component

export interface PlanetCanvasProps {
  /**
   * Stable identifier for the owning entity (e.g. a project ID).
   * When `config` is absent, the renderer derives a deterministic random planet
   * from this ID so the planet looks the same on every render.
   */
  projectId: string;

  /**
   * Planet configuration. When omitted, a procedural planet is generated from
   * `projectId`. Changing any property triggers an immediate re-render.
   */
  config?: PlanetConfig;

  /**
   * Disc diameter in CSS pixels. The wrapper div is always `size × size`.
   * The inner canvas may be larger for star/black-hole types (effects overflow).
   *
   * @default 32
   */
  size?: number;

  /**
   * Applied to the wrapper div. Use this to control:
   *   - Layout behaviour (`shrink-0`, `block`, …)
   *   - Clipping (`overflow-hidden rounded-full` for a circle icon)
   *   - Freeform bleed (omit `overflow-hidden` to let effects extend outside)
   */
  className?: string;
}

export const PlanetCanvas = memo(function PlanetCanvas({
  projectId,
  config,
  size = 32,
  className,
}: PlanetCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Resolve the real params up front so the display canvas is sized to the
  // scale the render loop will actually use. This matters for the config-less
  // fallback: getPlanetParams derives a gas-giant (2×) or rocky (1×) from the
  // projectId, and the renderer renders at params.canvasScale. Deriving the
  // scale from `config.type` alone (undefined → 1×) mis-sizes gas-giant
  // fallbacks, clipping the disc and reading the outline out of bounds.
  const params = useMemo(() => getPlanetParams(projectId, config), [projectId, config]);

  // For star (2×), gas-giant (2×) and black-hole (3×), the canvas is larger
  // than the wrapper so the disc appears at `size` px and surrounding effects
  // fill the margin.
  const canvasScale = params.canvasScale ?? 1;
  const canvasSize = size * canvasScale;

  useEffect(() => {
    const canvas = canvasRef.current;
    const renderer = getRenderer();
    if (!canvas || !renderer) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Encode all appearance-affecting props into the key so changing any one
    // triggers unregister → register → fresh render.
    const key = config
      ? `${projectId}/${size}/${config.type}/${config.seed}/${config.paletteIdx}/${config.pixels ?? 0}/${config.rotation?.toFixed(3) ?? "r"}/${config.dither ?? 1}`
      : `${projectId}/${size}/auto`;

    renderer.register(key, { id: projectId, params, destCanvas: canvas, destCtx: ctx, size });
    return () => renderer.unregister(key);
  }, [projectId, config, size, params]);

  // Canvas is absolutely-centered inside the wrapper. When `canvasSize >
  // size` (star/black-hole/gas-giant) the ring/glow paints outside the
  // wrapper without displacing sibling elements — layout stays anchored to
  // the disc's `size`. Callers can add `overflow-hidden` to the className
  // when they want to clip the bleed (e.g. a circle chip that must not
  // overflow neighbouring UI), or omit it (default) to let the effect
  // extend beyond the disc.
  const overhang = (canvasSize - size) / 2;
  return (
    <div
      className={className}
      style={{ width: size, height: size, position: "relative", flexShrink: 0 }}
    >
      <canvas
        ref={canvasRef}
        width={canvasSize}
        height={canvasSize}
        style={{
          imageRendering: "pixelated",
          display: "block",
          position: "absolute",
          top: -overhang,
          left: -overhang,
          pointerEvents: "none",
        }}
      />
    </div>
  );
});
