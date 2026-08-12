import type { Pen, BladeStyle } from "../pen";
import type { Color } from "../types";
import { Vector, Bounds, diagToPosition } from "../math";
import { Rng } from "../rng";
import { colorStr, colorDarken } from "../color";
import { GOLD, WOOD, DARK, pickPoleHead, pickCrystal, pickGem, RIBBONS } from "../palette";

/**
 * Mix-and-match polearm: a long haft along the bottom-left→top-right diagonal
 * topped by one of several head types (leaf, broad leaf, winged/lugged, glaive,
 * harpoon, needle), a metal ferrule collar at the join, optional leather wrap
 * bands down the shaft, and a butt cap / spike / ring. Head shapes derived from
 * spear reference art, built procedurally on `drawBladeHelper`.
 */

interface HeadCfg {
  len: [number, number]; // head length along the diagonal (base px)
  radius: [number, number]; // head half-width (base px)
  taper: number;
  winged?: boolean; // boar-spear lugs at the base
  harpoon?: boolean; // backward barbs
  prongs?: boolean; // partisan/ranseur: two forward side blades flanking the head
  forked?: boolean; // the head splits into a two-pronged fork at the tip
  style: (r: Rng) => BladeStyle;
}

const HEADS: Record<string, HeadCfg> = {
  // Spearheads taper to a POINT — high taperFactor, or they read as blunt paddles.
  leaf: { len: [12, 16], radius: [1.3, 1.9], taper: 0.58, style: () => ({ widthAmp: 0, bulge: 0.35 }) },
  pike: { len: [9, 13], radius: [1.1, 1.6], taper: 0.62, style: () => ({ widthAmp: 0 }) }, // simple sharp point
  broadleaf: { len: [11, 15], radius: [2, 2.8], taper: 0.5, style: () => ({ widthAmp: 0, bulge: 0.45 }) },
  winged: { len: [12, 16], radius: [1.3, 1.9], taper: 0.56, winged: true, style: () => ({ widthAmp: 0, bulge: 0.3 }) },
  glaive: { len: [15, 20], radius: [1.8, 2.6], taper: 0.34, style: () => ({ widthAmp: 0, curve: Math.PI / 80, curveDir: 1, singleEdge: true, maxTurn: Math.PI / 2.6, clip: 0.16 }) },
  harpoon: { len: [12, 16], radius: [1.3, 1.9], taper: 0.5, harpoon: true, style: () => ({ widthAmp: 0, singleEdge: true }) },
  needle: { len: [14, 19], radius: [0.8, 1.3], taper: 0.14, style: () => ({ widthAmp: 0, fuller: true }) },
  partisan: { len: [13, 17], radius: [1.2, 1.7], taper: 0.55, prongs: true, style: () => ({ widthAmp: 0, bulge: 0.25 }) },
  forked: { len: [10, 13], radius: [1.2, 1.7], taper: 0.5, forked: true, style: () => ({ widthAmp: 0, bulge: 0.2 }) },
};
const HEAD_KEYS = ["leaf", "leaf", "pike", "pike", "broadleaf", "winged", "glaive", "glaive", "harpoon", "needle", "partisan", "forked"];

const pick = <T,>(r: Rng, arr: T[]): T => arr[Math.floor(r.float() * arr.length) % arr.length]!;
const rf = (r: Rng, lo: number, hi: number) => r.rangeFloat(lo, hi);
const norm = (x: number, y: number) => { const m = Math.hypot(x, y) || 1; return { x: x / m, y: y / m }; };

/** One of a few ribbon looks: straight, fluttering wave, twisting fold, or a
 *  forked swallowtail. Shared by spear + trident. */
