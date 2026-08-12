/**
 * React wrapper for the pixel-icons generator.
 *
 * Icons are static (no animation), so this just draws once into a canvas on
 * mount and whenever the config or size changes. The internal canvas is sized
 * to `dimension` native pixels (default 48) and scaled up to `size` CSS pixels
 * with `image-rendering: pixelated` for crisp pixel art.
 *
 * No "use client" directive — this component is framework-agnostic. Under
 * Next.js (RSC), re-export it from a thin client module:
 *
 *     "use client";
 *     export { WeaponIcon } from "@agent-office/pixel-icons/react";
 */
import { memo, useEffect, useRef } from "react";
import type { IconConfig } from "../types";
import type { ParticleType } from "../particles";
import { IconGenerator } from "../generator";

export interface WeaponIconProps {
  /** Icon configuration (seed + class). Same config → same icon everywhere. */
  config: IconConfig;
  /** Display size in CSS pixels. @default 48 */
  size?: number;
  /**
   * Native render resolution in pixels. Lower = chunkier, more deliberate
   * pixels — which is what makes the tiny-swords pack read clean: a fixed low
   * native res with big blocks, not fine-grained detail. Omit to derive a
   * pack-like value from `size` (≈0.55×, clamped to 28–44); high resolutions
   * only amplify the procedural edge noise and look rough. Pass an explicit
   * value to override.
   */
  dimension?: number;
  /**
   * Outline color [r, g, b] 0–255. Omit for the original pure black; a dark
   * desaturated tone (e.g. [26, 22, 34]) reads softer against dark UIs.
   */
  border?: [number, number, number];
  /**
   * Particle FX aura over the icon: a {@link ParticleType}, "random" (seeded),
   * "themed" (matched to the weapon's colour), or omit for none. Ten types
   * (sparkle/ember/frost/spark/mote/leaf/bubble/blood/holy/ash), each hugging the
   * weapon so it reads as belonging to it.
   */
  particles?: ParticleType | "random" | "themed" | "none";
  /** Forwarded to the canvas element. */
  className?: string;
}

export const WeaponIcon = memo(function WeaponIcon({
  config,
  size = 48,
  dimension,
  border,
  particles,
  className,
}: WeaponIconProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Chunky-by-design: a fixed-ish low native res (28–44) upscaled to the display
  // size gives the tiny-swords pack's deliberate blocky edges. Supersampling to
  // 48–96 (the old default) rendered fine pixels that just amplified the
  // procedural edge noise and read as rough. The generator is scale-invariant,
  // so a lower native res only coarsens the pixels — it never reshapes the icon.
  const nativeDim = dimension ?? Math.min(60, Math.max(40, Math.round(size * 0.7)));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, nativeDim, nativeDim);
    new IconGenerator(ctx, nativeDim, { border, particles }).generate(config);
  }, [config, nativeDim, border, particles]);

  return (
    <canvas
      ref={canvasRef}
      width={nativeDim}
      height={nativeDim}
      className={className}
      style={{
        width: size,
        height: size,
        imageRendering: "pixelated",
        display: "block",
        flexShrink: 0,
      }}
    />
  );
});
