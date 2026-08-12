/**
 * Rocky planet surface shader.
 *
 * Produces a smooth rocky sphere with two lit zones (highlight / shadow)
 * separated by dithered borders. Used as the base layer for the rocky,
 * islands, and lava planet types.
 *
 * Dithering: a checker pattern aligned to the pixel grid creates a half-tone
 * transition band at each light border. This gives the characteristic
 * pixel-art dithering look without a true ordered dither matrix.
 *
 * Port of NoAtmosphere.gdshader.
 */
export const ROCK_FRAG_SRC = /* glsl */`#version 300 es
precision mediump float;

uniform float pixels;
uniform float rotation;
uniform vec2  light_origin;
uniform float time_speed;
uniform float dither_size;
uniform float light_border_1;
uniform float light_border_2;
uniform vec4  colors[3];
uniform float size;
uniform int   OCTAVES;
uniform float seed;
uniform float time;
uniform int   should_dither;
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
  float v=0.0,s=0.5;
  for(int i=0;i<OCTAVES;i++){v+=noise(coord)*s;coord*=2.0;s*=0.5;}
  return v;
}
bool dither(vec2 uv1, vec2 uv2) {
  return mod(uv1.x + uv2.y, 2.0/pixels) <= 1.0/pixels;
}
vec2 rotate(vec2 coord, float angle) {
  coord -= 0.5;
  coord *= mat2(vec2(cos(angle),-sin(angle)), vec2(sin(angle),cos(angle)));
  return coord + 0.5;
}
void main() {
  vec2 uv = floor(UV * pixels) / pixels;
  float d_circle = distance(uv, vec2(0.5));
  float d_light  = distance(uv, light_origin);
  float a = step(d_circle, 0.49999);
  bool dith = dither(uv, UV);
  uv = rotate(uv, rotation);
  float fbm1 = fbm(uv);
  d_light += fbm(uv * size + fbm1 + vec2(time * time_speed, 0.0)) * 0.3;
  float dither_border = (1.0/pixels) * dither_size;
  vec4 col = colors[0];
  if (d_light > light_border_1) {
    col = colors[1];
    if (d_light < light_border_1 + dither_border && (dith || should_dither == 0)) col = colors[0];
  }
  if (d_light > light_border_2) {
    col = colors[2];
    if (d_light < light_border_2 + dither_border && (dith || should_dither == 0)) col = colors[1];
  }
  fragColor = vec4(col.rgb, a * col.a);
}`;
