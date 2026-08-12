/**
 * Crater overlay shader.
 *
 * Draws craters on top of the rock layer. Each crater is built from two
 * circleNoise samples: one for the crater shape (c1) and a second offset
 * towards the light source (c2) for the shadow/highlight on the crater rim.
 *
 * The result is composited with alpha — pixels outside craters are
 * transparent so the rock layer below shows through.
 *
 * Port of Craters.gdshader.
 */
export const CRATERS_FRAG_SRC = /* glsl */`#version 300 es
precision mediump float;

uniform float pixels;
uniform float rotation;
uniform vec2  light_origin;
uniform float time_speed;
uniform float light_border;
uniform vec4  colors[2];
uniform float size;
uniform float seed;
uniform float time;
in  vec2 UV;
layout(location=0) out vec4 fragColor;

float rand(vec2 coord) {
  coord = mod(coord, vec2(1.0) * round(size));
  return fract(sin(dot(coord.xy, vec2(12.9898, 78.233))) * 15.5453 * seed);
}
float circleNoise(vec2 uv) {
  float uy = floor(uv.y); uv.x += uy * 0.31;
  vec2 f = fract(uv);
  float h = rand(vec2(floor(uv.x), floor(uy)));
  float m = length(f - 0.25 - h * 0.5);
  float r = h * 0.25;
  return smoothstep(r - 0.1*r, r, m);
}
float crater(vec2 uv) {
  float c = 1.0;
  for (int i = 0; i < 2; i++)
    c *= circleNoise((uv * size) + (float(i+1) + 10.0) + vec2(time * time_speed, 0.0));
  return 1.0 - c;
}
vec2 spherify(vec2 uv) {
  vec2 c = uv*2.0-1.0; float z = sqrt(1.0-dot(c,c)); return (c/(z+1.0))*0.5+0.5;
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
  uv = rotate(uv, rotation);
  uv = spherify(uv);
  float c1 = crater(uv);
  float c2 = crater(uv + (light_origin - 0.5) * 0.03);
  vec4 col = colors[0];
  a *= step(0.5, c1);
  if (c2 < c1 - (0.5 - d_light) * 2.0) col = colors[1];
  if (d_light > light_border) col = colors[1];
  a *= step(d_circle, 0.5);
  fragColor = vec4(col.rgb, a * col.a);
}`;
