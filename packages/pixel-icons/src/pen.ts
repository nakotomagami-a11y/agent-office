/**
 * Pen — shared drawing surface for the weapon generators.
 * Extracted from IconGenerator — faithful TypeScript port of Brian MacIntosh's Icon Machine
 * procedural pixel-art weapon generator (blades, spears).
 *
 * The original also generates potions; that generator was dropped in this
 * build — only the weapon generators are ported.
 *
 * The original was a single `RandomArt` object bound to the page DOM. This
 * strips the UI: construct with a 2D canvas context + a square dimension, then
 * call `generate(config)`. Same seed + class → same icon on every device.
 *
 * The drawing math is kept 1:1 with the source (including its quirks) so output
 * matches the original pixel-for-pixel.
 */
import type { Color } from "./types";
import { Bounds, Vector, CorePoint, floatLerp } from "./math";
import { colorDarken, colorLerp, colorLighten, colorStr } from "./color";
import { pickBladeMetal, pickGuardAccent, pickHaft, OUTLINE, allTones, RUST } from "./palette";
import type { ParticleType } from "./particles";
import { Rng } from "./rng";

/** Subset of CanvasRenderingContext2D the generator relies on. */
export type Ctx2D = CanvasRenderingContext2D;

export interface IconOptions {
  /**
   * Outline color as [r, g, b], 0–255. Default is a warm near-black
   * ([32, 26, 38]) — the tiny-swords pack outlines in a dark desaturated plum,
   * not pure black, which reads softer against dark UIs. Pass [0,0,0] for the
   * original hard black.
   */
  border?: [number, number, number];
  /**
   * Cel-shading step count. Snaps every shade blend to N discrete value bands
   * for the hand-drawn tiny-swords look instead of smooth gradients. 0/1 =
   * continuous (original). Default: 4.
   */
  celSteps?: number;
  /**
   * Particle FX overlay. A {@link ParticleType} draws that aura; "random" picks
   * one from the seed; "themed" picks one matching the weapon's colour; omit /
   * "none" for no particles.
   */
  particles?: ParticleType | "random" | "themed" | "none";
}

export class Pen {
  public ctx: Ctx2D;
  public dimension: number;
  public rng = new Rng();
  public translation = new Vector(0, 0);
  public border: [number, number, number];
  public celSteps: number;
  public particles: ParticleType | "random" | "themed" | "none";

  constructor(ctx: Ctx2D, dimension: number, options: IconOptions = {}) {
    this.ctx = ctx;
    this.dimension = dimension;
    this.border = options.border ?? OUTLINE;
    this.celSteps = options.celSteps ?? 4;
    this.particles = options.particles ?? "none";
  }

  // -- low-level canvas ------------------------------------------------------

  public clearCanvas(): void {
    this.ctx.fillStyle = "rgba(0,0,0,1)";
    this.ctx.clearRect(0, 0, this.dimension, this.dimension);
  }

  public drawPixel(x: number, y: number): void {
    this.ctx.fillRect(Math.floor(x), Math.floor(y), 1, 1);
  }

  /**
   * De-jaggy the silhouette before outlining. The tiny-swords pack reads clean
   * because its edges are deliberate hand-drawn curves with no stray pixels; our
   * procedural shapes leave orphan specks and single-pixel staircase notches. A
   * 3×3 neighbour pass:
   *   - clears opaque pixels with ≤1 opaque neighbour  → removes floating debris
   *     and lone protrusion tips
   *   - fills transparent pixels with ≥5 opaque neighbours → closes pinholes and
   *     rounds concave staircase corners (filled with the neighbour-average
   *     colour, which the outline then borders)
   * The ≤1 / ≥5 thresholds are deliberately extreme so 1px diagonal shafts
   * (which have exactly 2 opaque neighbours per pixel) are never eroded or
   * fattened.
   */
  public cleanSilhouette(): void {
    const w = this.dimension;
    const h = this.dimension;
    const ox = this.translation.x;
    const oy = this.translation.y;
    const src = this.ctx.getImageData(ox, oy, w, h);
    const out = this.ctx.getImageData(ox, oy, w, h);
    const d = src.data;
    const isOpaque = (x: number, y: number) =>
      x >= 0 && y >= 0 && x < w && y < h && d[(x + y * w) * 4 + 3]! > 0;
    for (let x = 0; x < w; x++) {
      for (let y = 0; y < h; y++) {
        const i = (x + y * w) * 4;
        let n = 0;
        let rs = 0;
        let gs = 0;
        let bs = 0;
        for (let dx = -1; dx <= 1; dx++) {
          for (let dy = -1; dy <= 1; dy++) {
            if (dx === 0 && dy === 0) continue;
            if (isOpaque(x + dx, y + dy)) {
              n++;
              const j = ((x + dx) + (y + dy) * w) * 4;
              rs += d[j]!;
              gs += d[j + 1]!;
              bs += d[j + 2]!;
            }
          }
        }
        if (d[i + 3]! > 0) {
          if (n <= 1) out.data[i + 3] = 0; // orphan / lone tip → cut
        } else if (n >= 5) {
          out.data[i] = Math.round(rs / n); // concavity / pinhole → fill
          out.data[i + 1] = Math.round(gs / n);
          out.data[i + 2] = Math.round(bs / n);
          out.data[i + 3] = 255;
        }
      }
    }
    this.ctx.putImageData(out, ox, oy);
  }

