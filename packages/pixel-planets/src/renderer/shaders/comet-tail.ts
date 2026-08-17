/**
 * Comet tail shader.
 *
 * Draws a long fiery trail streaming off one side of the planet — the signature
 * of a blazing meteor/comet. The trail is a cone that starts narrow at the head,
 * widens and fades along a fixed axis (rotated by `rotation`, so the editor's
 * rotate slider aims the tail). An fbm field scrolls along the axis for flame
 * turbulence. Rendered in full-canvas UV on an oversized canvas so the tail has
 * length; meant to be composited FIRST, behind the molten head.
 *
 * colors[0] = hot white-yellow core, colors[1] = orange mid, colors[2] = deep
 * red outer wisp.
 */
export const COMET_TAIL_FRAG_SRC = /* glsl */`#version 300 es
precision mediump float;

uniform float pixels;
uniform float rotation;
uniform float time_speed;
uniform vec4  colors[3];
uniform float planet_r;    // head radius in canvas UV
uniform float tail_len;    // tail length in canvas UV
uniform float tail_spread; // how fast the tail widens along its axis
uniform float size;
uniform int   OCTAVES;
uniform float seed;
uniform float time;
in  vec2 UV;
layout(location=0) out vec4 fragColor;

float rand(vec2 c) {
  c = mod(c, vec2(1.0) * round(size));
  return fract(sin(dot(c, vec2(12.9898, 78.233))) * 15.5453 * seed);
}
float noise(vec2 c) {
  vec2 i = floor(c), f = fract(c);
  float a = rand(i), b = rand(i+vec2(1,0)), d = rand(i+vec2(0,1)), e = rand(i+vec2(1,1));
  vec2 u = f*f*(3.0-2.0*f);
  return mix(a,b,u.x)+(d-a)*u.y*(1.0-u.x)+(e-b)*u.x*u.y;
}
float fbm(vec2 c) {
  float v = 0.0, s = 0.5;
  for (int i = 0; i < OCTAVES; i++) { v += noise(c)*s; c *= 2.0; s *= 0.5; }
  return v;
}
vec2 rot(vec2 v, float a) {
  return mat2(cos(a), -sin(a), sin(a), cos(a)) * v;
}

void main() {
  vec2 uv  = floor(UV * pixels) / pixels;
  vec2 off = uv - vec2(0.5);

  // Tail axis (a fixed up-left diagonal, spun by rotation).
  vec2  dir   = rot(normalize(vec2(-0.5, -0.85)), rotation);
  float along = dot(off, dir);
  vec2  perp  = off - along * dir;
  float pd    = length(perp);

  if (along < 0.0 || along > tail_len) { fragColor = vec4(0.0); return; }
  float halfW = planet_r * 0.95 + along * tail_spread;
  if (pd > halfW) { fragColor = vec4(0.0); return; }

  float alongN  = along / tail_len;
  float lenFade = pow(1.0 - alongN, 0.7);             // brightest near the head
  float widFade = 1.0 - clamp(pd / halfW, 0.0, 1.0);  // fade to the tail edges

  // Turbulence flowing outward along the tail.
  float n = fbm(vec2(along * size * 1.5 - time * time_speed, pd * size * 3.0));

  float intensity = lenFade * pow(widFade, 0.7) * (0.62 + n * 0.65);
  intensity = clamp(intensity, 0.0, 1.0);
  if (intensity <= 0.04) { fragColor = vec4(0.0); return; }

  vec4 col = colors[2];
  if (intensity > 0.30) col = colors[1];
  if (intensity > 0.62) col = colors[0];
  fragColor = vec4(col.rgb, intensity * col.a);
}`;
