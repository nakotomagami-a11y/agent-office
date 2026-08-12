import type { Pen } from "../pen";
import { Vector, Bounds } from "../math";
import { pickHaft, pickPoleHead, pickGem, RIBBONS } from "../palette";
import { ribbonStyle } from "./spear";

// A haft topped by a crossbar and a fan of tapered prongs. Variations:
// trident (2-3 prongs, steel, optional barbs) vs pitchfork (3-4 thin tines).
export function drawTrident(pen: Pen): void {
  pen.rng.checkpoint();
  const r = pen.rng;

  const bounds = new Bounds(0, 0, pen.dimension, pen.dimension);
  const dscale = bounds.h / 32;

  pen.clearCanvas();

  const isPitchfork = r.float() < 0.3;
  // Trident is ALWAYS 3 prongs (a 2-prong bident reads as a tuning fork); a
  // pitchfork gets 3–4 thicker tines (5 thin ones read as a comb/rake).
  const prongCount = isPitchfork ? r.range(3, 5) : 3;
  const prongLen = (isPitchfork ? r.rangeFloat(11, 15) : r.rangeFloat(11, 15)) * dscale;
  const prongHalf = (isPitchfork ? r.rangeFloat(0.9, 1.2) : r.rangeFloat(1.2, 1.7)) * dscale;
  const baseSpread = (isPitchfork ? r.rangeFloat(4.5, 6.5) : r.rangeFloat(3.5, 5)) * dscale;
  const splay = isPitchfork ? r.rangeFloat(0.04, 0.12) : r.rangeFloat(0.1, 0.26);
  const hasBarbs = !isPitchfork && r.float() < 0.5;

  const forward = -Math.PI / 4;
  const perpFx = Math.cos(forward + Math.PI / 2);
  const perpFy = Math.sin(forward + Math.PI / 2);

  const baseOrtho = bounds.h - 1 - Math.ceil(prongLen * 0.72) - 1;
  const baseCenter = new Vector(baseOrtho, bounds.h - 1 - baseOrtho);

  const haftColor = pickHaft(r).mid;
  pen.drawHaftHelper({
    startDiag: 0,
    lengthDiag: (baseOrtho - prongHalf) * Math.sqrt(2),
    maxRadius: r.rangeFloat(1.1, 1.8) * dscale,
    fractionalRadiusAllowed: true,
    color: haftColor,
  });

  const head = pickPoleHead(r);
  const steel = head.light;
  const steelDark = head.shadow;

  // Crossbar (two cones back-to-back → a tapered bar).
  const barHalf = baseSpread / 2 + prongHalf;
  pen.fillCone(baseCenter.x, baseCenter.y, perpFx, perpFy, 0, barHalf, prongHalf * 1.5, steel, steelDark);
  pen.fillCone(baseCenter.x, baseCenter.y, -perpFx, -perpFy, 0, barHalf, prongHalf * 1.5, steel, steelDark);

  // Ball finials on the crossbar tips — a classic trident detail.
  if (!isPitchfork && r.float() < 0.5) {
    for (const sgn of [1, -1]) {
      const cx = baseCenter.x + perpFx * barHalf * sgn;
      const cy = baseCenter.y + perpFy * barHalf * sgn;
      pen.drawRoundOrnamentHelper({ center: new Vector(cx, cy), radius: Math.max(1, prongHalf * 0.9), colorLight: steel, colorDark: steelDark });
    }
  }

  // Prongs fanning off the crossbar.
  for (let i = 0; i < prongCount; i++) {
    const frac = prongCount === 1 ? 0.5 : i / (prongCount - 1);
    const lat = (frac - 0.5) * baseSpread;
    const bx = baseCenter.x + perpFx * lat;
    const by = baseCenter.y + perpFy * lat;
    const a = forward + (frac - 0.5) * 2 * splay;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    // Middle tine of a trident runs a touch longer.
    const isMid = !isPitchfork && prongCount === 3 && i === 1;
    const len = prongLen * (isMid ? 1.0 : isPitchfork ? 1.0 : 0.92);
    pen.fillCone(bx, by, dx, dy, 0, len, prongHalf, steel, steelDark);

    if (hasBarbs && (i === 0 || i === prongCount - 1)) {
      const side = i === 0 ? 1 : -1;
      const ba = a + side * Math.PI * 0.62;
      const barbX = bx + dx * len * 0.62;
      const barbY = by + dy * len * 0.62;
      pen.fillCone(barbX, barbY, Math.cos(ba), Math.sin(ba), 0, prongLen * 0.28, prongHalf * 0.9, steel, steelDark);
    }
  }

  // Ferrule where the head meets the haft — a small collar, not a ball.
  pen.drawRoundOrnamentHelper({
    center: baseCenter,
    radius: prongHalf + 0.3 * dscale,
    colorLight: steel,
    colorDark: steelDark,
  });

  // Gem set into the crossbar centre.
  if (!isPitchfork && r.float() < 0.3) {
    const g = pickGem(r);
    pen.drawRoundOrnamentHelper({ center: baseCenter, radius: Math.max(1.1, 1.2 * dscale), colorLight: g.light, colorDark: g.shadow });
  }

  // Ribbon streamers hanging from the crossbar, fanning down toward the hilt.
  if (r.float() < 0.4) {
    const cloth = RIBBONS[Math.floor(r.float() * RIBBONS.length) % RIBBONS.length]!;
    const opts = ribbonStyle(r, dscale);
    const nRib = r.range(2, 4);
    for (let i = 0; i < nRib; i++) {
      const side = (i - (nRib - 1) / 2) * 0.7;
      const dx = -Math.SQRT1_2 + perpFx * side;
      const dy = Math.SQRT1_2 + perpFy * side;
      const m = Math.hypot(dx, dy) || 1;
      pen.drawRibbon(baseCenter.x, baseCenter.y, dx / m, dy / m, r.rangeFloat(5, 7.5) * dscale, Math.max(1.6, 1.7 * dscale), cloth, opts);
    }
  }

  // Base cap.
  if (r.float() < 0.6) {
    const baseR = Math.ceil(r.rangeFloat(1, 1.7) * dscale);
    pen.drawRoundOrnamentHelper({
      center: new Vector(Math.floor(baseR) + 1, Math.ceil(bounds.h - baseR - 2)),
      radius: baseR,
      colorLight: pickHaft(r).light,
    });
  }

  pen.weather(r.floatLow() * 0.8);
  pen.addBorder();
}