  /**
   * Snap every opaque pixel to the nearest fixed material tone. Continuous
   * shader gradients (cone lerps, edge lightens, orb falloff) collapse into the
   * pack's hard 4-tones-per-material cel bands, and the whole icon's colour
   * count drops to the ~12–16 the pack uses. Nearest-RGB keeps pixels within
   * their material family (the ramps are hue-separated).
   */
  public snapToPalette(): void {
    const w = this.dimension;
    const h = this.dimension;
    const ox = this.translation.x;
    const oy = this.translation.y;
    const img = this.ctx.getImageData(ox, oy, w, h);
    const d = img.data;
    const P = allTones();
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3]! < 250) continue; // leave translucent FX (glow/sparkle) alone
      let best = 0;
      let bestDist = Infinity;
      for (let k = 0; k < P.length; k++) {
        const dr = d[i]! - P[k]!.r;
        const dg = d[i + 1]! - P[k]!.g;
        const db = d[i + 2]! - P[k]!.b;
        const dist = dr * dr + dg * dg + db * db;
        if (dist < bestDist) { bestDist = dist; best = k; }
      }
      d[i] = Math.round(P[best]!.r);
      d[i + 1] = Math.round(P[best]!.g);
      d[i + 2] = Math.round(P[best]!.b);
    }
    this.ctx.putImageData(img, ox, oy);
  }

  /**
   * Battle-wear: a few short darker scratch strokes across the interior metal so
   * blades/heads read as USED, not factory-new. Interior-only (all 4 orthogonal
   * neighbours opaque) so it never nibbles the silhouette; the darkened pixels
   * snap to the material's shadow tone in {@link snapToPalette}. `amount` 0..1
   * scales the scratch count. Call before {@link addBorder}.
   */
  public weather(amount: number): void {
    if (amount <= 0) return;
    const w = this.dimension;
    const h = this.dimension;
    const ox = this.translation.x;
    const oy = this.translation.y;
    const img = this.ctx.getImageData(ox, oy, w, h);
    const d = img.data;
    const opaque = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && d[(x + y * w) * 4 + 3]! > 0;
    const interior: number[] = [];
    for (let x = 1; x < w - 1; x++) {
      for (let y = 1; y < h - 1; y++) {
        if (opaque(x, y) && opaque(x - 1, y) && opaque(x + 1, y) && opaque(x, y - 1) && opaque(x, y + 1)) {
          interior.push(x, y);
        }
      }
    }
    if (!interior.length) return;
    const r = this.rng;
    const nScratch = 1 + Math.round(amount * 3);
    for (let s = 0; s < nScratch; s++) {
      const p = Math.floor(r.float() * (interior.length / 2)) * 2;
      const sx = interior[p]!;
      const sy = interior[p + 1]!;
      const len = 2 + r.range(0, 3);
      const ang = r.rangeFloat(0, Math.PI);
      const dx = Math.cos(ang);
      const dy = Math.sin(ang);
      // Heavily-worn weapons corrode: some strokes are rust-tinted, not just dark.
      const rust = r.float() < amount * 0.6;
      for (let k = 0; k < len; k++) {
        const px = Math.round(sx + dx * k);
        const py = Math.round(sy + dy * k);
        if (!opaque(px, py)) break;
        const i = (px + py * w) * 4;
        if (rust) {
          d[i] = Math.round(d[i]! * 0.35 + RUST.mid.r * 0.65);
          d[i + 1] = Math.round(d[i + 1]! * 0.35 + RUST.mid.g * 0.65);
          d[i + 2] = Math.round(d[i + 2]! * 0.35 + RUST.mid.b * 0.65);
        } else {
          d[i] = Math.round(d[i]! * 0.5);
          d[i + 1] = Math.round(d[i + 1]! * 0.5);
          d[i + 2] = Math.round(d[i + 2]! * 0.5);
        }
      }
    }
    this.ctx.putImageData(img, ox, oy);
  }

  /**
   * Outline the silhouette. Selective (2-tone) like the pack: the near-black
   * `border` on shadowed (bottom-right) edges, a lifted navy on the top-left
   * lit edges. The light edge doubles as the only thing that reads against a
   * near-black UI card — a pure `#161c2e` outline vanishes on `#1a1a1a`.
   */
  public addBorder(): void {
    this.cleanSilhouette();
    this.snapToPalette();

    const width = this.dimension;
    const height = this.dimension;
    const ox = this.translation.x;
    const oy = this.translation.y;
    const bd = this.border;
    const lift = 0.16;
    const bl: [number, number, number] = [
      Math.round(bd[0] + (255 - bd[0]) * lift),
      Math.round(bd[1] + (255 - bd[1]) * lift),
      Math.round(bd[2] + (255 - bd[2]) * lift),
    ];

    const readData = this.ctx.getImageData(ox, oy, width, height);
    const mutableData = this.ctx.getImageData(ox, oy, width, height);
    for (let x = 0; x < width; x++) {
      for (let y = 0; y < height; y++) {
        const pixelStart = (x + y * width) * 4;
        if (readData.data[pixelStart + 3] === 0 || x === 0 || y === 0 || x === width - 1 || y === height - 1) {
          const nxo = x > 0 && readData.data[(x - 1 + y * width) * 4 + 3]! > 0;
          const nyo = y > 0 && readData.data[(x + (y - 1) * width) * 4 + 3]! > 0;
          const pxo = x < width - 1 && readData.data[(x + 1 + y * width) * 4 + 3]! > 0;
          const pyo = y < height - 1 && readData.data[(x + (y + 1) * width) * 4 + 3]! > 0;
          if (nxo || nyo || pxo || pyo) {
            // Object toward down-right (px/py opaque) → this is a top-left lit edge.
            const litSide = (pxo ? 1 : 0) + (pyo ? 1 : 0) - (nxo ? 1 : 0) - (nyo ? 1 : 0);
            const col = litSide > 0 ? bl : bd;
            mutableData.data[pixelStart + 0] = col[0];
            mutableData.data[pixelStart + 1] = col[1];
            mutableData.data[pixelStart + 2] = col[2];
            mutableData.data[pixelStart + 3] = 255;
          }
        }
      }
    }
    this.ctx.putImageData(mutableData, ox, oy);
  }

  // -- shared shape helpers --------------------------------------------------

  /** Soft radial alpha falloff, used as a post-outline bloom overlay. */
  public drawGlow(center: Vector, radius: number, color: Color): void {
    const rr = Math.floor(color.r);
    const gg = Math.floor(color.g);
    const bb = Math.floor(color.b);
    for (let x = Math.floor(center.x - radius); x <= Math.ceil(center.x + radius); x++) {
      for (let y = Math.floor(center.y - radius); y <= Math.ceil(center.y + radius); y++) {
        if (x < 0 || y < 0 || x >= this.dimension || y >= this.dimension) continue;
        const d = center.distanceTo(x, y);
        if (d > radius) continue;
        const t = 1 - d / radius;
        const alpha = t * t * 0.55;
        if (alpha < 0.02) continue;
        this.ctx.fillStyle = `rgba(${rr},${gg},${bb},${alpha.toFixed(3)})`;
        this.drawPixel(x, y);
      }
    }
  }

  /** Tapered cone from (cx,cy) along (dx,dy): width `halfBase` at `startD`,
   *  narrowing to a point at `startD+len`. Shaded by facing + tip. */
  public fillCone(
    cx: number,
    cy: number,
    dx: number,
    dy: number,
    startD: number,
    len: number,
    halfBase: number,
    light: Color,
    dark: Color,
  ): void {
    const reach = startD + len;
    const px = cx + dx * startD;
    const py = cy + dy * startD;
    const ex = cx + dx * reach;
    const ey = cy + dy * reach;
    const minX = Math.max(0, Math.floor(Math.min(px, ex) - halfBase - 1));
    const maxX = Math.min(this.dimension - 1, Math.ceil(Math.max(px, ex) + halfBase + 1));
    const minY = Math.max(0, Math.floor(Math.min(py, ey) - halfBase - 1));
    const maxY = Math.min(this.dimension - 1, Math.ceil(Math.max(py, ey) + halfBase + 1));
    // Which lateral side catches the top-left light, for a beveled cross-section.
    const litSign = dy - dx >= 0 ? 1 : -1;
    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        const rx = x - cx;
        const ry = y - cy;
        const d = rx * dx + ry * dy;
        if (d < startD || d > reach) continue;
        const s = rx * -dy + ry * dx;
        const w = halfBase * (1 - (d - startD) / len);
        if (Math.abs(s) > w) continue;
        // Beveled metal cross-section: one side lit, opposite dark, a raised
        // ridge down the centre and a darkened rim — the depth a flat gradient lacks.
        const nn = Math.max(-1, Math.min(1, s / (w || 1)));
        let shade = 0.5 + 0.42 * litSign * nn + 0.2 * (1 - Math.abs(nn));
        if (Math.abs(nn) > 0.8) shade -= 0.45 * ((Math.abs(nn) - 0.8) / 0.2);
        const tip = (d - startD) / len;
        shade = Math.max(0, Math.min(1, shade)) * (0.74 + 0.26 * tip);
        this.ctx.fillStyle = colorStr(colorLerp(dark, light, shade));
        this.drawPixel(x, y);
      }
    }
  }

  /**
   * A flowing cloth ribbon/streamer from (rx,ry) along (dx,dy). Unlike a flat
   * fillCone it flutters (lateral sine), tapers, and shades ACROSS its width —
   * one edge catches light, the fold darkens — with an optional swallowtail fork.
   * Reads as cloth, not a painted triangle.
   */
  public drawRibbon(
    rx: number,
    ry: number,
    dx: number,
    dy: number,
    len: number,
    width: number,
    ramp: { shadow: Color; mid: Color; light: Color },
    opts: { wave?: number; waveLen?: number; taper?: boolean; twist?: boolean; swallowtail?: boolean } = {},
  ): void {
    const m = Math.hypot(dx, dy) || 1;
    dx /= m;
    dy /= m;
    const px = -dy;
    const py = dx; // perpendicular (ribbon width axis)
    const steps = Math.max(3, Math.ceil(len));
    const phase = this.rng.rangeFloat(0, Math.PI * 2);
    const waveN = opts.wave ? len / (opts.waveLen ?? 8) : 0;
    const litStr = colorStr(ramp.light);
    const midStr = colorStr(ramp.mid);
    const darkStr = colorStr(ramp.shadow);
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const wave = opts.wave ? Math.sin(phase + t * Math.PI * 2 * waveN) * opts.wave * (0.3 + 0.7 * t) : 0;
      const cx = rx + dx * s + px * wave;
      const cy = ry + dy * s + py * wave;
      const hw = Math.max(0.5, width * 0.5 * (opts.taper === false ? 1 : 1 - 0.7 * t));
      // Surface tilt along the length: one edge lit, the fold band shadowed.
      const twist = opts.twist ? Math.sin(phase * 1.3 + t * Math.PI * 5) : 0.5;
      for (let w = -hw; w <= hw; w += 0.5) {
        if (opts.swallowtail && t > 0.72 && Math.abs(w) < hw * 0.55) continue; // forked tail
        const x = Math.round(cx + px * w);
        const y = Math.round(cy + py * w);
        if (x < 0 || y < 0 || x >= this.dimension || y >= this.dimension) continue;
        const edge = hw > 0 ? Math.abs(w) / hw : 0;
        const lightness = 0.55 + 0.4 * twist * (hw > 0 ? w / hw : 0) - 0.22 * edge;
        this.ctx.fillStyle = lightness > 0.66 ? litStr : lightness > 0.38 ? midStr : darkStr;
        this.drawPixel(x, y);
      }
    }
  }

  // -- blade helper ----------------------------------------------------------

  public drawBladeHelper(params: BladeParams): BladeResults {
    this.rng.checkpoint();
    const r = this.rng;

    const bounds = new Bounds(0, 0, this.dimension, this.dimension);
    const bounds1 = new Bounds(1, 1, bounds.w - 2, bounds.h - 2);
    const dscale = bounds.h / 32;

    const minimumBladeWidth = 1;
    const bladeSampleStepSize = Math.sqrt(2);
    const bladeEdgeWidth = 1;
    const bladeCoreEdgeExcludeWidth = 1;
    // The blade centerline is integrated one sample-step at a time, and the step
    // count grows with the render resolution — so per-step angular rates must be
    // divided by dscale, otherwise the persistent curvature (`omega`) integrates
    // to a full spiral at high resolution (the "blade loops into a snail" bug).
    // `jogAmount` is a one-off kink (scale-invariant in shape), so it stays; only
    // its per-step probability is normalized. At dscale=1 all of this is a no-op.
    const bladeJogChance = 0.04 / dscale;
    const bladeJogChanceLeadIn = Math.ceil(12 * dscale);
    const bladeJogAmount = Math.PI / 6;
    const bladeOmegaChance = 0.02 / dscale;
    const bladeOmegaAmount = Math.PI / 32 / dscale;
    const bladeMaxOmega = Math.PI / 32 / dscale;

    // Archetype overrides (see BladeStyle). When absent the original random
    // profile is used (spears rely on it).
    const st = params.style;
    const bladeWidthCosineAmp = st?.widthAmp != null
      ? Math.ceil(st.widthAmp * dscale)
      : Math.ceil(Math.max(0, r.floatLow() * 0.8 - 0.3) * 2 * dscale);
    const bladeWidthCosineWavelength = Math.ceil(r.range(3 * Math.max(1, bladeWidthCosineAmp), 12) * dscale);
    const bladeWidthCosineOffset = r.rangeFloat(0, Math.PI * 2);

    // Wiggle is a heading *offset* (not integrated), and the wavelength already
    // scales with dscale — so the angular amplitude must stay constant, else the
    // physical wave grows as dscale² and the blade turns into a snake at high res.
    const bladeWiggleAmp = st?.wave != null ? st.wave : (Math.max(0, r.float() * 8 - 7.2) * Math.PI) / 8;
    const bladeWiggleWavelength = Math.ceil((st?.waveLen ?? r.rangeFloat(6, 18)) * dscale);

    const bladeCorePoints: CorePoint[] = [];
    const bladeStartOrtho = Math.floor(params.startDiag / Math.sqrt(2));
    const currentPoint = new Vector(bladeStartOrtho, bounds.h - 1 - bladeStartOrtho);
    let currentDist = 0;
    const currentWidthL = params.startRadius;
    const currentWidthR = params.startRadius + r.range(-1, 2);
    const velocity = new Vector();
    const velocityScaled = new Vector();
    let angle = -Math.PI / 4;
    // A styled blade carries a constant curvature (saber arc); an unstyled one
    // meanders via the random jog/omega below.
    let omega = st?.curve != null ? (st.curve * (st.curveDir ?? 1)) / dscale : 0;
    // Cap the TOTAL accumulated bend of a styled curve so long blades read as a
    // curvy scimitar, not a full banana. Short/medium sabers stay curly.
    let curveTurned = 0;
    const curveCap = st?.maxTurn ?? Math.PI / 3; // ~60° (scimitar); higher = sickle hook
    do {
      const bladeWidthCosine = bladeWidthCosineAmp * Math.cos(bladeWidthCosineOffset + currentDist / bladeWidthCosineWavelength);
      const useAngle = angle + bladeWiggleAmp * Math.sin((Math.PI * 2 * currentDist) / bladeWiggleWavelength);
      velocity.set(Math.cos(useAngle), Math.sin(useAngle));

      const newPoint = new CorePoint(currentPoint);
      newPoint.widthL = Math.max(1, currentWidthL + bladeWidthCosine);
      newPoint.widthR = Math.max(1, currentWidthR + bladeWidthCosine);
      newPoint.normal = new Vector(-velocity.y, velocity.x).normalize();
      newPoint.forward = new Vector(velocity).normalize();
      newPoint.dist = currentDist;
      bladeCorePoints.push(newPoint);

      if (st == null) {
        if (r.float() <= bladeJogChance * Math.min(1, currentDist / bladeJogChanceLeadIn)) {
          angle += r.rangeFloat(-bladeJogAmount, bladeJogAmount);
        }
        if (r.float() <= bladeOmegaChance) {
          omega += r.rangeFloat(-bladeOmegaAmount, bladeOmegaAmount);
          omega = Math.sign(omega) * Math.min(bladeMaxOmega, Math.abs(omega));
        }
      }

      velocityScaled.set(velocity).multiplyScalar(bladeSampleStepSize);
      currentPoint.addVector(velocityScaled);
      currentDist += bladeSampleStepSize;
      if (st?.curve != null) {
        // Styled curve: integrate omega only until the total bend hits the cap,
        // then run straight (scimitar, not banana).
        if (Math.abs(curveTurned) < curveCap) {
          const dTurn = omega * bladeSampleStepSize;
          angle += dTurn;
          curveTurned += dTurn;
        }
      } else {
        angle += omega * bladeSampleStepSize;
      }
    } while (bounds1.contains(currentPoint));

    for (const p of bladeCorePoints) {
      p.normalizedDist = p.dist! / currentDist;
      const nd = p.normalizedDist;
      const invTaperFactor = 1 - params.taperFactor;
      const taper = nd <= invTaperFactor ? 1 : (1 - nd) / params.taperFactor;
      // Leaf/waisted: a single width swell peaking mid-blade.
      const bulge = st?.bulge != null ? 1 + st.bulge * Math.sin(Math.PI * nd) : 1;
      p.widthL! *= taper * bulge;
      p.widthR! *= taper * bulge;
      // Clip-point: the spine side (widthR) angles in to meet the tip over the
      // last `clip` fraction, leaving the belly (widthL) to carry the point.
      if (st?.clip != null && nd > 1 - st.clip) {
        p.widthR! *= Math.max(0, (1 - nd) / st.clip);
      }
      // Serrations: triangular teeth bulging off the cutting edge (widthL), only
      // along the mid blade so the base and tip stay clean.
      if (st?.serrate != null && nd > 0.2 && nd < 1 - params.taperFactor) {
        const per = st.serratePeriod ?? 3; // base-px tooth period
        const ph = (((p.dist! % per) + per) % per) / per;
        const tri = ph < 0.5 ? ph * 2 : (1 - ph) * 2;
        const amt = st.serrate * tri;
        const side = st.serrateSide ?? "edge";
        if (side === "edge" || side === "both") p.widthL! += amt;
        if (side === "spine" || side === "both") p.widthR! += amt;
      }
    }

    // Steel from the tiny-swords ramp instead of a free hue: light body toward
    // the tip, mid toward the hilt; edge/spine shading below lifts to spec / drops
    // to shadow.
    const metal = st?.metal ?? pickBladeMetal(r);
    const colorBladeLinearTip = metal.light;
    const colorBladeLinearHilt = metal.mid;
    const bladeEdgeLighten = 0.5;
    const bladeRightDarken = 0.5;

    for (let x = 0; x < bounds.w; x++) {
      for (let y = 0; y < bounds.h; y++) {
        const first = bladeCorePoints[0]!;
        const behind = first.forward.dotProduct(x - first.x, y - first.y);
        if (behind < 0) continue;

        let coreDistanceNorm = Infinity;
        let bestPoint: CorePoint | null = null;
        for (const cp of bladeCorePoints) {
          const dp = cp.normal!.dotProduct(x - cp.x, y - cp.y);
          const useWidth = dp < 0 ? cp.widthL! : cp.widthR!;
          const distanceNorm = cp.distanceTo(x, y) / useWidth;
          if (distanceNorm < coreDistanceNorm) {
            coreDistanceNorm = distanceNorm;
            bestPoint = cp;
          }
        }
        if (bestPoint == null) continue;

        const dp = bestPoint.normal!.dotProduct(x - bestPoint.x + 0.5, y - bestPoint.y + 0.5);
        const useWidth = dp < 0 ? bestPoint.widthL! : bestPoint.widthR!;
        const coreDistance = bestPoint.distanceTo(x, y);
        if (coreDistance <= useWidth || coreDistance <= minimumBladeWidth) {
          let color = colorLerp(colorBladeLinearHilt, colorBladeLinearTip, bestPoint.normalizedDist!);
          const edgeColor = colorLighten(color, bladeEdgeLighten);
          const darkColor = colorDarken(color, bladeRightDarken);
          if (st?.singleEdge) {
            // Shade by lateral position: dp<0 side is the bright cutting edge,
            // dp>0 side the dark flat spine, mid body between — a katana bevel.
            const lat = dp / (useWidth || 1);
            color = lat < -0.3 ? edgeColor : lat < 0.3 ? color : darkColor;
          } else {
            const nonEdgeColor = dp > 0 ? darkColor : color;
            if (useWidth > bladeCoreEdgeExcludeWidth) {
              const edgeWidthMin = useWidth - bladeEdgeWidth;
              let edgeAmount = (coreDistance - edgeWidthMin) / bladeEdgeWidth;
              edgeAmount = 1 - (1 - edgeAmount) * (1 - edgeAmount);
              color = colorLerp(nonEdgeColor, edgeColor, edgeAmount);
            }
          }
          // Fuller: a recessed groove darkens a thin band down the blade centre
          // (only where the blade is wide enough to show it).
          if (st?.fuller && useWidth > 2.4 && coreDistance < Math.max(0.9, useWidth * 0.24)) {
            color = colorDarken(color, 0.42);
          }
          this.ctx.fillStyle = colorStr(color);
          this.drawPixel(x, y);
        }
      }
    }

    return {
      startDiag: params.startDiag,
      startOrtho: bladeStartOrtho,
      startRadius: params.startRadius,
      hiltColor: colorBladeLinearHilt,
      tipColor: colorBladeLinearTip,
    };
  }

  // -- crossguard helper -----------------------------------------------------

  public drawCrossguardHelper(params: CrossguardParams): CrossguardResults {
    this.rng.checkpoint();
    const r = this.rng;

    const bounds = new Bounds(0, 0, this.dimension, this.dimension);

    const guard = pickGuardAccent(r);
    const xguardColorLight = guard.light;
    const xguardColorDark = guard.shadow;
    const xguardSymmetry = r.float() < 0.3 ? 0 : 1;
    const xguardThickness = params.thickness ?? r.rangeFloatHigh(1, 2.5);
    const xguardBottomTaper = r.float();
    const xguardTopTaper = floatLerp(r.float(), xguardBottomTaper, r.floatExtreme());
    const xguardOmegaChance = params.omegaChance ?? 0.3;
    const xguardOmegaAmount = params.omegaAmount ?? Math.PI / 8;
    // `^` is bitwise XOR here (not power) — faithful to the original source.
    const xguardMaxOmega = ((0 + (xguardThickness - 1)) ^ 2) * (Math.PI / 7);
    const xguardOmegaCooldown = 3;
    const xguardSampleStepSize = Math.sqrt(2);

    const start = new Vector(params.positionDiag, bounds.h - 1 - params.positionDiag);
    const currentPoint: [Vector, Vector] = [start, new Vector(start)];
    const xguardControlPoints: [CorePoint[], CorePoint[]] = [[], []];
    const xguardAngle: [number, number] = [(-Math.PI * 3) / 4, Math.PI / 4];
    const xguardOmega: [number, number] = [0, 0];
    const xguardOmegaCoolTimer: [number, number] = [0, 0];
    const deltaStep = xguardSampleStepSize / Math.sqrt(2);

    for (let progress = 0; progress <= params.halfLength; progress += xguardSampleStepSize) {
      for (const side of [0, 1] as const) {
        const newPoint = new CorePoint(currentPoint[side]);
        if (side === 1) {
          const symmetricPoint = new Vector(bounds.h - 1 - currentPoint[0].y, bounds.w - 1 - currentPoint[0].x);
          newPoint.lerpTo(symmetricPoint, xguardSymmetry);
        }
        newPoint.widthT = xguardThickness / 2;
        newPoint.widthB = xguardThickness / 2;
        const vel = new Vector(Math.cos(xguardAngle[side]), Math.sin(xguardAngle[side]));
        newPoint.normal = new Vector(vel.y, -vel.x).multiplyScalar(side * 2 - 1);
        newPoint.dist = progress;
        xguardControlPoints[side].push(newPoint);
      }
      for (const side of [0, 1] as const) {
        const vel = new Vector(Math.cos(xguardAngle[side]), Math.sin(xguardAngle[side]));
        xguardOmegaCoolTimer[side] -= xguardSampleStepSize;
        if (xguardOmegaCoolTimer[side] <= 0 && r.float() < xguardOmegaChance) {
          xguardOmegaCoolTimer[side] = xguardOmegaCooldown;
          xguardOmega[side] += r.rangeFloatExtreme(-xguardOmegaAmount, xguardOmegaAmount);
          xguardOmega[side] = Math.sign(xguardOmega[side]) * Math.min(xguardMaxOmega, Math.abs(xguardOmega[side]));
        }
        const step = new Vector(vel).multiplyScalar(xguardSampleStepSize);
        currentPoint[side].addVector(step);
        xguardAngle[side] += xguardOmega[side] * deltaStep;
      }
    }

    for (const side of [0, 1] as const) {
      for (const cp of xguardControlPoints[side]) {
        cp.normalizedDist = cp.dist / params.halfLength;
        cp.widthT *= Math.min(1, (1 - cp.normalizedDist) / xguardTopTaper);
        cp.widthB *= Math.min(1, (1 - cp.normalizedDist) / xguardBottomTaper);
      }
    }

    for (let x = 0; x < bounds.w; x++) {
      for (let y = 0; y < bounds.h; y++) {
        let coreDistanceSq = Infinity;
        let bestPoint: CorePoint | null = null;
        for (const side of [0, 1] as const) {
          for (const cp of xguardControlPoints[side]) {
            const distanceSq = cp.distanceToSq(x, y);
            if (distanceSq < coreDistanceSq) {
              coreDistanceSq = distanceSq;
              bestPoint = cp;
            }
          }
        }
        if (bestPoint == null) continue;
        const dp = bestPoint.normal!.dotProduct(x - bestPoint.x, y - bestPoint.y);
        const useWidth = dp < 0 ? bestPoint.widthB! : bestPoint.widthT!;
        const coreDistance = Math.sqrt(coreDistanceSq);
        if (coreDistance <= useWidth) {
          const distFromTop = dp < 0 ? bestPoint.widthT! + coreDistance : bestPoint.widthT! - coreDistance;
          const darkAmt = distFromTop / (bestPoint.widthB! + bestPoint.widthT!);
          this.ctx.fillStyle = colorStr(colorLerp(xguardColorLight, xguardColorDark, darkAmt));
          this.drawPixel(x, y);
        }
      }
    }

    return { colorLight: xguardColorLight, colorDark: xguardColorDark };
  }

  // -- grip / haft / rod -----------------------------------------------------

  public drawGripHelper(params: GripParams): void {
    this.rng.checkpoint();
    const r = this.rng;

    const bounds = new Bounds(0, 0, this.dimension, this.dimension);
    const dscale = bounds.h / 32;

    const minRadius = params.minRadius ? params.minRadius : 1;
    const maxRadius = params.maxRadius;
    // Radii arrive already in pixel units (callers derive them from scaled
    // blade/haft radii), so no extra `* dscale` here — the original port applied
    // it twice, making grips balloon quadratically at high render resolutions.
    const hiltRadius = params.fractionalRadiusAllowed
      ? 0.5 * Math.ceil(r.range(minRadius * 2, maxRadius * 2))
      : Math.ceil(r.range(minRadius, maxRadius));

    const hiltWavelength = Math.max(2, Math.ceil(r.range(3, 6) * dscale));
    const grip = pickHaft(r); // cord / leather wrap
    const hiltColorLight = grip.mid;
    const hiltColorDark = grip.shadow;

    this.drawRodHelper({
      radius: hiltRadius,
      startDiag: params.startDiag,
      lengthDiag: params.lengthDiag * Math.sqrt(2),
      colorFunc: (l) => {
        const gripWave = Math.abs(Math.cos((Math.PI * 2 * l) / hiltWavelength));
        return colorLerp(hiltColorDark, hiltColorLight, gripWave);
      },
    });
  }

  public drawHaftHelper(params: HaftParams): { radius: number } {
    this.rng.checkpoint();
    const r = this.rng;

    const minRadius = params.minRadius ? params.minRadius : 1;
    const maxRadius = params.maxRadius;
    // See drawGripHelper: incoming radii are already pixel-scaled, so no extra
    // `* dscale` (double-scaling made hafts fatten into cones at high res).
    const haftRadius = params.fractionalRadiusAllowed
      ? 0.5 * Math.ceil(r.range(minRadius * 2, maxRadius * 2))
      : Math.ceil(r.range(minRadius, maxRadius));

    const haftColor = params.color ?? pickHaft(r).mid;

    this.drawRodHelper({
      radius: haftRadius,
      startDiag: params.startDiag,
      lengthDiag: params.lengthDiag,
      colorFunc: () => haftColor,
    });

    return { radius: haftRadius };
  }

  public drawRodHelper(params: RodParams): void {
    const radius = Math.max(1, params.radius);
    const bounds = new Bounds(0, 0, this.dimension, this.dimension);
    const radSteps = radius / 0.5;

    const startAxis = Math.ceil(params.startDiag / Math.sqrt(2));
    const lengthAxis = params.lengthDiag / Math.sqrt(2);
    for (let l = 0; l < lengthAxis; l += 0.5) {
      const al = startAxis + l;
      const core = new Vector(al, bounds.h - 1 - al);
      const fractionalStep = al % 1 !== 0;
      let left: number;
      let right: number;
      if (!fractionalStep) {
        left = -Math.floor((radSteps - 2) / 4);
        right = Math.floor((radSteps - 1) / 4);
      } else {
        core.x = Math.floor(core.x);
        core.y = Math.floor(core.y);
        left = -Math.floor((radSteps - 3) / 4);
        right = Math.floor((radSteps - 0) / 4);
      }

      const sliceColor = params.colorFunc(l);
      for (let h = left; h <= right; h++) {
        let darkenAmt: number;
        if (left === right) {
          darkenAmt = fractionalStep ? 0 : 1;
        } else {
          darkenAmt = (h - left) / (right - left);
        }
        darkenAmt *= 0.3;
        this.ctx.fillStyle = colorStr(colorDarken(sliceColor, darkenAmt));
        this.drawPixel(core.x + h, core.y + h);
      }
    }
  }

  // -- round ornament --------------------------------------------------------

  public drawRoundOrnamentHelper(params: OrnamentParams): void {
    this.rng.checkpoint();
    const r = this.rng;

    const orn = pickGuardAccent(r);
    const pommelColorLight = params.colorLight ?? orn.light;
    const pommelColorDark = params.colorDark ?? orn.shadow;
    const pommelRadius = params.radius;
    const shadowCenter = new Vector(0.5, 1).normalize().multiplyScalar(pommelRadius).addVector(params.center);
    const highlightCenter = new Vector(-1, -1).normalize().multiplyScalar(pommelRadius * 0.7).addVector(params.center);
    for (let x = Math.floor(params.center.x - pommelRadius); x <= Math.ceil(params.center.x + pommelRadius); x++) {
      for (let y = Math.floor(params.center.y - pommelRadius); y <= Math.ceil(params.center.y + pommelRadius); y++) {
        const radius = params.center.distanceTo(x, y);
        if (radius <= pommelRadius) {
          const shadowDist = shadowCenter.distanceTo(x, y);
          const highlightDist = highlightCenter.distanceTo(x, y);
          const darkAmt = 1 - Math.min(1, (0.8 * shadowDist) / pommelRadius);
          const lightAmt = 1 - Math.min(1, highlightDist / pommelRadius);
          this.ctx.fillStyle = colorStr(colorLighten(colorLerp(pommelColorLight, pommelColorDark, darkAmt), lightAmt));
          this.drawPixel(x, y);
        }
      }
    }
  }
}

