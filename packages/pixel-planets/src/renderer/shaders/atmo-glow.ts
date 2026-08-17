/**
 * Atmospheric glow / corona shader.
 *
 * Renders a soft, wispy halo of gas hugging the planet's circular edge —
 * the "toxic atmosphere" look: a coloured glow that peaks at the silhouette,
 * bleeds a little inward as rim-light and fades outward into space. It is
 * brightest on the lit hemisphere (toward `light_origin`) and textured by an
 * fbm field so the rim churns rather than being a clean gradient.
 *
 * Unlike the surface shaders this one works directly in full-canvas UV (no
 * disc remap): `planet_r` is the planet's radius in canvas UV and the glow
 * lives in the annulus [planet_r - inner bleed, planet_r + glow_width]. It is
 * meant to be composited ON TOP of the surface layers, on an oversized canvas
 * (canvasScale ≥ 2) so the outer corona has room to spread.
 *
 * colors[0] = bright inner rim, colors[1] = mid, colors[2] = faint outer fade.
 */
export const ATMO_GLOW_FRAG_SRC = /* glsl */`#version 300 es
precision mediump float;

uniform float pixels;
uniform float rotation;
uniform vec2  light_origin;
uniform float time_speed;
uniform vec4  colors[3];
uniform float planet_r;     // planet radius in canvas UV
uniform float glow_width;   // glow extent beyond planet_r
uniform float glow_strength;// overall intensity multiplier (Glow slider)
uniform float size;
uniform int   OCTAVES;
uniform float seed;
uniform float time;
in  vec2 UV;
layout(location=0) out vec4 fragColor;

float rand(vec2 coord) {
  coord = mod(coord, vec2(1.0) * round(size));
  return fract(sin(dot(coord.xy, vec2(12.9898, 78.233))) * 15.5453 * seed);
}
float noise(vec2 coord) {
  vec2 i = floor(coord), f = fract(coord);
  float a = rand(i), b = rand(i+vec2(1,0)), c = rand(i+vec2(0,1)), d = rand(i+vec2(1,1));
  vec2 u = f*f*(3.0-2.0*f);
  return mix(a,b,u.x)+(c-a)*u.y*(1.0-u.x)+(d-b)*u.x*u.y;
}
float fbm(vec2 coord) {
  float v = 0.0, s = 0.5;
  for (int i = 0; i < OCTAVES; i++) { v += noise(coord)*s; coord *= 2.0; s *= 0.5; }
  return v;
}
vec2 rotate(vec2 coord, float angle) {
  coord -= 0.5;
  coord *= mat2(vec2(cos(angle), -sin(angle)), vec2(sin(angle), cos(angle)));
  return coord + 0.5;
}

void main() {
  vec2 uv = floor(UV * pixels) / pixels;
  float d = distance(uv, vec2(0.5));
  float outer = planet_r + glow_width;
  if (d > outer) { fragColor = vec4(0.0); return; }

  // Radial profile: peak at the planet edge, fade to 0 outward, soft inner bleed.
  float outward = 1.0 - smoothstep(planet_r, outer, d);
  float inward  = smoothstep(planet_r - glow_width * 0.7, planet_r, d);
  float band    = outward * mix(0.20, 1.0, inward);

  // Brightest on the lit hemisphere.
  float lit = 1.0 - smoothstep(0.0, 1.5, distance(uv, light_origin));

  // Wispy angular turbulence around the rim.
  vec2 ruv = rotate(uv, rotation);
  float n  = fbm(ruv * size + vec2(time * time_speed, 0.0));

  float intensity = band * (0.30 + lit * 1.0) * (0.58 + n * 0.55) * glow_strength;
  intensity = clamp(intensity, 0.0, 1.0);
  if (intensity <= 0.02) { fragColor = vec4(0.0); return; }

  vec4 col = colors[2];
  if (intensity > 0.30) col = colors[1];
  if (intensity > 0.65) col = colors[0];
  fragColor = vec4(col.rgb, intensity * col.a);
}`;
