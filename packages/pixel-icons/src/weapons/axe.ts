import type { Pen } from "../pen";
import type { Color } from "../types";
import { Vector, Bounds, diagToPosition } from "../math";
import { colorLerp, colorStr, colorDarken } from "../color";
import { Rng } from "../rng";
import { pickBladeMetal, pickGem, pickCrystal, GOLD, WOOD, DARK, BRONZE } from "../palette";

/**
 * Mix-and-match axe: a haft along the bottom-left→top-right diagonal, a head of
 * one of several shapes (single bit, bearded, broad fan, double bit, crescent),
 * and optional features — top spike, back pick/spike, notched edge, gem inset —
 * plus haft details (leather wrap bands, end ring / pommel). Procedural shapes
 * derived from the reference vocabulary, not copied pixels.
 */

type Head = "fan" | "bearded" | "broad" | "double" | "crescent" | "halberd";
const HEADS: Head[] = ["fan", "bearded", "broad", "double", "crescent", "halberd", "fan", "bearded", "crescent", "halberd"];

const pick = <T,>(r: Rng, arr: T[]): T => arr[Math.floor(r.float() * arr.length) % arr.length]!;
const norm = (x: number, y: number) => { const m = Math.hypot(x, y) || 1; return { x: x / m, y: y / m }; };

interface FanParams {
  neckTop: number;
  neckBot: number;
  halfTop: number;
  halfBot: number;
  depth: number;
  edgeBulge: number; // 0.6–1: convexity of the cutting edge
  notch: number; // 0 = smooth, >0 = teeth carved from the edge
  concave?: number; // >0 → concave valley in the edge (crescent / double-horn)
  fuller?: boolean; // dark engraved groove down the centre of the bit
}

