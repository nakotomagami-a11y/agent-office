// Side-by-side: our generated weapons vs the real Tiny-Swords weapon sprites,
// at matched display scale, on both theme backgrounds. Run after every phase:
//   bun scripts/compare.mjs [nativeDim] [celSteps]
// Writes /tmp/compare-dark.png and /tmp/compare-light.png.
import { loadImage, createCanvas } from "@napi-rs/canvas";
import { writeFileSync } from "node:fs";
import { IconGenerator } from "../src/generator.ts";

const nativeDim = Number(process.argv[2] ?? 56);
const celSteps = process.argv[3] != null ? Number(process.argv[3]) : undefined;
const DISP = 88;
const GAP = 10;
const CLASSES = ["blades", "spears", "axes", "staffs", "tridents"];
const COLS = 6;
const UNIT_DIR = "../../apps/web/public/units/black/";
const REF = [
  ["warrior-idle.png", 192],
  ["lancer-idle.png", 320],
  ["pawn-axe.png", 192],
  ["pawn-hammer.png", 192],
  ["pawn-knife.png", 192],
];

function autocrop(img, fs) {
  const c = createCanvas(fs, fs);
  const x = c.getContext("2d");
  x.drawImage(img, 0, 0, fs, fs, 0, 0, fs, fs);
  const d = x.getImageData(0, 0, fs, fs).data;
  let minx = fs, miny = fs, maxx = 0, maxy = 0;
  for (let y = 0; y < fs; y++) for (let px = 0; px < fs; px++)
    if (d[(px + y * fs) * 4 + 3] > 0) { if (px < minx) minx = px; if (y < miny) miny = y; if (px > maxx) maxx = px; if (y > maxy) maxy = y; }
  return { c, minx, miny, w: maxx - minx + 1, h: maxy - miny + 1 };
}

async function build(bg) {
  const refs = [];
  for (const [f, fs] of REF) refs.push(autocrop(await loadImage(UNIT_DIR + f), fs));
  const refScale = DISP / Math.max(...refs.map((r) => r.h));
  const rows = CLASSES.length;
  const W = GAP + COLS * (DISP + GAP);
  const H = GAP + Math.round(DISP * 1.4) + GAP + rows * (DISP + GAP);
  const sheet = createCanvas(W, H);
  const s = sheet.getContext("2d");
  s.imageSmoothingEnabled = false;
  s.fillStyle = bg; s.fillRect(0, 0, W, H);
  // reference strip
  s.fillStyle = "#888"; s.font = "11px sans-serif"; s.fillText("TINY SWORDS (reference)", GAP, 12);
  let ox = GAP;
  for (const r of refs) {
    s.imageSmoothingEnabled = false;
    s.drawImage(r.c, r.minx, r.miny, r.w, r.h, ox, 18, Math.round(r.w * refScale), Math.round(r.h * refScale));
    ox += Math.round(r.w * refScale) + GAP;
  }
  // our weapons
  const y0 = GAP + Math.round(DISP * 1.4) + GAP;
  s.fillStyle = "#888"; s.fillText(`OURS (native ${nativeDim}${celSteps != null ? `, cel ${celSteps}` : ""})`, GAP, y0 - 4);
  CLASSES.forEach((cls, r) => {
    for (let c = 0; c < COLS; c++) {
      const t = createCanvas(nativeDim, nativeDim);
      const tc = t.getContext("2d");
      new IconGenerator(tc, nativeDim, celSteps != null ? { celSteps } : {}).generate({ seed: `seed-${cls}-${c}`, iconClass: cls });
      s.imageSmoothingEnabled = false;
      s.drawImage(t, GAP + c * (DISP + GAP), y0 + r * (DISP + GAP), DISP, DISP);
    }
  });
  return sheet;
}

writeFileSync("/tmp/compare-dark.png", (await build("#202020")).toBuffer("image/png"));
writeFileSync("/tmp/compare-light.png", (await build("#f2f3f5")).toBuffer("image/png"));
console.log(`compare written (native ${nativeDim})`);
