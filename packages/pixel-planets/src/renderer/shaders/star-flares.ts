/**
 * Solar flares shader — outward spiky rays.
 *
 * Renders elongated spiky flares that radiate outward from the star disc.
 * Rendered on the full 2× canvas so flares can extend far outside the disc.
 *
 * Algorithm:
 *  1. Convert UV to polar coordinates (d = distance, angle = atan).
 *  2. fbm noise in polar space creates radially-varying turbulence.
 *  3. The jittered-grid `circle()` function in polar space creates blobs
 *     along rays — the 1/d factor concentrates them near the disc edge.
 *  4. A second fbm sample subtracts noise below a distance threshold,
 *     making the flares sparse near the center and fuller at the tips.
 *  5. Two color slots let the inner and outer parts of each flare differ.
 *
 * Port of StarFlares.gdshader.
 */
export const STAR_FLARES_FRAG_SRC = /* glsl */`#version 300 es
precision mediump float;

uniform float pixels;
uniform float time_speed;
uniform float rotation;
uniform int   should_dither;
uniform vec4  colors[2];   // inner flare / outer flare tint
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
float noise(vec2 coord) {
  vec2 i=floor(coord), f=fract(coord);
  float a=rand(i),b=rand(i+vec2(1,0)),c=rand(i+vec2(0,1)),d=rand(i+vec2(1,1));
  vec2 u=f*f*(3.0-2.0*f);
  return mix(a,b,u.x)+(c-a)*u.y*(1.0-u.x)+(d-b)*u.x*u.y;
}
float fbm(vec2 coord) {
  float v=0.0,s=0.5;
  for(int i=0;i<OCTAVES;i++){v+=noise(coord)*s;coord*=2.0;s*=0.5;}
  return v;
}
bool dither(vec2 uv1, vec2 uv2) {
  return mod(uv1.x + uv2.y, 2.0/pixels) <= 1.0/pixels;
}
vec2 rotate(vec2 v, float angle) {
  v -= 0.5;
  v *= mat2(vec2(cos(angle),-sin(angle)), vec2(sin(angle),cos(angle)));
  return v + 0.5;
}
float circle(vec2 uv) {
  const float ca = 2.0, cs = 1.0;
  float inv = 1.0 / ca;
  if (mod(uv.y, inv*2.0) < inv) uv.x += inv * 0.5;
  vec2 rc = floor(uv * ca) / ca;
  uv = mod(uv, inv) * ca;
  float r  = rand(rc);
  r = clamp(r, inv, 1.0 - inv);
  float ci = distance(uv, vec2(r));
  return smoothstep(ci, ci + 0.5, inv * cs * rand(rc * 1.5));
}
void main() {
  vec2 pix = floor(UV * pixels) / pixels;
  bool dith = dither(UV, pix);
  pix = rotate(pix, rotation);
  float angle = atan(pix.x - 0.5, pix.y - 0.5) * 0.4; // compress angular freq
  float d     = distance(pix, vec2(0.5));
  vec2 cuv    = vec2(d, angle);
  float n     = fbm(cuv * size - time * time_speed);
  float nc    = circle(cuv - time * time_speed + n);
  nc *= 1.5;
  float n2 = fbm(cuv * size - time + vec2(100.0, 100.0));
  nc -= n2 * 0.1;
  float a = 0.0;
  if (1.0 - d > nc) {
    if (nc > 0.3 + d && (dith || should_dither == 0)) a = 1.0;
    else if (nc > 0.3 + d) a = 1.0;
  }
  int idx = int(clamp(floor(n2 + nc), 0.0, 1.0));
  vec4 col = colors[idx];
  a *= step(n2 * 0.25, d); // suppress flares very close to disc center
  fragColor = vec4(col.rgb, a * col.a);
}`;