export function ribbonStyle(r: Rng, dscale: number): { wave?: number; waveLen?: number; taper?: boolean; twist?: boolean; swallowtail?: boolean } {
  const kind = r.float();
  if (kind < 0.28) return { taper: true, twist: true }; // near-straight, folded
  if (kind < 0.62) return { wave: r.rangeFloat(1.6, 3) * dscale, waveLen: r.rangeFloat(5, 8) * dscale, taper: true, twist: true }; // fluttering
  if (kind < 0.82) return { wave: r.rangeFloat(1.2, 2.2) * dscale, waveLen: r.rangeFloat(5, 7) * dscale, taper: false, twist: true, swallowtail: true }; // swallowtail banner
  return { wave: r.rangeFloat(2.4, 3.8) * dscale, waveLen: r.rangeFloat(4, 6) * dscale, taper: true, twist: true }; // strong flutter
}

export function drawSpear(pen: Pen): void {
  pen.rng.checkpoint();
  const r = pen.rng;

  const bounds = new Bounds(0, 0, pen.dimension, pen.dimension);
  const canvasDiag = Math.hypot(bounds.w, bounds.h);
  const dscale = bounds.h / 32;

  pen.clearCanvas();

  const cfg = HEADS[pick(r, HEAD_KEYS)]!;
  const headLen = rf(r, cfg.len[0], cfg.len[1]) * dscale;
  const startRadius = Math.max(1, Math.ceil(rf(r, cfg.radius[0], cfg.radius[1]) * dscale));
  const tipStartDiag = canvasDiag - headLen;

  const u = new Vector(1, -1).normalize(); // toward the head (top-right)
  const n = new Vector(-1, -1).normalize(); // outward (top-left)

  // Haft first, head drawn over it.
  const haftColor = r.float() < 0.7 ? WOOD.mid : DARK.mid;
  const haftR = Math.max(1, rf(r, 1.1, 1.7) * dscale);
  pen.drawHaftHelper({ startDiag: 0, lengthDiag: tipStartDiag + 2 * dscale, maxRadius: haftR, fractionalRadiusAllowed: true, color: haftColor });

  const headStyle = cfg.style(r);
  if (r.float() < 0.1) headStyle.metal = pickCrystal(r); // ~10% enchanted crystal head
  const tip = pen.drawBladeHelper({
    startDiag: tipStartDiag,
    taperFactor: cfg.taper + rf(r, -0.03, 0.03),
    startRadius,
    style: headStyle,
  });

  const base = diagToPosition(tipStartDiag, bounds);

  // Partisan/ranseur: two forward-and-out side blades flanking the central head.
  if (cfg.prongs) {
    const dirA = norm(u.x * 1.3 + n.x, u.y * 1.3 + n.y);
    const dirB = norm(u.x * 1.3 - n.x, u.y * 1.3 - n.y);
    const len = rf(r, 5, 7) * dscale;
    const half = Math.max(1.1, 1 * dscale);
    const off = startRadius * 0.4;
    pen.fillCone(base.x, base.y, dirA.x, dirA.y, off, len, half, tip.tipColor, tip.hiltColor);
    pen.fillCone(base.x, base.y, dirB.x, dirB.y, off, len, half, tip.tipColor, tip.hiltColor);
  }

  // Forked head: a second tine parallel to the head, offset perpendicular and
  // diverging slightly → the head reads as a two-pronged fork.
  if (cfg.forked) {
    const off = startRadius + 1.6 * dscale;
    const rootX = base.x + n.x * off;
    const rootY = base.y + n.y * off;
    const dir = norm(u.x + n.x * 0.22, u.y + n.y * 0.22);
    pen.fillCone(rootX, rootY, dir.x, dir.y, 0, headLen * 0.85, Math.max(1, startRadius * 0.95), tip.tipColor, tip.hiltColor);
  }

  // Winged lugs: two short back-swept prongs at the head's base.
  if (cfg.winged) {
    const dirA = norm(-u.x + n.x, -u.y + n.y);
    const dirB = norm(-u.x - n.x, -u.y - n.y);
    const len = rf(r, 3, 4.5) * dscale;
    const half = Math.max(1.2, 1.1 * dscale);
    pen.fillCone(base.x, base.y, dirA.x, dirA.y, 0, len, half, tip.tipColor, tip.hiltColor);
    pen.fillCone(base.x, base.y, dirB.x, dirB.y, 0, len, half, tip.tipColor, tip.hiltColor);
  }

  // Harpoon barbs: back-swept spikes down both sides of the head.
  if (cfg.harpoon) {
    const back = { x: -u.x, y: -u.y };
    const dirA = norm(back.x + n.x * 1.5, back.y + n.y * 1.5);
    const dirB = norm(back.x - n.x * 1.5, back.y - n.y * 1.5);
    const startO = tip.startOrtho + Math.round(2 * dscale);
    const endO = pen.dimension - Math.round(headLen * 0.4);
    const spacing = Math.max(3, Math.round(3 * dscale));
    for (let o = startO; o < endO; o += spacing) {
      const cx = o, cy = pen.dimension - 1 - o;
      pen.fillCone(cx, cy, dirA.x, dirA.y, startRadius * 0.7, 2 * dscale, Math.max(1.2, 1 * dscale), tip.tipColor, tip.hiltColor);
      pen.fillCone(cx, cy, dirB.x, dirB.y, startRadius * 0.7, 2 * dscale, Math.max(1.2, 1 * dscale), tip.tipColor, tip.hiltColor);
    }
  }

  // Ferrule: a metal collar band where the head socket meets the haft.
  if (r.float() < 0.85) {
    const metal = r.float() < 0.55 ? GOLD : pickPoleHead(r);
    drawCollar(pen, bounds, u, n, base.x, base.y, haftR + 1.2 * dscale, Math.max(0.8, 0.8 * dscale), metal.light, metal.shadow);
  }

  // Langets: two thin metal reinforcing straps running down the shaft from the
  // socket (a real polearm feature that also decorates).
  if (r.float() < 0.3) {
    const strap = r.float() < 0.5 ? GOLD : pickPoleHead(r);
    const litStr = colorStr(strap.mid);
    const len = rf(r, 5, 8) * dscale;
    for (const sgn of [1, -1]) {
      for (let l = 0; l < len; l += 0.5) {
        const cx = base.x - u.x * l + n.x * (haftR - 0.2) * sgn;
        const cy = base.y - u.y * l + n.y * (haftR - 0.2) * sgn;
        const x = Math.round(cx), y = Math.round(cy);
        if (x < 0 || y < 0 || x >= bounds.w || y >= bounds.h) continue;
        if (pen.ctx.getImageData(x, y, 1, 1).data[3]! === 0) continue; // only over the haft
        pen.ctx.fillStyle = litStr;
        pen.drawPixel(x, y);
      }
    }
  }

  // Gem set into the spearhead base.
  if (r.float() < 0.18 && !cfg.prongs && !cfg.forked) {
    const g = pickGem(r);
    const gc = new Vector(tip.startOrtho + u.x * 2 * dscale, pen.dimension - 1 - tip.startOrtho + u.y * 2 * dscale);
    pen.drawRoundOrnamentHelper({ center: gc, radius: Math.max(1, 1 * dscale), colorLight: g.light, colorDark: g.shadow });
  }

  // Ribbon streamers hanging from the socket — fluttering cloth strips that fan
  // back toward the hilt. One of a few styles per spear for variety.
  if (r.float() < 0.45) {
    const cloth = pick(r, RIBBONS);
    const opts = ribbonStyle(r, dscale);
    const nRib = r.range(2, 4);
    const rootO = tip.startOrtho - Math.round(1 * dscale);
    for (let i = 0; i < nRib; i++) {
      const side = (i - (nRib - 1) / 2) * 0.75;
      const dir = norm(-u.x + n.x * side, -u.y + n.y * side);
      pen.drawRibbon(rootO, pen.dimension - 1 - rootO, dir.x, dir.y, rf(r, 5, 8) * dscale, Math.max(1.6, 1.7 * dscale), cloth, opts);
    }
  } else if (r.float() < 0.4) {
    // Pennant flag: a broad triangular banner pointing OUT from the upper shaft
    // (a lance decoration, distinct from the thin hanging ribbons).
    const cloth = pick(r, RIBBONS);
    const rootDiag = tipStartDiag - rf(r, 2, 5) * dscale;
    const rp = diagToPosition(rootDiag, bounds);
    const dir = norm(n.x - u.x * 0.35, n.y - u.y * 0.35);
    pen.drawRibbon(rp.x, rp.y, dir.x, dir.y, rf(r, 7, 10) * dscale, rf(r, 3.2, 4.4) * dscale, cloth, { wave: 1.2 * dscale, waveLen: 7 * dscale, taper: true, twist: true });
  }

  // Leather wrap bands down the shaft.
  if (r.float() < 0.7) {
    const bands = r.range(2, 5);
    const dark = colorStr(colorDarken(WOOD.shadow, 0.2));
    for (let i = 0; i < bands; i++) {
      const diag = tipStartDiag * (0.2 + 0.55 * (i / Math.max(1, bands)));
      const c = diagToPosition(diag, bounds);
      drawBand(pen, bounds, n, c.x, c.y, haftR + 0.6 * dscale, dark);
    }
  }

  // Butt: cap, downward spike, or ring.
  const butt = r.float();
  const accent = r.float() < 0.5 ? GOLD : pickPoleHead(r);
  if (butt < 0.4) {
    // Small cap flush with the shaft — never a ball wider than the haft.
    const pr = Math.max(1, haftR + 0.4 * dscale);
    pen.ctx.clearRect(-1, bounds.h, Math.ceil(pr) + 1, -(Math.ceil(pr) + 1));
    pen.drawRoundOrnamentHelper({ center: new Vector(Math.floor(pr), Math.ceil(bounds.h - pr - 1)), radius: Math.max(1, haftR * 0.85), colorLight: accent.light, colorDark: accent.shadow });
  } else if (butt < 0.65) {
    pen.fillCone(0, bounds.h - 1, -u.x, -u.y, 0, rf(r, 3, 5) * dscale, Math.max(1, haftR * 0.9), accent.light, accent.shadow);
  }

  pen.weather(r.floatLow() * 0.8);
  pen.addBorder();
}

