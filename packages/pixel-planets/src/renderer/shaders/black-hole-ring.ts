/**
 * Black hole accretion ring shader.
 *
 * Renders the hot disc of plasma orbiting the black hole. The ring is drawn
 * on the full 3× oversized canvas (same as the body) and composited on top.
 *
 * Key effects:
 *  - `ring_perspective` (14.0) squishes the Y axis to make the disc look
 *    angled / tilted rather than perfectly circular.
 *  - The ring widens slightly on the upper and lower halves to simulate
 *    gravitational lensing bending the ring behind the disc.
 *  - An fbm noise field rotates with time, making the plasma look turbulent.
 *  - A `posterize` step with 4 levels gives the pixelated look.
 *
 * This shader is blended over the body, so the ring appears in front of (and
 * partially obscuring) the dark disc on the upper half.
 *
 * Port of BlackHoleRing.gdshader.
 */
export const BH_RING_FRAG_SRC = /* glsl */`#version 300 es
precision mediump float;

uniform float pixels;
uniform float rotation;
uniform float time_speed;
uniform float disk_width;
uniform float ring_perspective;
uniform int   should_dither;
uniform vec4  colors[5];       // posterised ring colors, bright → dark
uniform float size;
uniform int   OCTAVES;
uniform float seed;
uniform float time;
in  vec2 UV;
layout(location=0) out vec4 fragColor;

float rand(vec2 coord) {
  coord = mod(coord, vec2(2.0,1.0) * round(size));
  return fract(sin(dot(coord.xy, vec2(12.9898, 78.233))) * 15.5453 * seed);
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
bool dither(vec2 pix, vec2 real) {
  return mod(pix.x + real.y, 2.0/pixels) <= 1.0/pixels;
}
vec2 rotate(vec2 coord, float angle) {
  coord-=0.5; coord*=mat2(vec2(cos(angle),-sin(angle)),vec2(sin(angle),cos(angle))); return coord+0.5;
}
void main() {
  vec2 uv  = floor(UV * pixels) / pixels;
  bool dith = dither(UV, uv);
  uv = rotate(uv, rotation);
  vec2 uv2 = uv;
  // Widen slightly on X to reduce perfect-circle symmetry
  uv.x -= 0.5; uv.x *= 1.3; uv.x += 0.5;
  uv = rotate(uv, sin(time * time_speed * 2.0) * 0.01);
  vec2 l_origin = vec2(0.5);
  float d_width  = disk_width;
  // Perspective warp: upper/lower half shifts y inward, increasing ring width
  if (uv.y < 0.5) {
    uv.y      += smoothstep(distance(vec2(0.5), uv), 0.5, 0.2);
    d_width    += smoothstep(distance(vec2(0.5), uv), 0.5, 0.3);
    l_origin.y -= smoothstep(distance(vec2(0.5), uv), 0.5, 0.2);
  } else if (uv.y > 0.53) {
    uv.y      -= smoothstep(distance(vec2(0.5), uv), 0.4, 0.17);
    d_width    += smoothstep(distance(vec2(0.5), uv), 0.5, 0.2);
    l_origin.y += smoothstep(distance(vec2(0.5), uv), 0.5, 0.2);
  }
  float light_d  = distance(uv2 * vec2(1.0, ring_perspective), l_origin * vec2(1.0, ring_perspective)) * 0.3;
  vec2 uv_center = uv - vec2(0.0, 0.5);
  uv_center     *= vec2(1.0, ring_perspective);
  float center_d = distance(uv_center, vec2(0.5, 0.0));
  float disk     = smoothstep(0.1 - d_width*2.0, 0.5 - d_width, center_d);
  disk          *= smoothstep(center_d - d_width, center_d, 0.4);
  // Rotate the fbm in the ring plane over time for plasma turbulence
  uv_center = rotate(uv_center + vec2(0.0, 0.5), time * time_speed * 3.0);
  disk *= pow(max(fbm(uv_center * size), 0.0001), 0.5);
  if (dith || should_dither == 0) disk *= 1.2;
  // Posterise into 4 discrete color bands
  float n_post    = 4.0;
  float posterized = min(floor((disk + light_d) * n_post), n_post);
  vec4 col = colors[int(posterized)];
  fragColor = vec4(col.rgb, step(0.15, disk) * col.a);
}`;
