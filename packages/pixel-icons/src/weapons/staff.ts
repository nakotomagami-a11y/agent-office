import type { Pen } from "../pen";
import type { Color } from "../types";
import { Vector, Bounds, diagToPosition } from "../math";
import { colorDarken, colorLerp, colorLighten, colorStr } from "../color";
import { Rng } from "../rng";
import { WOOD, DARK, BONE, BLUED, GOLD, STEEL, pickGem } from "../palette";

/**
 * Mix-and-match staff: a worked shaft (straight / twisted / wrapped / segmented,
 * in wood / dark metal / bone / lacquer) topped by a magical head — a gem held in
 * one of several settings: bare, gripping claws, a crescent moon, a halo ring,
 * flanking wings, or a raw crystal cluster — finished with a glow, sparkles, and
 * optional nature leaves. Head/shaft archetypes derived from staff reference art.
 */

const pick = <T,>(r: Rng, arr: T[]): T => arr[Math.floor(r.float() * arr.length) % arr.length]!;

type Head = "bare" | "claws" | "crescent" | "halo" | "wings" | "cluster" | "collar" | "loop";
const HEADS: Head[] = ["bare", "claws", "claws", "crescent", "halo", "wings", "cluster", "collar", "collar", "loop", "loop"];
type Shaft = "straight" | "twisted" | "wrapped" | "segmented";
const SHAFTS: Shaft[] = ["straight", "twisted", "twisted", "wrapped", "segmented", "straight"];