/** A metal collar hugging the shaft (perpendicular band, a couple px deep). */
function drawCollar(pen: Pen, bounds: Bounds, u: Vector, n: Vector, cx: number, cy: number, halfW: number, halfDeep: number, light: Color, dark: Color): void {
  const litStr = colorStr(light);
  const darkStr = colorStr(dark);
  for (let t = -halfW; t <= halfW; t += 0.5) {
    for (let uu = -halfDeep; uu <= halfDeep; uu += 0.5) {
      const x = Math.round(cx + n.x * t + u.x * uu);
      const y = Math.round(cy + n.y * t + u.y * uu);
      if (x < 0 || y < 0 || x >= bounds.w || y >= bounds.h) continue;
      pen.ctx.fillStyle = t > halfW * 0.35 ? darkStr : litStr;
      pen.drawPixel(x, y);
    }
  }
}

/** A thin dark leather band across the shaft (painted only over existing haft). */
function drawBand(pen: Pen, bounds: Bounds, n: Vector, cx: number, cy: number, halfW: number, colorStrDark: string): void {
  for (let t = -halfW; t <= halfW; t += 0.5) {
    const x = Math.round(cx + n.x * t);
    const y = Math.round(cy + n.y * t);
    if (x < 0 || y < 0 || x >= bounds.w || y >= bounds.h) continue;
    if (pen.ctx.getImageData(x, y, 1, 1).data[3]! === 0) continue;
    pen.ctx.fillStyle = colorStrDark;
    pen.drawPixel(x, y);
  }
}
