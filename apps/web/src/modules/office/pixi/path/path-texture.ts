// Pixi bridge for the procedural path generator: turns a classified RGBA tile
// into a cached nearest-filtered GPU texture. Keyed by material + neighbourhood
// + world cell, so each distinct painted cell is generated once and reused
// across scene rebuilds. Call `clearPathTextureCache()` when the material set
// or theme changes.

import { Texture } from "pixi.js";
import { PATH_MATERIALS, DEFAULT_PATH_MATERIAL, type PathMaterialId } from "./materials";
import { renderPathTileRGBA, neighborhoodMask, TILE, type Neighborhood } from "./classify";

const cache = new Map<string, Texture>();

export function getPathTexture(
  materialId: PathMaterialId,
  hood: Neighborhood,
  cellX: number,
  cellY: number,
): Texture {
  const key = `${materialId}:${neighborhoodMask(hood)}:${cellX}:${cellY}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const cfg = PATH_MATERIALS[materialId] ?? PATH_MATERIALS[DEFAULT_PATH_MATERIAL];
  const rgba = renderPathTileRGBA(cfg, hood, cellX, cellY);

  const canvas = document.createElement("canvas");
  canvas.width = TILE;
  canvas.height = TILE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Texture.EMPTY;
  const img = ctx.createImageData(TILE, TILE);
  img.data.set(rgba);
  ctx.putImageData(img, 0, 0);

  const tex = Texture.from(canvas);
  tex.source.scaleMode = "nearest";
  cache.set(key, tex);
  return tex;
}

export function clearPathTextureCache(): void {
  for (const tex of cache.values()) tex.destroy(true);
  cache.clear();
}