// -- helper param/result shapes ----------------------------------------------

/** Discrete blade-profile knobs. Absent → the original random meander. */
export interface BladeStyle {
  /** Constant curvature per unit length (rad) → saber / scimitar arc. */
  curve?: number;
  /** Curvature direction, +1 (edge-forward) or -1. */
  curveDir?: number;
  /** Centreline wave amplitude (rad) → flamberge / kris. */
  wave?: number;
  /** Wave wavelength in base px. */
  waveLen?: number;
  /** Width-ripple amplitude in base px (0 = clean straight edges). */
  widthAmp?: number;
  /** Single-edged: bright cutting edge on one lateral side, dark flat spine on
   *  the other (saber / falchion / cleaver / katana). Default double-edged. */
  singleEdge?: boolean;
  /** Leaf/waisted blade: swell the width mid-blade by this factor (0.4–0.6). */
  bulge?: number;
  /** Clip-point (bowie): the spine side angles to the tip over the last `clip`
   *  fraction of the blade (0.2–0.35). */
  clip?: number;
  /** Draw a darker fuller (blood groove) down the blade centre. */
  fuller?: boolean;
  /** Saw-tooth serrations; value = tooth height in base px. */
  serrate?: number;
  /** Which side the serrations sit on. Default "edge" (widthL). */
  serrateSide?: "edge" | "spine" | "both";
  /** Serration tooth period in base px. Default 3 (fine). Larger = chunkier teeth. */
  serratePeriod?: number;
  /** Max total accumulated bend for a styled curve (rad). Default π/3 (scimitar).
   *  Raise for sickle/khopesh hooks. */
  maxTurn?: number;
  /** Override the blade metal (e.g. a magic crystal). Default: picked from the
   *  steel/bronze/iron pool. */
  metal?: { shadow: Color; mid: Color; light: Color; spec: Color };
}

