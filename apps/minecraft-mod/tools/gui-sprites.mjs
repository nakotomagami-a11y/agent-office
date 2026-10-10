// Generates the tablet's own GUI sprites (status dots; everything else is vanilla's) into
// src/main/resources/assets/agentoffice/textures/gui/sprites/tablet/. Run: node tools/gui-sprites.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "../src/main/resources/assets/agentoffice/textures/gui/sprites/tablet");

const CRC = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
const crc32 = (buf) => {
  let c = -1;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
};
const chunk = (type, data) => {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
};

/** px: rows of 0xRRGGBBAA numbers (0 = transparent). */
function png(px) {
  const h = px.length;
  const w = px[0].length;
  const raw = Buffer.alloc(h * (w * 4 + 1));
  px.forEach((row, y) => row.forEach((c, x) => raw.writeUInt32BE(c >>> 0, y * (w * 4 + 1) + 1 + x * 4)));
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** "#RRGGBB" or "#RRGGBBAA" → 0xRRGGBBAA. */
const hex = (s) => (s ? parseInt(s.length === 7 ? s.slice(1) + "ff" : s.slice(1), 16) >>> 0 : 0);

/** Rings by distance to the nearest edge: rings[r] colours ring r, deeper is fill; chamfer cuts the corners. */
function sprite(w, h, { chamfer = 0, rings, fill }) {
  const px = [];
  for (let y = 0; y < h; y++) {
    const row = [];
    for (let x = 0; x < w; x++) {
      const dL = x, dT = y, dR = w - 1 - x, dB = h - 1 - y;
      const r = Math.min(dL, dT, dR, dB);
      const cx = Math.min(dL, dR), cy = Math.min(dT, dB);
      if (cx + cy < chamfer) { row.push(0); continue; }
      const ring = rings[r];
      if (ring === undefined) { row.push(hex(fill)); continue; }
      row.push(hex(ring));
    }
    px.push(row);
  }
  return px;
}

const K = "#000000";
/** 6×6 status dots, drawn 1:1 (no mcmeta): black ring, fill, a glint top-left and shade bottom-right. */
for (const [name, [fill, hi, sh]] of Object.entries({
  dot_idle: ["#3A3F52", "#50566C", "#2A2E3D"],
  dot_running: ["#4EB96F", "#8EE0A6", "#2F7D47"],
  dot_running_dim: ["#2F7D47", "#4EB96F", "#1F5530"],
  dot_attention: ["#FBBF24", "#FDE68A", "#B7860F"],
})) {
  const px = sprite(6, 6, { chamfer: 1, fill, rings: [K] });
  for (const [x, y] of [[1, 1], [2, 1], [1, 2]]) px[y][x] = hex(hi);
  for (const [x, y] of [[4, 3], [3, 4], [4, 4]]) px[y][x] = hex(sh);
  const file = join(OUT, `${name}.png`);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, png(px));
}
console.log(`wrote 4 dots to ${OUT}`);