export function drawAxe(pen: Pen): void {
  pen.rng.checkpoint();
  const r = pen.rng;

  const bounds = new Bounds(0, 0, pen.dimension, pen.dimension);
  const dscale = bounds.h / 32;
  const canvasDiag = Math.hypot(bounds.w, bounds.h);

  pen.clearCanvas();

  const head = pick(r, HEADS);
  const metal = r.float() < 0.1 ? pickCrystal(r) : pickBladeMetal(r); // ~10% enchanted crystal head
  const accent = r.float() < 0.5 ? GOLD : metal;

  // Head anchor sits at the top of the haft; the haft ends just past it so the
  // head's neck always covers the shaft top (no thin haft poking above the head).
  // A halberd sits lower so its long top blade has room to reach the corner.
  const headDiag = canvasDiag - Math.ceil((head === "halberd" ? r.range(12, 16) : r.range(5, 9)) * dscale);
  const u = new Vector(1, -1).normalize(); // along haft, toward the head (top-right)
  const n = new Vector(-1, -1).normalize(); // outward (top-left)
  const anchorDiag = headDiag - Math.floor(r.range(0, 2) * dscale);
  const haftColor = r.float() < 0.7 ? WOOD.mid : DARK.mid;
  pen.drawHaftHelper({ startDiag: 0, lengthDiag: anchorDiag + 2 * dscale, maxRadius: Math.max(1, r.range(1, 2)) * dscale, fractionalRadiusAllowed: true, color: haftColor });

  const anchor = diagToPosition(anchorDiag, bounds);

  const notch = r.float() < 0.3 ? r.rangeFloat(0.16, 0.32) : 0;
  const doubleSide = head === "double";
  const sign = doubleSide ? 0 : 1;

  if (head === "crescent") {
    // A tall bit with a concave cutting edge → two sweeping horns, still solidly
    // socketed to the haft (no floating gap like the old polar arc).
    const cres: FanParams = {
      neckTop: Math.max(1, 2 * dscale),
      neckBot: Math.max(1, 2 * dscale),
      halfTop: r.rangeFloat(6, 8.5) * dscale,
      halfBot: r.rangeFloat(6, 8.5) * dscale,
      depth: r.rangeFloat(10, 13) * dscale,
      edgeBulge: 0.8,
      notch,
      concave: r.rangeFloat(0.3, 0.45),
    };
    drawFan(pen, anchor, u, n, cres, metal, 1);
  } else {
    // Fan family: symmetric bit, extended beard, or wide broad head.
    const depth = r.rangeFloat(7, 11) * dscale;
    const base: FanParams = {
      neckTop: Math.max(1, 1.6 * dscale),
      neckBot: Math.max(1, 1.6 * dscale),
      halfTop: r.rangeFloat(5, 8) * dscale,
      halfBot: r.rangeFloat(5, 8) * dscale,
      depth,
      edgeBulge: 0.8,
      notch,
      fuller: notch === 0 && r.float() < 0.35, // engraved groove (not with a notched edge)
    };
    if (head === "bearded") {
      base.halfBot = r.rangeFloat(9, 13) * dscale; // edge hangs down toward the hilt
      base.neckBot = Math.max(1, 1.0 * dscale);
    } else if (head === "broad") {
      base.halfTop = r.rangeFloat(8, 11) * dscale;
      base.halfBot = r.rangeFloat(8, 11) * dscale;
      base.depth = r.rangeFloat(8, 12) * dscale;
    } else if (head === "halberd") {
      // Smaller bit — the long top blade is the halberd's signature.
      base.halfTop = r.rangeFloat(3.5, 5) * dscale;
      base.halfBot = r.rangeFloat(4.5, 7) * dscale; // slight beard
      base.depth = r.rangeFloat(7, 9) * dscale;
    }
    drawFan(pen, anchor, u, n, base, metal, 1);
    if (doubleSide) drawFan(pen, anchor, u, n, base, metal, -1);
    void sign;
  }

  // Top spike / finial: a wedge continuing up past the head. A halberd always
  // gets a LONG bladed spike (its signature); other heads a short finial.
  if (head === "halberd" || r.float() < 0.4) {
    const long = head === "halberd";
    const startDiag = long ? headDiag - Math.round(1 * dscale) : headDiag + Math.round(r.rangeFloat(1, 3) * dscale);
    const tp = diagToPosition(Math.min(canvasDiag - 1, startDiag), bounds);
    const len = long ? (canvasDiag - startDiag - 1) : r.rangeFloat(3, 6) * dscale;
    const half = long ? r.rangeFloat(1.6, 2.4) * dscale : r.rangeFloat(1, 1.8) * dscale;
    pen.fillCone(tp.x, tp.y, u.x, u.y, 0, len, half, metal.light, metal.shadow);
  }

  // Back pick/spike opposite the bit (single-bit heads only).
  if (!doubleSide && head !== "crescent" && r.float() < 0.5) {
    const beveled = r.float() < 0.5;
    pen.fillCone(anchor.x, anchor.y, -n.x, -n.y, 0, r.rangeFloat(3, 6) * dscale, (beveled ? 1.2 : 2.4) * dscale, metal.light, metal.shadow);
  }

  // Gem inset near the head's neck.
  const hasGem = r.float() < 0.28;
  const gem = hasGem ? pickGem(r) : null;
  if (gem) {
    const gc = new Vector(anchor.x + n.x * 1.5, anchor.y + n.y * 1.5);
    pen.drawRoundOrnamentHelper({ center: gc, radius: Math.max(1.2, 1.4 * dscale), colorLight: gem.light, colorDark: gem.shadow });
  } else if (r.float() < 0.4) {
    // Rivets: a couple of dark bolt studs where the bit is forged to the socket.
    const nR = r.float() < 0.5 ? 2 : 3;
    for (let i = 0; i < nR; i++) {
      const off = (1.6 + i * 2.2) * dscale;
      const rc = new Vector(anchor.x + n.x * off, anchor.y + n.y * off);
      pen.drawRoundOrnamentHelper({ center: rc, radius: Math.max(0.8, 0.6 * dscale), colorLight: DARK.mid, colorDark: DARK.shadow });
    }
  }

  // Hanging leather thongs from the head socket — short, stubby strips (NOT the
  // fluttering cloth ribbons the spears/tridents carry).
  if (r.float() < 0.3) {
    const th = r.float() < 0.5 ? WOOD : DARK;
    const nT = r.range(2, 4);
    const rootX = anchor.x - u.x * 1.5 * dscale;
    const rootY = anchor.y - u.y * 1.5 * dscale;
    for (let i = 0; i < nT; i++) {
      const sp = (i - (nT - 1) / 2) * 0.5;
      const dir = norm(-u.x + n.x * sp, -u.y + n.y * sp);
      pen.fillCone(rootX, rootY, dir.x, dir.y, 0, r.rangeFloat(3, 5) * dscale, Math.max(0.8, 0.8 * dscale), th.mid, th.shadow);
    }
  }

  // Enamel inlay band: a stripe of accent colour across the bit face.
  if (!gem && r.float() < 0.25) {
    const inlay = r.float() < 0.5 ? GOLD : pickCrystal(r);
    const d0 = r.rangeFloat(2.5, 4) * dscale;
    for (let t = -6 * dscale; t <= 6 * dscale; t += 0.5) {
      for (let du = -0.7 * dscale; du <= 0.7 * dscale; du += 0.5) {
        const x = Math.round(anchor.x + u.x * t + n.x * (d0 + du));
        const y = Math.round(anchor.y + u.y * t + n.y * (d0 + du));
        if (x < 0 || y < 0 || x >= bounds.w || y >= bounds.h) continue;
        if (pen.ctx.getImageData(x, y, 1, 1).data[3]! === 0) continue; // only over the bit
        pen.ctx.fillStyle = colorStr(du < 0 ? inlay.light : inlay.mid);
        pen.drawPixel(x, y);
      }
    }
  }

  // Mid-haft accent ferrule: a bright metal band girdling the shaft.
  if (r.float() < 0.35) {
    const bd = anchorDiag * r.rangeFloat(0.4, 0.7);
    const c = diagToPosition(bd, bounds);
    const litStr = colorStr(accent.light);
    const darkStr = colorStr(accent.shadow);
    for (let t = -2.2 * dscale; t <= 2.2 * dscale; t += 0.5) {
      for (let du = -0.7 * dscale; du <= 0.7 * dscale; du += 0.5) {
        const x = Math.round(c.x + n.x * t + u.x * du);
        const y = Math.round(c.y + n.y * t + u.y * du);
        if (x < 0 || y < 0 || x >= bounds.w || y >= bounds.h) continue;
        if (pen.ctx.getImageData(x, y, 1, 1).data[3]! === 0) continue; // only over the haft
        pen.ctx.fillStyle = t > 0.4 * dscale ? darkStr : litStr;
        pen.drawPixel(x, y);
      }
    }
  }

  // Haft wrap: a few dark leather bands across the shaft.
  if (r.float() < 0.6) drawHaftWrap(pen, bounds, u, n, dscale, r, anchorDiag);

  // Butt of the haft: end ring, or a capped pommel.
  const butt = r.float();
  if (butt < 0.4) {
    drawEndRing(pen, bounds, dscale, accent.mid, accent.shadow);
  } else if (butt < 0.75) {
    const pr = Math.ceil((0.6 + r.floatLow() * 0.7) * dscale);
    pen.drawRoundOrnamentHelper({ center: new Vector(Math.floor(pr), Math.ceil(bounds.h - pr - 1)), radius: pr, colorLight: accent.light, colorDark: accent.shadow });
  }

  pen.weather(r.floatLow() * 0.9); // battle-worn axe head
  pen.addBorder();

  // Gem bloom over the outline so it reads as light.
  if (gem) {
    const gc = new Vector(anchor.x + n.x * 1.5, anchor.y + n.y * 1.5);
    pen.drawGlow(gc, 3.2 * dscale, gem.light);
  }
}

