"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { cn } from "@/lib/cn";
import {
  getUnitClockFrame,
  getUnitClockServerFrame,
  subscribeUnitClock,
} from "./unit-sprite.clock";
import {
  UNIT_DEFS,
  unitSheetSrc,
  type UnitSelection,
  type UnitSheetState,
} from "./unit-sprite-registry";

export type UnitSpriteProps = {
  unit: UnitSelection;
  /** Square avatar size in CSS pixels. Defaults to 48. */
  size?: number;
  /** Loop the sprite-sheet animation. Disable in very dense lists. */
  animate?: boolean;
  /** Which action sheet to play. Each named action requires the kind to
   *  declare the matching sheet in UNIT_DEFS (pawn does); otherwise the
   *  sprite gracefully falls back to idle. */
  action?: "idle" | "working" | "axe" | "hammer" | "pickaxe" | "knife";
  /** Mirror horizontally - used when the contextual target (e.g. a tree
   *  being chopped) is on the pawn's left rather than its default right. */
  flip?: boolean;
  /** Optional accessible label. Decorative by default. */
  label?: string;
  className?: string;
};

/**
 * Animated Tiny Swords unit avatar. Uses CSS background-position to step
 * through the sheet, driven by a shared rAF clock so N sprites cost one loop.
 *
 * Respects `prefers-reduced-motion`: the animation pauses on the first frame.
 */
export function UnitSprite({
  unit,
  size = 48,
  animate = true,
  action = "idle",
  flip = false,
  label,
  className,
}: UnitSpriteProps) {
  // Hooks MUST be called before any early return so React sees the same
  // hook order on every render (rules-of-hooks). The placeholder branch
  // below just doesn't use their values.
  const reducedMotion = usePrefersReducedMotion();

  // Defensive: a missing or malformed `unit` shouldn't crash the whole page.
  // Render a placeholder square and shout in the console so the offending
  // callsite shows up in dev. Types should catch this at compile time but
  // any cast / persisted data / out-of-tree mutation could still break the
  // invariant - and "blank avatar" beats "white page of death".
  const def =
    unit && typeof unit.kind === "string" ? UNIT_DEFS[unit.kind] : undefined;

  // Compute `ticking` up-front so useUnitFrame is called unconditionally
  // too. When there's no def, ticking is false and the returned frame is
  // discarded — the placeholder JSX doesn't use it.
  let frames = 1;
  if (def) {
    let sheetPreview = def.idle;
    if (action === "working") sheetPreview = def.run;
    else if (action === "axe"     && def.axe)     sheetPreview = def.axe;
    else if (action === "hammer"  && def.hammer)  sheetPreview = def.hammer;
    else if (action === "pickaxe" && def.pickaxe) sheetPreview = def.pickaxe;
    else if (action === "knife"   && def.knife)   sheetPreview = def.knife;
    frames = sheetPreview.frames;
  }
  const ticking = !!def && animate && !reducedMotion && frames > 1;
  const frame = useUnitFrame(ticking) % Math.max(1, frames);

  if (!def) {
    if (typeof window !== "undefined") {
      console.warn(
        "[UnitSprite] missing unit definition; rendering placeholder. Got:",
        unit,
      );
    }
    return (
      <div
        className={cn("unit-sprite shrink-0 bg-bg-2 border border-dashed border-line rounded-[4px]", className)}
        style={{ width: size, height: size }}
        aria-hidden
        title={`Unknown unit: ${JSON.stringify(unit ?? null)}`}
      />
    );
  }
  // Pick the sheet for the requested action. Each named action requires the
  // unit kind to declare the matching sheet in UNIT_DEFS; if absent we fall
  // back to idle so non-pawn units never end up with a missing sprite URL
  // if a future rule routes an unsupported action their way.
  let sheet = def.idle;
  let state: UnitSheetState = "idle";
  if (action === "working") {
    sheet = def.run;
    state = "run";
  } else if (action === "axe" && def.axe) {
    sheet = def.axe;
    state = "axe";
  } else if (action === "hammer" && def.hammer) {
    sheet = def.hammer;
    state = "hammer";
  } else if (action === "pickaxe" && def.pickaxe) {
    sheet = def.pickaxe;
    state = "pickaxe";
  } else if (action === "knife" && def.knife) {
    sheet = def.knife;
    state = "knife";
  }
  const src = unitSheetSrc(unit.faction, unit.kind, state);

  // `reducedMotion`, `ticking`, and `frame` were already computed at the
  // top of the function (before the placeholder early-return) so React
  // sees the same hook order on every render.

  // Scale the character *body* to a consistent visual weight, then feet-anchor.
  // Weapon-dominated kinds (the Lancer's spear) declare a `sizeMultiplier` so
  // their body reads at the same size as other units instead of shrinking to
  // fit the tall spear bbox; the spear then extends above the frame and is
  // clipped by `overflow-hidden`. For units without a multiplier/groundY this
  // is mathematically identical to the previous bbox-fit + centre behaviour.
  const mult = def.sizeMultiplier ?? 1;
  const scale = (size / Math.max(def.bbox.w, def.bbox.h)) * mult;
  const frameW = def.frameW * scale;
  const sheetW = frameW * sheet.frames;
  const sheetH = def.frameH * scale;

  // Horizontal: centre the character body (bbox centre) in the square.
  const bodyCenterX = def.bbox.x + def.bbox.w / 2;
  // Vertical: stand the feet (`groundY`, falling back to the bbox bottom) on
  // the avatar baseline so every unit shares a ground line regardless of the
  // weapon extent above.
  const groundY = def.groundY ?? def.bbox.y + def.bbox.h;
  const offX = size / 2 - bodyCenterX * scale - frame * frameW;
  const offY = size - groundY * scale;

  const ariaProps = label
    ? { role: "img" as const, "aria-label": label }
    : { "aria-hidden": true };

  return (
    <div
      className={cn("unit-sprite overflow-hidden relative shrink-0", className)}
      style={{
        width: size,
        height: size,
        transform: flip ? "scaleX(-1)" : undefined,
      }}
      {...ariaProps}
    >
      <div
        className="absolute inset-0 bg-no-repeat [image-rendering:pixelated]"
        style={{
          backgroundImage: `url(${src})`,
          backgroundSize: `${sheetW}px ${sheetH}px`,
          backgroundPosition: `${offX}px ${offY}px`,
        }}
      />
    </div>
  );
}

function useUnitFrame(active: boolean): number {
  return useSyncExternalStore(
    active ? subscribeUnitClock : noopSubscribe,
    active ? getUnitClockFrame : getStaticFrame,
    getUnitClockServerFrame,
  );
}

function noopSubscribe(): () => void {
  return () => {};
}

function getStaticFrame(): number {
  // When the sprite is paused, snap to the first frame.
  return 0;
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}