export interface BladeParams {
  startDiag: number;
  taperFactor: number;
  startRadius: number;
  style?: BladeStyle;
}
export interface BladeResults {
  startDiag: number;
  startOrtho: number;
  startRadius: number;
  hiltColor: Color;
  tipColor: Color;
}
export interface CrossguardParams {
  positionDiag: number;
  halfLength: number;
  omegaChance?: number;
  omegaAmount?: number;
  thickness?: number;
}
export interface CrossguardResults {
  colorLight: Color;
  colorDark: Color;
}
export interface GripParams {
  startDiag: number;
  lengthDiag: number;
  minRadius?: number;
  maxRadius: number;
  fractionalRadiusAllowed?: boolean;
}
export interface HaftParams {
  startDiag: number;
  lengthDiag: number;
  minRadius?: number;
  maxRadius: number;
  fractionalRadiusAllowed?: boolean;
  color?: Color;
}
export interface RodParams {
  radius: number;
  startDiag: number;
  lengthDiag: number;
  colorFunc: (l: number) => Color;
}
export interface OrnamentParams {
  center: Vector;
  radius: number;
  colorLight?: Color;
  colorDark?: Color;
}

/**
 * Convenience one-shot: draw an icon into a fresh context.
 * Returns the concrete class that was drawn (useful when `iconClass` was a
 * meta-selector like "anyweapon").
 */