/** Solid fan bit in the (s = along haft, d = outward·sign) frame. */
function drawFan(pen: Pen, anchor: Vector, u: Vector, n: Vector, p: FanParams, metal: { light: Color; mid: Color; shadow: Color; spec: Color }, sign: number): void {
  const B = pen.dimension;
  for (let x = 0; x < B; x++) {
    for (let y = 0; y < B; y++) {
      const px = x - anchor.x;
      const py = y - anchor.y;
      const s = px * u.x + py * u.y;
      const d = (px * n.x + py * n.y) * sign;
      if (d < 0 || d > p.depth) continue;
      const flare = d / p.depth;
      const halfT = p.neckTop + (p.halfTop - p.neckTop) * Math.pow(flare, 0.6);
      const halfB = p.neckBot + (p.halfBot - p.neckBot) * Math.pow(flare, 0.6);
      if (s > halfT || s < -halfB) continue;
      const sn = s > 0 ? s / (p.halfTop || 1) : s / (p.halfBot || 1);
      // Cutting edge: convex bulge, or (crescent) a concave valley → two horns.
      let edgeMax = p.concave && p.concave > 0
        ? p.depth * ((1 - p.concave) + p.concave * sn * sn)
        : p.depth * (p.edgeBulge + (1 - p.edgeBulge) * (1 - sn * sn));
      // Solid fans fill from the neck; crescents are a thin blade hollowed on the
      // inner side except for a socket column that keeps them attached to the haft.
      const socket = Math.max(p.neckTop, p.neckBot) + 1.5;
      const dInner = p.concave && Math.abs(s) >= socket ? Math.min(edgeMax * 0.3, 1.8) : 0;
      if (p.notch > 0) {
        const tri = Math.abs(((s / 3.2) % 2 + 2) % 2 - 1);
        edgeMax *= 1 - p.notch * (1 - tri);
      }
      if (d > edgeMax || d < dInner) continue;
      const lat = Math.abs(s) / (s > 0 ? p.halfTop : p.halfBot || 1);
      const edgeProx = edgeMax > 0 ? d / edgeMax : 0;
      // Higher contrast: dark thick neck → bright sharpened cutting edge.
      let shade = 0.16 + 0.5 * flare;
      if (edgeProx > 0.72) shade += 0.7 * ((edgeProx - 0.72) / 0.28);
      shade -= 0.28 * Math.pow(lat, 1.7);
      shade = Math.max(0, Math.min(1, shade));
      // Fuller: a dark engraved groove running the centre of the bit from the
      // neck out toward (but not into) the cutting edge.
      const inFuller = p.fuller && Math.abs(s) < Math.max(0.9, socket * 0.35) && flare > 0.15 && edgeProx < 0.7;
      const col = inFuller ? metal.shadow : edgeProx > 0.9 ? metal.spec : colorLerp(metal.shadow, metal.light, shade);
      pen.ctx.fillStyle = colorStr(col);
      pen.drawPixel(x, y);
    }
  }
}