export function drawStaff(pen: Pen): void {
  pen.rng.checkpoint();
  const r = pen.rng;

  const bounds = new Bounds(0, 0, pen.dimension, pen.dimension);
  const dscale = bounds.h / 32;

  pen.clearCanvas();

  const isWand = r.float() < 0.35;
  const gemRadius = (isWand ? r.rangeFloat(2.4, 3.4) : r.rangeFloat(3.6, 5.4)) * dscale;
  const haftMaxRadius = (isWand ? r.rangeFloat(0.9, 1.4) : r.rangeFloat(1.4, 2.2)) * dscale;
  const head = pick(r, HEADS);
  const shaft = pick(r, SHAFTS);

  const gemOrtho = bounds.h - 1 - Math.ceil(gemRadius * 1.25) - 1;
  const gemCenter = new Vector(gemOrtho, bounds.h - 1 - gemOrtho);

  // Shaft material + haft.
  const mat = r.float();
  const haftColor = mat < 0.4 ? WOOD.mid : mat < 0.64 ? DARK.mid : mat < 0.84 ? BONE.mid : BLUED.shadow;
  const isWood = mat < 0.4;
  const haftTopDiag = (gemOrtho - gemRadius * 0.4) * Math.SQRT2;
  pen.drawHaftHelper({ startDiag: 0, lengthDiag: haftTopDiag, maxRadius: haftMaxRadius, fractionalRadiusAllowed: true, color: haftColor });

  const metalRamp = r.float() < 0.55 ? GOLD : STEEL;
  const metal = metalRamp.light;
  const metalDark = metalRamp.shadow;

  // Worked shaft overlays.
  if (shaft === "twisted") twistShaft(pen, bounds, haftTopDiag, haftMaxRadius, dscale, haftColor);
  else if (shaft === "wrapped") {
    pen.drawGripHelper({ startDiag: haftTopDiag * r.rangeFloat(0.2, 0.4), lengthDiag: haftTopDiag * r.rangeFloat(0.18, 0.3), minRadius: haftMaxRadius, maxRadius: haftMaxRadius + 0.7 * dscale, fractionalRadiusAllowed: true });
  } else if (shaft === "segmented") {
    // Bound grip: a cord wrap FRAMED by a metal ferrule at each end — a proper
    // decorated staff, not scattered gold dots.
    const gripStart = haftTopDiag * r.rangeFloat(0.26, 0.4);
    const gripLen = haftTopDiag * r.rangeFloat(0.2, 0.32);
    pen.drawGripHelper({ startDiag: gripStart, lengthDiag: gripLen, minRadius: haftMaxRadius, maxRadius: haftMaxRadius + 0.6 * dscale, fractionalRadiusAllowed: true });
    drawShaftRing(pen, bounds, gripStart, haftMaxRadius + 0.6 * dscale, dscale, metal, metalDark);
    drawShaftRing(pen, bounds, gripStart + gripLen, haftMaxRadius + 0.6 * dscale, dscale, metal, metalDark);
  } else {
    // Straight: at most a single tidy ferrule near the neck (not a bead ladder).
    if (r.float() < 0.5) drawShaftRing(pen, bounds, haftTopDiag * r.rangeFloat(0.55, 0.72), haftMaxRadius, dscale, metal, metalDark);
  }

  // Base finial.
  if (r.float() < 0.7) {
    const baseR = haftMaxRadius + 0.4 * dscale;
    pen.drawRoundOrnamentHelper({ center: new Vector(Math.floor(baseR) + 1, Math.ceil(bounds.h - baseR - 2)), radius: baseR, colorLight: metal, colorDark: metalDark });
  }

  // Gem palette.
  const gemR = pickGem(r);
  const gemLight = gemR.mid, gemDark = gemR.shadow, gemCore = gemR.light, spec = gemR.spec;

  // --- Head setting: parts drawn BEHIND the gem first ---
  if (head === "halo") {
    drawRingShape(pen, bounds, gemCenter.x, gemCenter.y, gemRadius * 1.5, Math.max(0.9, 0.7 * dscale), metal, metalDark);
  } else if (head === "crescent") {
    // A moon cradling the gem from behind: an arc opening toward the shaft.
    drawArc(pen, bounds, gemCenter.x, gemCenter.y, gemRadius * 1.55, gemRadius * 0.55, (-Math.PI * 3) / 4 - 1.1, (-Math.PI * 3) / 4 + 1.1, metal, metalDark);
  } else if (head === "wings") {
    for (const side of [-1, 1]) {
      const a = -Math.PI / 4 + side * (Math.PI / 2.1);
      pen.fillCone(gemCenter.x, gemCenter.y, Math.cos(a), Math.sin(a), gemRadius * 0.5, gemRadius * 1.5, Math.max(1.4, gemRadius * 0.5), metal, metalDark);
    }
  }

  // Collar ring at the shaft/gem join (also for bare/claws sometimes).
  if (head === "collar" || (head !== "cluster" && r.float() < 0.4)) {
    drawShaftRing(pen, bounds, (gemOrtho - gemRadius * 0.7) * Math.SQRT2, haftMaxRadius + 0.4 * dscale, dscale, metal, metalDark);
  }

  // --- The gem(s) ---
  if (head === "loop") {
    // Ankh-style loop finial: a metal ring topping the shaft, with a small gem
    // (or hollow) inside — no big orb.
    drawRingShape(pen, bounds, gemCenter.x, gemCenter.y, gemRadius * 1.05, Math.max(1, 0.9 * dscale), metal, metalDark);
    if (r.float() < 0.6) drawOrb(pen, gemCenter.x, gemCenter.y, gemRadius * 0.42, gemDark, gemLight, gemCore, spec);
  } else if (head === "cluster") {
    // Raw crystal cluster: a central shard plus two smaller ones.
    drawFacet(pen, gemCenter.x, gemCenter.y, gemRadius, gemDark, gemLight, gemCore, spec);
    for (const side of [-1, 1]) {
      const a = -Math.PI / 4 + side * 0.9;
      const sc = new Vector(gemCenter.x + Math.cos(a) * gemRadius * 1.1, gemCenter.y + Math.sin(a) * gemRadius * 1.1);
      drawFacet(pen, sc.x, sc.y, gemRadius * 0.6, gemDark, gemLight, gemCore, spec);
    }
  } else if (r.float() < 0.42) {
    drawFacet(pen, gemCenter.x, gemCenter.y, gemRadius, gemDark, gemLight, gemCore, spec);
  } else {
    drawOrb(pen, gemCenter.x, gemCenter.y, gemRadius, gemDark, gemLight, gemCore, spec);
  }

  // --- Head setting: parts drawn OVER the gem (claw tips read in front) ---
  if (head === "claws") {
    const clawBase = diagToPosition((gemOrtho - gemRadius * 0.6) * Math.SQRT2, bounds);
    const clawHalf = Math.max(1, 0.85 * dscale);
    const prongs = r.float() < 0.5 ? 2 : 3;
    for (let i = 0; i < prongs; i++) {
      const a = -Math.PI / 4 + (i - (prongs - 1) / 2) * 0.7;
      pen.fillCone(clawBase.x, clawBase.y, Math.cos(a), Math.sin(a), gemRadius * 0.4, gemRadius * 1.5, clawHalf, metal, metalDark);
    }
  }

  // Nature leaves near the top for wooden staves.
  if (isWood && r.float() < 0.45) {
    const leafBase = diagToPosition((gemOrtho - gemRadius * 1.3) * Math.SQRT2, bounds);
    const green = { shadow: { r: 0x2f, g: 0x5a, b: 0x2e }, light: { r: 0x6f, g: 0xb0, b: 0x4a } } as const;
    for (const side of [-1, 1]) {
      const a = -Math.PI / 4 + side * 1.3;
      pen.fillCone(leafBase.x, leafBase.y, Math.cos(a), Math.sin(a), 0, r.rangeFloat(3, 5) * dscale, Math.max(1.2, 1.3 * dscale), green.light, green.shadow);
    }
  }

  pen.addBorder();

  // Bloom + sparkles over the outline.
  if (isWand || r.float() < 0.6) pen.drawGlow(gemCenter, gemRadius * 2.4, gemLight);
  if (r.float() < 0.72) {
    const nSpark = r.range(1, 4);
    for (let i = 0; i < nSpark; i++) {
      const a = -Math.PI / 2 + r.rangeFloat(-1.4, 1.4);
      const dist = gemRadius * (0.55 + 0.55 * r.float());
      drawSparkle(pen, Math.round(gemCenter.x + Math.cos(a) * dist), Math.round(gemCenter.y + Math.sin(a) * dist), r.range(1, 3), spec);
    }
  }
}

