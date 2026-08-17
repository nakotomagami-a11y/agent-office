/**
 * Lava ejecta shader — eruption plumes flung off the silhouette.
 *
 * The edge counterpart to the surface `explosions` layer, and the fiery answer
 * to the star's plasma corona/flares: instead of a steady plasma halo, chunks
 * of molten material erupt OUTWARD from vents around the rim, blooming into
 * turbulent plumes that stretch a little way into space and fade. Rendered
 * full-canvas on the oversized (2×) lava canvas so plumes have room outside the
 * disc.
 *
 * The rim is diced into angular sectors; only a minority are active vents, each
 * cycling ignite → erupt → fade on a staggered clock. An active vent grows a
 * plume from the silhouette outward; animated fbm churns the plume body and
 * frays its edges so it reads as ejected fire, not a smooth cone. Densest and
 * hottest right at the rim, tapering + cooling with distance.
 *
 * colors: [0] white-hot core, [1] yellow, [2] orange, [3] red.
 */
export const EJECTA_FRAG_SRC = /* glsl */`#version 300 es
precision mediump float;

uniform float pixels;
uniform float rotation;
uniform float time_speed;
uniform int   should_dither;
uniform vec4  colors[4];   // white core / yellow / orange / red
uniform float planet_r;    // disc radius in canvas UV
uniform float reach;       // how far plumes extend beyond the rim
uniform float sectors;     // number of eruption vents around the rim
uniform float size;
uniform int   OCTAVES;
uniform float seed;
uniform float time;
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

void main() {
  vec2 uv  = floor(UV * pixels) / pixels;
  vec2 rel = uv - vec2(0.5);
  float d  = length(rel);

  float inner = planet_r - 0.015;
  float outer = planet_r + reach;
  if (d < inner || d > outer) { fragColor = vec4(0.0); return; }
  bool dith = dither(UV, uv);

  // Angular sector around the rim (rotates with the planet so vents ride the
  // surface). Each sector is one potential eruption vent.
  float ang = atan(rel.y, rel.x) + rotation;
  float s   = ang / 6.2831853 + 0.5;
  float sec = floor(s * sectors);
  float sfrac = fract(s * sectors) - 0.5;           // -0.5..0.5 within sector

  float h = rand(vec2(sec, 4.0));
  if (h < 0.5) { fragColor = vec4(0.0); return; }   // dormant vent

  // Staggered eruption clock per vent.
  float rate  = 0.55 + rand(vec2(sec, 9.0)) * 0.7;
  float phase = fract(time * time_speed * rate + h);
  const float span = 0.6;
  if (phase > span) { fragColor = vec4(0.0); return; }
  float life = phase / span;                        // 0..1

  // Radial position beyond the rim, 0 at the silhouette → 1 at max reach.
  float rad = (d - planet_r) / reach;
  float len = 0.3 + 0.7 * life;                     // plume grows outward
  float rr  = clamp(rad / max(len, 0.001), 0.0, 1.0); // 0 at base → 1 at tip

  // Animated fbm churns the plume and frays its edges (more fray toward the tip).
  float turb = fbm(vec2(sfrac * 6.0 + sec * 13.0, rad * 4.0 - time * time_speed * 3.4));
  // Taper: wide at the rim, pinching to a point — a flame spike, not a block.
  float width   = mix(0.4, 0.04, rr);
  float wob     = (turb - 0.5) * 0.55 * (0.35 + rr);
  float angMask = smoothstep(width, width * 0.25, abs(sfrac) + wob);
  float radMask = smoothstep(len, len * 0.1, rad) * smoothstep(-0.04, 0.09, rad);
  float fade    = 1.0 - life * life;                // hold then fall off

  float v = angMask * radMask * fade * (0.35 + 0.95 * turb);
  // White-hot at the base, cooling to red as the ejecta flies out.
  v *= mix(1.5, 0.35, rr);
  v = clamp(v, 0.0, 1.0);
  if (v <= 0.06) { fragColor = vec4(0.0); return; }

  if (dith || should_dither == 0) v *= 1.18;
  vec4 col;
  if      (v > 0.72) col = colors[0];
  else if (v > 0.48) col = colors[1];
  else if (v > 0.26) col = colors[2];
  else               col = colors[3];
  fragColor = vec4(col.rgb, col.a);
}`;