/** A few dark leather wrap bands across the lower haft. */
function drawHaftWrap(pen: Pen, bounds: Bounds, u: Vector, n: Vector, dscale: number, r: Rng, headDiag: number): void {
  const bands = r.range(2, 5);
  const dark = colorStr(colorDarken(WOOD.shadow, 0.2));
  const lo = 4 * dscale;
  for (let i = 0; i < bands; i++) {
    const frac = 0.15 + 0.5 * (i / Math.max(1, bands));
    const diag = frac * headDiag + lo;
    const ortho = diag / Math.SQRT2;
    const cx = ortho;
    const cy = bounds.h - 1 - ortho;
    const halfW = 2.2 * dscale;
    for (let t = -halfW; t <= halfW; t += 0.5) {
      const x = Math.round(cx + n.x * t);
      const y = Math.round(cy + n.y * t);
      if (x < 0 || y < 0 || x >= bounds.w || y >= bounds.h) continue;
      // only paint over the existing haft
      if (pen.ctx.getImageData(x, y, 1, 1).data[3]! === 0) continue;
      pen.ctx.fillStyle = dark;
      pen.drawPixel(x, y);
      void u;
    }
  }
}

/** A metal ring at the butt of the haft. */
function drawEndRing(pen: Pen, bounds: Bounds, dscale: number, light: Color, dark: Color): void {
  const rad = 2.2 * dscale;
  const cx = rad + 1;
  const cy = bounds.h - 1 - rad - 1;
  const lit = colorStr(light);
  const dk = colorStr(dark);
  for (let x = Math.floor(cx - rad - 1); x <= Math.ceil(cx + rad + 1); x++) {
    for (let y = Math.floor(cy - rad - 1); y <= Math.ceil(cy + rad + 1); y++) {
      if (x < 0 || y < 0 || x >= bounds.w || y >= bounds.h) continue;
      const dd = Math.hypot(x - cx, y - cy);
      if (Math.abs(dd - rad) <= Math.max(0.8, 0.7 * dscale)) {
        pen.ctx.fillStyle = y - cy + (x - cx) > 0 ? dk : lit;
        pen.drawPixel(x, y);
      }
    }
  }
  void BRONZE;
}
