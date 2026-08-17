/**
 * Eclipse corona shader.
 *
 * The signature total-eclipse look, purpose-built rather than reusing the flat
 * atmo-glow rim: a dark body ringed by a thin "ring of fire", long irregular
 * corona STREAMERS fanning outward, and a bright "diamond ring" bead on the
 * light-facing edge. This is what turns a generic rim-lit disc into a proper
 * eclipse.
 *
 * Works in full-canvas UV (like atmo-glow): `planet_r` is the body radius in
 * canvas UV and the corona lives in the annulus [planet_r, planet_r + reach].
 * Composited ON TOP of the near-black rock body on an oversized canvas so the
 * streamers have room to spread.
 *
 * Streamer lengths are driven by noise sampled ON A CIRCLE (cos/sin of the
 * angle) so the field is naturally periodic — no seam at the ±x axis. A slow
 * animated octave makes the corona shimmer.
 *
 * colors[0] = hot rim / diamond, colors[1] = mid streamer, colors[2] = faint tip.
 */
export const ECLIPSE_CORONA_FRAG_SRC = /* glsl */`#version 300 es
precision mediump float;

uniform float pixels;
uniform float rotation;
uniform vec2  light_origin;
uniform float time_speed;
uniform vec4  colors[3];
uniform float planet_r;      // body radius in canvas UV
uniform float glow_width;    // corona reach beyond the rim
uniform float glow_strength; // overall intensity multiplier
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

void main() {
  vec2 uv = floor(UV * pixels) / pixels;
  vec2 dir = uv - vec2(0.5);
  float d = length(dir);
  float reach = glow_width;
  float outer = planet_r + reach;
  if (d > outer) { fragColor = vec4(0.0); return; }

  float ang = atan(dir.y, dir.x);
  vec2  ca  = vec2(cos(ang), sin(ang));   // point on unit circle → periodic noise
  vec2  ld  = normalize(light_origin - vec2(0.5) + 1e-5);

  // Ring of fire: a thin bright band right at the rim, with a touch of inner
  // rim-light spilling onto the dark body.
  float rimW  = max(reach * 0.10, 1.5 / pixels);
  float ring  = smoothstep(planet_r - rimW * 1.6, planet_r, d)
              * (1.0 - smoothstep(planet_r, planet_r + rimW, d));

  // Corona streamers: static broad rays + a finer animated shimmer, sampled on
  // the circle so they wrap seamlessly. Each angle gets its own outward reach.
  float rays  = fbm(ca * 9.0  + seed * 3.0);
  float rays2 = fbm(ca * 21.0 + vec2(0.0, time * time_speed * 0.6) + seed * 1.7);
  float streak = clamp(rays * 0.6 + rays2 * 0.6, 0.0, 1.2);
  float od = d - planet_r;                       // distance beyond the rim
  float corona = 0.0;
  if (od > 0.0) {
    float rayReach = reach * (0.10 + streak * streak * 1.5);
    // Longer, brighter streamers on the light-facing side (asymmetric corona).
    float lit = 0.6 + 0.4 * (dot(normalize(dir), ld) * 0.5 + 0.5);
    corona = (1.0 - smoothstep(0.0, rayReach, od)) * (0.30 + streak * 0.9) * lit;
  }

  // Diamond ring: a bright bead where the light grazes the rim.
  vec2 dpos = vec2(0.5) + ld * planet_r;
  float dd  = distance(uv, dpos);
  float diamond = 1.0 - smoothstep(0.0, planet_r * 0.16, dd);
  diamond = diamond * diamond * 1.5;

  float intensity = clamp((max(ring, corona) + diamond) * glow_strength, 0.0, 1.0);
  if (intensity <= 0.03) { fragColor = vec4(0.0); return; }

  vec4 col = colors[2];
  if (intensity > 0.32) col = colors[1];
  if (intensity > 0.66) col = colors[0];
  fragColor = vec4(col.rgb, intensity * col.a);
}`;
