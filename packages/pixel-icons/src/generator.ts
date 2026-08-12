/**
 * IconGenerator — faithful TypeScript port of Brian MacIntosh's Icon Machine
 * procedural pixel-art weapon generator.
 *
 * The original was a single `RandomArt` object bound to the page DOM. This
 * strips the UI: construct with a 2D canvas context + a square dimension, then
 * call `generate(config)`. Same seed + class → same icon on every device.
 *
 * The drawing math is kept 1:1 with the source (including its quirks). The
 * shared drawing surface lives in {@link Pen}; each weapon is a standalone
 * function in `./weapons/*` that draws onto a Pen.
 */
import type { IconClass, IconClassSelector, IconConfig } from "./types";
import { sfc32, xmur3 } from "./rng";
import { setCelSteps } from "./color";
import { drawParticles, pickParticleType, pickThemedParticle } from "./particles";
import { Pen, type Ctx2D, type IconOptions } from "./pen";
import { drawBlade } from "./weapons/blade";
import { drawSpear } from "./weapons/spear";
import { drawAxe } from "./weapons/axe";
import { drawStaff } from "./weapons/staff";
import { drawTrident } from "./weapons/trident";

export type { Ctx2D, IconOptions } from "./pen";

const ALL_CLASSES: IconClass[] = ["blades", "spears", "axes", "staffs", "tridents"];

const DRAW: Record<IconClass, (pen: Pen) => void> = {
  blades: drawBlade,
  spears: drawSpear,
  axes: drawAxe,
  staffs: drawStaff,
  tridents: drawTrident,
};

export class IconGenerator {
  private pen: Pen;

  constructor(ctx: Ctx2D, dimension: number, options: IconOptions = {}) {
    this.pen = new Pen(ctx, dimension, options);
  }

  /** Draw the configured icon into the context. */
  generate(config: IconConfig): IconClass {
    const seed = config.seed;

    // meta-rng resolves "any" / "anyweapon" to a concrete class deterministically
    const metaGen = xmur3(seed);
    const metaRandom = sfc32(metaGen(), metaGen(), metaGen(), metaGen());

    let drawClass: IconClass;
    const sel: IconClassSelector = config.iconClass;
    // Meta-selectors and any class we no longer draw (e.g. a persisted icon from
    // a since-removed class) resolve to a concrete class deterministically.
    if (sel === "any" || sel === "anyweapon" || !(sel in DRAW)) {
      drawClass = ALL_CLASSES[Math.floor(ALL_CLASSES.length * metaRandom())]!;
    } else {
      drawClass = sel;
    }

    setCelSteps(this.pen.celSteps);
    this.pen.rng.seed(seed);
    DRAW[drawClass](this.pen);

    // Particle FX overlay (drawn over the finished, outlined icon).
    if (this.pen.particles && this.pen.particles !== "none") {
      const mode = this.pen.particles;
      // Auto modes only decorate ~30% of icons; the gate is a fresh seed hash so
      // it's a clean uniform 30% independent of the weapon's RNG usage. An
      // explicit type is always drawn.
      const auto = mode === "random" || mode === "themed";
      const fxGen = xmur3(`${seed}:fx`);
      const fxRandom = sfc32(fxGen(), fxGen(), fxGen(), fxGen());
      if (!auto || fxRandom() < 0.3) {
        this.pen.rng.checkpoint();
        const type =
          mode === "random" ? pickParticleType(this.pen.rng)
          : mode === "themed" ? pickThemedParticle(this.pen, this.pen.rng)
          : mode;
        drawParticles(this.pen, type, this.pen.rng);
      }
    }
    return drawClass;
  }
}

/**
 * Convenience one-shot: draw an icon into a fresh context.
 * Returns the concrete class that was drawn (useful when `iconClass` was a
 * meta-selector like "anyweapon").
 */
export function generateIcon(
  ctx: Ctx2D,
  dimension: number,
  config: IconConfig,
  options?: IconOptions,
): IconClass {
  return new IconGenerator(ctx, dimension, options).generate(config);
}