/** A helical highlight/shadow running down the shaft → a twisted look. */
function twistShaft(pen: Pen, bounds: Bounds, topDiag: number, haftR: number, dscale: number, base: Color): void {
  const litStr = colorStr(colorLighten(base, 0.25));
  const darkStr = colorStr(colorDarken(base, 0.3));
  const perpX = Math.SQRT1_2, perpY = Math.SQRT1_2; // across the shaft
  const wave = 2.2 * dscale;
  for (let l = 3 * dscale; l < topDiag / Math.SQRT2 - 2; l += 0.5) {
    const cx = l, cy = bounds.h - 1 - l;
    const off = Math.sin(l / wave) * haftR * 0.7;
    const x = Math.round(cx + perpX * off);
    const y = Math.round(cy + perpY * off);
    if (x < 0 || y < 0 || x >= bounds.w || y >= bounds.h) continue;
    if (pen.ctx.getImageData(x, y, 1, 1).data[3]! === 0) continue;
    pen.ctx.fillStyle = Math.cos(l / wave) > 0 ? litStr : darkStr;
    pen.drawPixel(x, y);
  }
}

/** Filled metal ring (halo) behind the gem. */
function drawRingShape(pen: Pen, bounds: Bounds, cx: number, cy: number, rad: number, thick: number, light: Color, dark: Color): void {
  const lit = colorStr(light), dk = colorStr(dark);
  for (let x = Math.floor(cx - rad - 1); x <= Math.ceil(cx + rad + 1); x++) {
    for (let y = Math.floor(cy - rad - 1); y <= Math.ceil(cy + rad + 1); y++) {
      if (x < 0 || y < 0 || x >= bounds.w || y >= bounds.h) continue;
      const d = Math.hypot(x - cx, y - cy);
      if (d < rad - thick || d > rad) continue;
      pen.ctx.fillStyle = x - cx + (y - cy) > 0 ? dk : lit;
      pen.drawPixel(x, y);
    }
  }
}

/** An annular arc (crescent) spanning [a0,a1] radians. */
function drawArc(pen: Pen, bounds: Bounds, cx: number, cy: number, rad: number, thick: number, a0: number, a1: number, light: Color, dark: Color): void {
  const lit = colorStr(light), dk = colorStr(dark);
  for (let x = Math.floor(cx - rad - 1); x <= Math.ceil(cx + rad + 1); x++) {
    for (let y = Math.floor(cy - rad - 1); y <= Math.ceil(cy + rad + 1); y++) {
      if (x < 0 || y < 0 || x >= bounds.w || y >= bounds.h) continue;
      const d = Math.hypot(x - cx, y - cy);
      if (d < rad - thick || d > rad) continue;
      let ang = Math.atan2(y - cy, x - cx);
      // normalise to be near the [a0,a1] window
      while (ang < a0 - Math.PI) ang += Math.PI * 2;
      while (ang > a1 + Math.PI) ang -= Math.PI * 2;
      if (ang < a0 || ang > a1) continue;
      pen.ctx.fillStyle = (x - cx) < 0 ? lit : dk;
      pen.drawPixel(x, y);
    }
  }
}

