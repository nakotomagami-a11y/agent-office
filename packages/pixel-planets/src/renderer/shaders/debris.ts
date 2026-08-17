/**
 * Debris field shader.
 *
 * Scatters small shaded rock chunks in the space AROUND a planet — the
 * "shattered / damaged world" look: a cloud of broken fragments orbiting the
 * body, denser near the surface and thinning outward. Rendered in full-canvas
 * UV on an oversized canvas (canvasScale ≥ 2) so the field has room around the
 * (slightly shrunk) planet disc.
 *
 * Method: divide the canvas into a grid of cells; each cell may hold one chunk
 * at a hashed position with a hashed radius. Presence is weighted by a radial
 * falloff (more chunks hugging the planet) and biased toward the "blast" side
 * (+x). Each chunk is 2-3 tone shaded from `light_origin` so it reads as solid
 * rock rather than a flat dot. Chunks are static (position is seed/space based).
 *
 * colors[0] = lit face, colors[1] = mid, colors[2] = shadow / rim.
 */
export const DEBRIS_FRAG_SRC = /* glsl */`#version 300 es
precision mediump float;

uniform float pixels;
uniform vec2  light_origin;
uniform vec4  colors[3];
uniform float planet_r;   // planet radius in canvas UV
uniform float field_r;    // outer radius of the debris field
uniform float density;    // number of grid cells across the canvas
uniform float seed;
in  vec2 UV;
layout(location=0) out vec4 fragColor;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 15.5453 * (seed + 1.0));
}
vec2 hash2(vec2 p) {
  return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * (43758.5453 * (seed + 1.0)));
}

void main() {
  vec2 uv = floor(UV * pixels) / pixels;
  float d = distance(uv, vec2(0.5));

  // Only in the annulus around the planet.
  if (d < planet_r * 1.03 || d > field_r) { fragColor = vec4(0.0); return; }

  // More chunks near the planet, thinning outward; more on the +x "blast" side.
  float falloff  = 1.0 - smoothstep(planet_r, field_r, d);
  float sideBias = smoothstep(-0.35, 0.55, uv.x - 0.5);
  float threshold = (0.06 + falloff * 0.26) * (0.45 + sideBias * 0.9);

  vec2 cell = floor(uv * density);
  vec2 f    = fract(uv * density);
  if (hash(cell) > threshold) { fragColor = vec4(0.0); return; }

  vec2  center = 0.25 + hash2(cell + 3.17) * 0.5;   // chunk center inside cell
  float radius = 0.14 + hash(cell + 7.31) * 0.20;   // chunk radius (cell units)
  float cd     = distance(f, center);
  if (cd > radius) { fragColor = vec4(0.0); return; }

  // Fake lighting: lit on the side of the chunk facing light_origin.
  vec2  lightDir = normalize(light_origin - vec2(0.5));
  vec2  localN   = normalize(f - center + vec2(0.0001));
  float ndl      = dot(localN, lightDir);

  vec4 col = colors[1];
  if (ndl >  0.25) col = colors[0];
  if (ndl < -0.20) col = colors[2];
  if (cd > radius * 0.82) col = colors[2];   // dark rim

  fragColor = vec4(col.rgb, col.a);
}`;
