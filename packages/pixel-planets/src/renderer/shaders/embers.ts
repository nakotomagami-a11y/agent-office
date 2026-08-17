/**
 * Floating embers shader.
 *
 * Scatters small glowing spark particles in a band hugging the planet's edge
 * and drifting a little way out into space — the "sparks coming off a molten
 * world" look. Space is diced into a grid; each cell may hold one spark (gated
 * by `density`), placed at a hashed position and twinkling over time. Sparks
 * are densest right at the silhouette and thin out with distance, and brighter
 * on the lit hemisphere.
 *
 * Works in full-canvas UV (no disc remap); `planet_r` is the disc radius in
 * canvas UV. Meant to be composited last, on an oversized canvas so the outer
 * embers have room. colors[0] = hot core, [1] = mid, [2] = dim outer.
 */
export const EMBERS_FRAG_SRC = /* glsl */`#version 300 es
precision mediump float;

uniform float pixels;
uniform vec2  light_origin;
uniform float time_speed;
uniform vec4  colors[3];
uniform float planet_r;      // planet radius in canvas UV
uniform float ember_reach;   // how far embers drift beyond the edge
uniform float density;       // 0..1 fraction of cells holding a spark
uniform float grid;          // cell count across the canvas
uniform float seed;
uniform float time;
in  vec2 UV;
layout(location=0) out vec4 fragColor;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y * seed);
}
vec2 hash22(vec2 p) {
  float n = hash21(p);
  return vec2(n, hash21(p + n));
}

void main() {
  vec2 uv = floor(UV * pixels) / pixels;
  float d = distance(uv, vec2(0.5));
  float inner = planet_r - 0.03;
  float outer = planet_r + ember_reach;
  if (d < inner || d > outer) { fragColor = vec4(0.0); return; }

  // Densest at the silhouette, fading outward.
  float fall = clamp((1.0 - smoothstep(planet_r, outer, d)) + 0.15, 0.0, 1.0);

  vec2 cell = floor(uv * grid);
  float h = hash21(cell);
  if (h > density) { fragColor = vec4(0.0); return; }

  // Spark placed within its cell; distance measured in cell units.
  vec2 pos = (cell + 0.15 + 0.7 * hash22(cell + 7.0)) / grid;
  float pd = distance(uv, pos) * grid;
  float spark = smoothstep(0.5, 0.0, pd);

  float tw  = 0.45 + 0.55 * sin(time * time_speed + h * 6.2831);
  float lit = 1.0 - smoothstep(0.0, 1.4, distance(uv, light_origin));

  float intensity = spark * tw * fall * (0.4 + lit * 0.9);
  intensity = clamp(intensity, 0.0, 1.0);
  if (intensity <= 0.05) { fragColor = vec4(0.0); return; }

  vec4 col = colors[2];
  if (intensity > 0.35) col = colors[1];
  if (intensity > 0.70) col = colors[0];
  fragColor = vec4(col.rgb, intensity * col.a);
}`;