function drawOrb(pen: Pen, cx: number, cy: number, rad: number, dark: Color, light: Color, core: Color, spec: Color): void {
  const specX = cx - rad * 0.36;
  const specY = cy - rad * 0.36;
  const specR = Math.max(1.3, rad * 0.3);
  for (let x = Math.floor(cx - rad - 1); x <= Math.ceil(cx + rad + 1); x++) {
    for (let y = Math.floor(cy - rad - 1); y <= Math.ceil(cy + rad + 1); y++) {
      if (x < 0 || y < 0 || x >= pen.dimension || y >= pen.dimension) continue;
      const dx = x - cx, dy = y - cy;
      const d = Math.hypot(dx, dy);
      if (d > rad + 0.4) continue;
      const nd = Math.min(1, d / rad);
      const nx = dx / rad, ny = dy / rad;
      const lightAmt = Math.max(0, Math.min(1, 0.55 - (nx + ny) * 0.4));
      let c = colorLerp(dark, light, lightAmt);
      c = colorLerp(c, core, Math.pow(Math.max(0, 1 - nd), 1.7) * 0.55);
      if (nd > 0.78) c = colorDarken(c, ((nd - 0.78) / 0.22) * 0.5);
      const sd = Math.hypot(x - specX, y - specY);
      if (sd < specR) c = colorLerp(c, spec, Math.pow(1 - sd / specR, 1.4) * 0.95);
      pen.ctx.fillStyle = colorStr(c);
      pen.drawPixel(x, y);
    }
  }
}

function drawFacet(pen: Pen, cx: number, cy: number, rad: number, dark: Color, light: Color, core: Color, spec: Color): void {
  const specX = cx - rad * 0.26;
  const specY = cy - rad * 0.34;
  const specR = Math.max(1.2, rad * 0.24);
  for (let x = Math.floor(cx - rad - 1); x <= Math.ceil(cx + rad + 1); x++) {
    for (let y = Math.floor(cy - rad - 1); y <= Math.ceil(cy + rad + 1); y++) {
      if (x < 0 || y < 0 || x >= pen.dimension || y >= pen.dimension) continue;
      const nx = (x - cx) / rad, ny = (y - cy) / rad;
      const m = Math.abs(nx) + Math.abs(ny);
      if (m > 1.0) continue;
      let c: Color;
      if (m < 0.4) c = colorLerp(light, core, 0.5);
      else { const b = ny < 0 ? (nx < 0 ? 0.9 : 0.66) : nx < 0 ? 0.46 : 0.3; c = colorLerp(dark, light, b); }
      if (Math.abs(m - 0.4) < 0.06) c = colorDarken(c, 0.28);
      else if (Math.abs(nx) < 0.06 && m > 0.4) c = colorDarken(c, 0.22);
      if (m > 0.9) c = colorDarken(c, ((m - 0.9) / 0.1) * 0.42);
      const sd = Math.hypot(x - specX, y - specY);
      if (sd < specR) c = colorLerp(c, spec, Math.pow(1 - sd / specR, 1.3) * 0.9);
      pen.ctx.fillStyle = colorStr(c);
      pen.drawPixel(x, y);
    }
  }
}

function drawShaftRing(pen: Pen, bounds: Bounds, diag: number, halfWidth: number, dscale: number, light: Color, dark: Color): void {
  const ortho = diag / Math.SQRT2;
  const cx = ortho, cy = bounds.h - 1 - ortho;
  const fwd = Math.SQRT1_2, perp = Math.SQRT1_2;
  const halfW = halfWidth + 0.8 * dscale;
  const halfT = Math.max(0.6, 0.7 * dscale);
  const litStr = colorStr(light), darkStr = colorStr(dark);
  for (let t = -halfW; t <= halfW; t += 0.5) {
    for (let u = -halfT; u <= halfT; u += 0.5) {
      const x = Math.round(cx + perp * t + fwd * u);
      const y = Math.round(cy + perp * t - fwd * u);
      if (x < 0 || y < 0 || x >= bounds.w || y >= bounds.h) continue;
      pen.ctx.fillStyle = t > halfW * 0.35 ? darkStr : litStr;
      pen.drawPixel(x, y);
    }
  }
}

function drawSparkle(pen: Pen, cx: number, cy: number, size: number, color: Color): void {
  const rr = Math.floor(color.r), gg = Math.floor(color.g), bb = Math.floor(color.b);
  for (let i = -size; i <= size; i++) {
    if (i === 0) continue;
    const a = (1 - Math.abs(i) / (size + 1)) * 0.9;
    pen.ctx.fillStyle = `rgba(${rr},${gg},${bb},${a.toFixed(2)})`;
    pen.drawPixel(cx + i, cy);
    pen.drawPixel(cx, cy + i);
  }
  pen.ctx.fillStyle = `rgb(${rr},${gg},${bb})`;
  pen.drawPixel(cx, cy);
}
