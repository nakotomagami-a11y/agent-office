// Labeled audit grid for a weapon class, so degenerate rolls are easy to spot
// and reproduce. Usage: bun scripts/audit.mjs <class> [count] [bg] [seedPrefix]
import { createCanvas } from "@napi-rs/canvas";
import { writeFileSync } from "node:fs";
import { IconGenerator } from "../src/generator.ts";

const cls = process.argv[2] ?? "axes";
const count = Number(process.argv[3] ?? 80);
const bg = process.argv[4] ?? "#e9eaec";
const prefix = process.argv[5] ?? cls.slice(0, 2);
const dim = 56, disp = 98, cols = 10, gap = 6;
const rows = Math.ceil(count / cols);
const W = gap + cols * (disp + gap);
const H = gap + rows * (disp + gap);
const s = createCanvas(W, H).getContext("2d");
s.imageSmoothingEnabled = false;
s.fillStyle = bg; s.fillRect(0, 0, W, H);
s.font = "9px sans-serif";
for (let i = 0; i < count; i++) {
  const seed = prefix + i;
  const t = createCanvas(dim, dim);
  new IconGenerator(t.getContext("2d"), dim).generate({ seed, iconClass: cls });
  s.imageSmoothingEnabled = false;
  const x = gap + (i % cols) * (disp + gap);
  const y = gap + Math.floor(i / cols) * (disp + gap);
  s.drawImage(t, x, y, disp - 12, disp - 12);
  s.fillStyle = "#555"; s.fillText(seed, x + 1, y + disp - 3);
}
const out = `/tmp/audit-${cls}.png`;
writeFileSync(out, s.canvas.toBuffer("image/png"));
console.log(`${out} (${count} ${cls}, ${W}x${H})`);
