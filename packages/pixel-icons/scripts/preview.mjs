// Headless preview: render a grid of generated icons to a PNG so the shading
// can be eyeballed against the tiny-swords pack. Run with bun (handles the TS
// source imports directly): `bun scripts/preview.mjs [out.png] [nativeDim]`.
import { createCanvas } from "@napi-rs/canvas";
import { writeFileSync } from "node:fs";
import { IconGenerator } from "../src/generator.ts";

const CLASSES = ["blades", "spears", "axes", "staffs", "tridents"];
const COLS = 8;
const out = process.argv[2] ?? "preview-new.png";
const nativeDim = Number(process.argv[3] ?? 56); // matches WeaponIcon at size ~80
const celSteps = process.argv[4] != null ? Number(process.argv[4]) : undefined;
const cell = nativeDim;
const pad = 6;
const scale = 2; // upscale the sheet so pixels are legible

const rows = CLASSES.length;
const sheetW = COLS * (cell + pad) + pad;
const sheetH = rows * (cell + pad) + pad;
const sheet = createCanvas(sheetW * scale, sheetH * scale);
const sctx = sheet.getContext("2d");
sctx.imageSmoothingEnabled = false;
sctx.fillStyle = "#20222b";
sctx.fillRect(0, 0, sheetW * scale, sheetH * scale);

for (let row = 0; row < rows; row++) {
  const cls = CLASSES[row];
  for (let col = 0; col < COLS; col++) {
    const tile = createCanvas(nativeDim, nativeDim);
    const tctx = tile.getContext("2d");
    new IconGenerator(tctx, nativeDim, celSteps != null ? { celSteps } : {}).generate({ seed: `seed-${cls}-${col}`, iconClass: cls });
    const x = pad + col * (cell + pad);
    const y = pad + row * (cell + pad);
    sctx.drawImage(tile, x * scale, y * scale, cell * scale, cell * scale);
  }
}

writeFileSync(out, sheet.toBuffer("image/png"));
console.log(`wrote ${out} (${sheetW * scale}x${sheetH * scale}, nativeDim=${nativeDim})`);
