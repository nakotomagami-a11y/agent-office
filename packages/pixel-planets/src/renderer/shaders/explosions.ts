/**
 * Lava eruptions shader.
 *
 * Scatters bright bursting fireballs across the molten surface — the "volcanic
 * world is erupting" look. A cousin of the star shaders (organic fbm texture,
 * posterized hot color bands, dithered edges) but localized: each eruption is a
 * turbulent expanding fireball mapped ONTO the rotating sphere and clipped to
 * the planet disc, rather than an outward corona.
 *
 * Each eruption "vent" lives in a jittered surface cell; only a minority are
 * active. An active vent runs a staggered cycle: ignite → a churning fbm-warped
 * fireball blooms outward and fades. The interior is textured by animated fbm
 * (not a flat fill) and the edge is irregular, so it reads as fire, not a
 * clean disc. colors: [0] white-hot core, [1] yellow, [2] orange, [3] red.
 *
 * Sphere space (rotate → spherify) matches rock/lava-rivers so eruptions travel
 * with the surface. Lava is canvasScale=1 (disc fills the canvas, center 0.5).
 */
export const EXPLOSIONS_FRAG_SRC = /* glsl */`#version 300 es
precision mediump float;

uniform float pixels;
uniform float rotation;
uniform vec2  light_origin;
uniform float time_speed;
uniform int   should_dither;
uniform vec4  colors[4];   // white core / yellow / orange / red
uniform float grid;        // eruption-site cell count across the disc
uniform float size;
uniform int   OCTAVES;
uniform float seed;
uniform float time;
uniform float uv_offset;   // remap for oversized canvas (0 when canvasScale=1)
uniform float uv_scale;    // = 1/(2*planetR) (1 when canvasScale=1)
in  vec2 UV;
layout(location=0) out vec4 fragColor;

float rand(vec2 co) {
  co = mod(co, vec2(1.0) * round(size));
  return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 15.5453 * seed);
}
float noise(vec2 c) {
  vec2 i = floor(c), f = fract(c);
  float a = rand(i), b = rand(i + vec2(1, 0)), cc = rand(i + vec2(0, 1)), d = rand(i + vec2(1, 1));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u.x) + (cc - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}
float fbm(vec2 c) {
  float v = 0.0, s = 0.5;
  for (int i = 0; i < OCTAVES; i++) { v += noise(c) * s; c *= 2.0; s *= 0.5; }
  return v;
}
bool dither(vec2 uv1, vec2 uv2) {
  return mod(uv1.x + uv2.y, 2.0 / pixels) <= 1.0 / pixels;
}
vec2 spherify(vec2 uv) {
  vec2 c = uv * 2.0 - 1.0; float z2 = 1.0 - dot(c, c);
  if (z2 < 0.0) return uv;
  return (c / (sqrt(z2) + 1.0)) * 0.5 + 0.5;
}
vec2 rotate(vec2 coord, float angle) {
  coord -= 0.5;
  coord *= mat2(vec2(cos(angle), -sin(angle)), vec2(sin(angle), cos(angle)));
  return coord + 0.5;
}

void main() {
  vec2 uv_raw = floor(UV * pixels) / pixels;
  vec2 uv = (uv_raw - uv_offset) * uv_scale;   // remap disc region to [0,1]
  float d_circle = distance(uv, vec2(0.5));
  if (d_circle > 0.49999) { fragColor = vec4(0.0); return; }
  bool dith = dither(uv_raw, uv);

  // Map onto the rotating sphere so eruptions sit on and travel with the surface.
  vec2 suv = rotate(uv, rotation);
  suv = spherify(suv);

  // Dice the surface into eruption cells; only a minority are active vents.
  vec2 cell = floor(suv * grid);
  float h = rand(cell + 0.5);
  if (h < 0.60) { fragColor = vec4(0.0); return; }

  // Per-vent randomness for position, cadence, lifespan, size and shape — every
  // vent behaves differently so the field never reads as a repeating pattern.
  float rv1 = rand(cell + 1.3);
  float rv2 = rand(cell + 2.7);
  float rv3 = rand(cell + 7.1);
  float rv4 = rand(cell + 4.9);
  vec2 site  = (cell + 0.28 + 0.44 * vec2(rv1, rv2)) / grid;
  float rate  = 0.55 + rv3 * 1.1;                    // wide spread of cycle speeds
  float phase = fract(time * time_speed * rate + h * 3.17);

  // Flash cycle with a per-vent span so pops aren't synchronized in duration.
  float span = 0.26 + rv4 * 0.22;
  if (phase > span) { fragColor = vec4(0.0); return; }
  float life = phase / span;               // 0 -> 1 across the eruption

  // Per-vent peak size — most pops are small, only a few bloom large.
  float vsize = 0.34 + rv1 * rv2 * 0.72;

  // Local coords in "cell" units; radius grows as the fireball blooms.
  vec2 rel   = (suv - site) * grid;
  float dist = length(rel);
  float radius = (0.05 + 0.33 * life) * vsize;

  // Animated fbm turbulence — churns the interior AND warps the edge so the
  // fireball is an irregular flame blob, not a clean circle. Higher frequency +
  // per-vent seed offset gives each pop its own flickering tendrils.
  float turb  = fbm(rel * 4.2 + vec2(time * time_speed * 3.0, h * 9.0 + rv3 * 5.0));
  float edge  = radius * (0.55 + 0.85 * (turb - 0.5));
  float ball  = smoothstep(edge, edge * 0.1, dist);

  // Punchy fast attack, quick decay so pops flash rather than linger.
  float fade  = (1.0 - life) * (1.0 - life * 0.4);
  float v = ball * fade * (0.55 + 0.7 * turb);
  v = clamp(v, 0.0, 1.0);
  if (v <= 0.06) { fragColor = vec4(0.0); return; }

  // Posterize into 4 hot bands, with dithered band boundaries (star-style).
  if (dith || should_dither == 0) v *= 1.18;
  vec4 col;
  if      (v > 0.74) col = colors[0];
  else if (v > 0.50) col = colors[1];
  else if (v > 0.28) col = colors[2];
  else               col = colors[3];
  fragColor = vec4(col.rgb, col.a);
}`;
