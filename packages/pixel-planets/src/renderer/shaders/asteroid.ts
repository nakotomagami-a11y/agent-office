/**
 * Asteroid shader — freeform irregular rocky mass.
 *
 * Unlike the sphere-based shaders, this does not clip to a circle. Instead,
 * the fbm noise field itself defines the shape: a pixel is visible where
 *   step(0.2, fbm(uv * size) - distance(uv, center)) > 0
 * — i.e. where the noise value exceeds the distance-from-center threshold.
 * This creates organic, non-circular outlines that look like rocks.
 *
 * Lighting is computed by sampling a second offset fbm and comparing it to
 * the first — the difference drives color selection between three tones.
 * Craters are added on top using a circleNoise pattern.
 *
 * Port of Asteroids.gdshader.
 */
export const ASTEROID_FRAG_SRC = /* glsl */`#version 300 es
precision mediump float;

uniform float pixels;
uniform float rotation;
uniform vec2  light_origin;
uniform int   should_dither;
uniform float size;
uniform int   OCTAVES;
uniform float seed;
uniform vec4  colors[3]; // mid / dark (shadow) / light (highlight)
in  vec2 UV;
layout(location=0) out vec4 fragColor;

float rand(vec2 coord) {
  coord = mod(coord, vec2(1.0) * round(size));
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
float circleNoise(vec2 uv) {
  float uy=floor(uv.y); uv.x+=uy*0.31;
  vec2 f=fract(uv);
  float h=rand(vec2(floor(uv.x),floor(uy)));
  float m=length(f-0.25-h*0.5);
  float r=h*0.25;
  return smoothstep(r-0.1*r, r, m);
}
float crater(vec2 uv) {
  float c=1.0;
  for(int i=0;i<2;i++) c*=circleNoise((uv*size)+(float(i+1)+10.0));
  return 1.0-c;
}
bool dither(vec2 uv1, vec2 uv2) {
  return mod(uv1.x+uv2.y, 2.0/pixels) <= 1.0/pixels;
}
vec2 rotate(vec2 coord, float angle) {
  coord-=0.5; coord*=mat2(vec2(cos(angle),-sin(angle)),vec2(sin(angle),cos(angle))); return coord+0.5;
}
void main() {
  vec2 uv  = floor(UV * pixels) / pixels;
  bool dith = dither(uv, UV);
  float d  = distance(uv, vec2(0.5));
  uv = rotate(uv, rotation);
  // n: main noise field — thresholded against d to produce the outline shape
  float n  = fbm(uv * size);
  // n2: light-offset noise for directional shading
  vec2 lo_rot = rotate(light_origin, rotation);
  float n2 = fbm(uv * size + (lo_rot - 0.5) * 0.5);
  float n_step  = step(0.2, n  - d);
  float n2_step = step(0.2, n2 - d);
  // noise_rel: positive = light side, negative = shadow side
  float noise_rel = (n2_step + n2) - (n_step + n);
  float c1 = crater(uv);
  float c2 = crater(uv + (light_origin - 0.5) * 0.03);
  vec4 col = colors[1];
  if (noise_rel < -0.06 || (noise_rel < -0.04 && (dith || should_dither==0))) col = colors[0];
  if (noise_rel >  0.05 || (noise_rel >  0.03 && (dith || should_dither==0))) col = colors[2];
  if (c1 > 0.4) col = colors[1];
  if (c2 < c1)  col = colors[2];
  fragColor = vec4(col.rgb, n_step * col.a);
}`;
