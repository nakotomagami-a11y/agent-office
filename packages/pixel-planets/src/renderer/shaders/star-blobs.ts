/**
 * Star blob corona shader — loose halo of circular blobs.
 *
 * Creates an organic-looking corona of overlapping circular blobs that drift
 * outward from the star body. Rendered on the full 2× canvas so they can
 * extend well outside the star disc boundary.
 *
 * The `circle()` function places randomly-sized circles on a jittered grid
 * (offset by `mod(row, 2)` for hex packing). Accumulating 15 such circles
 * with different offsets produces a fuzzy blob field. Pixels are visible only
 * where the accumulated value — minus distance from center — exceeds 0.07.
 *
 * Port of StarBlobs.gdshader.
 */
export const STAR_BLOBS_FRAG_SRC = /* glsl */`#version 300 es
precision mediump float;

uniform float pixels;
uniform float time_speed;
uniform float rotation;
uniform vec4  colors[1];  // single tint color for all blobs
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
vec2 rotate(vec2 v, float angle) {
  v -= 0.5;
  v *= mat2(vec2(cos(angle),-sin(angle)), vec2(sin(angle),cos(angle)));
  return v + 0.5;
}
// Jittered-grid circle field: for each cell, pick a random radius and
// smoothstep into it. The hex offset (mod row) prevents grid aliasing.
float circle(vec2 uv) {
  const float ca = 2.0, cs = 1.0;
  float inv = 1.0 / ca;
  if (mod(uv.y, inv*2.0) < inv) uv.x += inv * 0.5; // hex row offset
  vec2 rc = floor(uv * ca) / ca;
  uv = mod(uv, inv) * ca;
  float r  = rand(rc);
  r = clamp(r, inv, 1.0 - inv);
  float ci = distance(uv, vec2(r));
  return smoothstep(ci, ci + 0.5, inv * cs * rand(rc * 1.5));
}
void main() {
  vec2 pix = floor(UV * pixels) / pixels;
  vec2 uv  = rotate(pix, rotation);
  float angle = atan(uv.x - 0.5, uv.y - 0.5);
  float d     = distance(pix, vec2(0.5));
  float c = 0.0;
  for (int i = 0; i < 15; i++) {
    float r    = rand(vec2(float(i)));
    vec2  cuv  = vec2(d, angle);
    c += circle(cuv * size - time * time_speed - (1.0 / max(d, 0.001)) * 0.1 + r);
  }
  c *= 0.37 - d;
  c  = step(0.07, c - d);
  fragColor = vec4(colors[0].rgb, c * colors[0].a);
}`;
